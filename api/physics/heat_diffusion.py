"""
一维热扩散偏微分方程求解器（变系数版）
=================================================

求解方程：∂T/∂t = ∂/∂x [α(x) ∂T/∂x] + Q(x) − h_v·(T − T_amb)

支持位置相关的热扩散系数 α(x)，可模拟材质瑕疵（鸟粪、裂纹等导致的局部
热传导系数降低）。

变系数离散采用**有限体积法 + 调和平均界面系数**，在瑕疵区域系数突变时
保持数值稳定性和守恒性。

大规模 / 长时间仿真优化：
  1. **双方法路由**：
     - 规模小：沿用 SciPy `solve_ivp` (RK45)，精度高
     - 规模大：Backward-Euler 全隐式 + `scipy.linalg.solve_banded`
       无条件 A-稳定，无寄生振荡，大步长推进
  2. 求解过程支持 `progress_cb` 回调与 `cancel_event`
  3. 向量化 RHS，消除 Python 层循环
  4. 稀疏三对角矩阵求解（带宽仅 1），O(N) 复杂度
"""

from __future__ import annotations
from dataclasses import dataclass
import numpy as np
from scipy.integrate import solve_ivp
from scipy.linalg import solve_banded
from typing import Callable, Optional


ProgressCb = Callable[[float, str], None]


@dataclass
class DiffusionConfig:
    length: float
    nodes: int
    alpha: np.ndarray        # 位置相关热扩散系数 (N,)
    h_surf: float           # 表面对流换热系数 W/m²·K
    rho_c: float            # 体积热容 J/m³·K
    h_volumetric: float     # 体积散热系数 s⁻¹
    ambient_temp: float


# ---------------------------------------------------------------------------
# 辅助：界面热扩散系数（调和平均，适用于变系数突变场景）
# ---------------------------------------------------------------------------
def _harmonic_interface_alpha(alpha: np.ndarray) -> np.ndarray:
    """
    计算节点界面 i+½ 处的调和平均热扩散系数：
        α_{i+½} = 2 * α_i * α_{i+1} / (α_i + α_{i+1})

    当相邻节点导热系数差异较大（比如瑕疵区域），调和平均比算术平均
    在物理上更准确，保证热流守恒。

    返回 shape = (N-1,)，其中 result[i] = α_{i+½}
    """
    return 2.0 * alpha[:-1] * alpha[1:] / (alpha[:-1] + alpha[1:] + 1e-300)


# ---------------------------------------------------------------------------
# SciPy solve_ivp 向量化 RHS（保留高精度模式，支持变系数）
# ---------------------------------------------------------------------------
def _build_rhs_vectorized(config: DiffusionConfig, Q: np.ndarray):
    """向量化构造 ODE 右手边：避免对 Python 循环依赖。"""
    dx = config.length / (config.nodes - 1)
    dx2 = dx * dx
    N = config.nodes
    T_amb = config.ambient_temp
    alpha = config.alpha
    h_v = config.h_volumetric
    h_surf = config.h_surf
    rho_c = config.rho_c

    # 预计算界面 α_{i+½}
    alpha_iface = _harmonic_interface_alpha(alpha)  # (N-1,)

    # 边界 Robin 系数
    s0 = 2.0 * h_surf / (rho_c * dx)   # 左边界对流项系数
    sN = 2.0 * h_surf / (rho_c * dx)   # 右边界对流项系数

    def rhs(t, T):
        dT = np.empty_like(T)
        # 内部节点 (1..N-2)：
        #   dT[i]/dt = [α_{i-½}·(T[i-1] - T[i]) + α_{i+½}·(T[i+1] - T[i])] / dx²
        #             + Q[i] - h_v·(T[i] - T_amb)
        dT[1:-1] = (
            alpha_iface[:-1] * (T[:-2] - T[1:-1])
            + alpha_iface[1:] * (T[2:] - T[1:-1])
        ) / dx2 + Q[1:-1] - h_v * (T[1:-1] - T_amb)

        # 左边界 i=0（半节点法）：
        #   dT[0]/dt = 2·α_{½}/dx²·(T[1] - T[0])
        #              + s0·(T_amb - T[0]) + Q[0] - h_v·(T[0] - T_amb)
        dT[0] = (
            2.0 * alpha_iface[0] / dx2 * (T[1] - T[0])
            + s0 * (T_amb - T[0])
            + Q[0]
            - h_v * (T[0] - T_amb)
        )

        # 右边界 i=N-1（半节点法）：
        #   dT[N-1]/dt = 2·α_{N-3/2}/dx²·(T[N-2] - T[N-1])
        #                + sN·(T_amb - T[N-1]) + Q[N-1] - h_v·(T[N-1] - T_amb)
        dT[-1] = (
            2.0 * alpha_iface[-1] / dx2 * (T[-2] - T[-1])
            + sN * (T_amb - T[-1])
            + Q[-1]
            - h_v * (T[-1] - T_amb)
        )
        return dT

    return rhs


# ---------------------------------------------------------------------------
# Backward-Euler 全隐式推进（大规模用，支持变系数）
# ---------------------------------------------------------------------------
def _build_backward_euler_system(config: DiffusionConfig, Q: np.ndarray, dt: float):
    """
    组装全隐式 Backward-Euler 三对角系统（变系数）：

        A * T_{n+1} = T_n + dt·Q + dt·T_amb·(h_v + s_boundary)

    记 α_iface[i] = α_{i+½}，

    内部节点 i ∈ [1, N-2]：
        - dt·α_{i-½}/dx² · T_{i-1}
        + [1 + dt·(α_{i-½}+α_{i+½})/dx² + dt·h_v] · T_i
        - dt·α_{i+½}/dx² · T_{i+1}
            = T_i^n + dt·Q_i + dt·h_v·T_amb

    左边界 i=0：
        [1 + 2dt·α_{½}/dx² + dt·(s0 + h_v)] · T_0
        - 2dt·α_{½}/dx² · T_1
            = T_0^n + dt·Q_0 + dt·T_amb·(h_v + s0)
        其中 s0 = 2·h_surf/(ρ_c·dx)

    右边界 i=N-1：
        [1 + 2dt·α_{N-3/2}/dx² + dt·(sN + h_v)] · T_{N-1}
        - 2dt·α_{N-3/2}/dx² · T_{N-2}
            = T_{N-1}^n + dt·Q_{N-1} + dt·T_amb·(h_v + sN)
        其中 sN = 2·h_surf/(ρ_c·dx)

    返回 (A_banded, C_vec)，A_banded 为 solve_banded((l=1, u=1)) 所需的
    (3, N) 存储格式：
        ab[u + i - j, j] == A[i, j]
      即：
        ab[0, j]  对应 A[j-1, j]  （上对角，j>=1）
        ab[1, j]  对应 A[j, j]    （主对角）
        ab[2, j]  对应 A[j+1, j]  （下对角，j<=N-2）
    """
    dx = config.length / (config.nodes - 1)
    dx2 = dx * dx
    N = config.nodes
    T_amb = config.ambient_temp
    alpha = config.alpha
    h_v = config.h_volumetric
    h_surf = config.h_surf
    rho_c = config.rho_c

    # 界面 α_{i+½}
    alpha_iface = _harmonic_interface_alpha(alpha)  # (N-1,)

    # 边界 Robin 系数
    s0 = 2.0 * h_surf / (rho_c * dx)
    sN = 2.0 * h_surf / (rho_c * dx)

    # solve_banded((l=1, u=1), ab, b)
    #   ab[0, j] = A[j-1, j]   (上对角，j from 1..N-1)
    #   ab[1, j] = A[j, j]     (主对角)
    #   ab[2, j] = A[j+1, j]   (下对角，j from 0..N-2)
    A_banded = np.zeros((3, N), dtype=float)
    C_vec = np.zeros(N, dtype=float)

    # 公共项 r_i = α_{i+½}/dx²
    r = alpha_iface / dx2   # (N-1,)

    # --- 左边界 i=0 ---
    # A[0,0] = 1 + 2·dt·r[0] + dt·(s0 + h_v)
    # A[0,1] = -2·dt·r[0]
    A_banded[1, 0] = 1.0 + 2.0 * dt * r[0] + dt * (s0 + h_v)
    A_banded[0, 1] = -2.0 * dt * r[0]
    C_vec[0] = dt * Q[0] + dt * T_amb * (h_v + s0)

    # --- 内部节点 i ∈ [1, N-2] ---
    # A[i,i-1] = -dt·r[i-1]          → ab[2, i-1]
    # A[i,i]   = 1 + dt·(r[i-1]+r[i]) + dt·h_v → ab[1, i]
    # A[i,i+1] = -dt·r[i]            → ab[0, i+1]
    for i in range(1, N - 1):
        A_banded[2, i - 1] = -dt * r[i - 1]
        A_banded[1, i] = 1.0 + dt * (r[i - 1] + r[i]) + dt * h_v
        A_banded[0, i + 1] = -dt * r[i]
        C_vec[i] = dt * Q[i] + dt * h_v * T_amb

    # --- 右边界 i=N-1 ---
    # A[N-1,N-1] = 1 + 2·dt·r[N-2] + dt·(sN + h_v)
    # A[N-1,N-2] = -2·dt·r[N-2]        → ab[2, N-2]
    A_banded[1, N - 1] = 1.0 + 2.0 * dt * r[-1] + dt * (sN + h_v)
    A_banded[2, N - 2] = -2.0 * dt * r[-1]
    C_vec[N - 1] = dt * Q[N - 1] + dt * T_amb * (h_v + sN)

    return A_banded, C_vec


# ---------------------------------------------------------------------------
# 统一入口：solve_heat_diffusion
# ---------------------------------------------------------------------------
def solve_heat_diffusion(
    config: DiffusionConfig,
    Q: np.ndarray,
    total_time: float,
    time_step: float | None = None,
    progress_cb: Optional[ProgressCb] = None,
    cancel_event=None,
):
    """
    统一入口，自动根据规模选择求解器：
      - nodes * n_frames < 50_000：SciPy solve_ivp (RK45) 高精度
      - 否则：Backward-Euler 隐式，无条件稳定、大步长推进
    """
    assert Q.shape == (config.nodes,)
    assert config.alpha.shape == (config.nodes,)
    N = config.nodes
    x_coords = np.linspace(0.0, config.length, N)

    if time_step is None or time_step <= 0:
        n_frames = 60
    else:
        n_frames = max(2, int(np.ceil(total_time / time_step)) + 1)

    time_coords = np.linspace(0.0, total_time, n_frames)
    T0 = np.full(N, config.ambient_temp, dtype=float)

    # 规模估计
    work_estimate = N * n_frames
    use_implicit = work_estimate > 50_000 or N >= 200 or n_frames >= 300

    if progress_cb:
        # 统计瑕疵点信息用于展示
        alpha = config.alpha
        min_alpha_ratio = alpha.min() / alpha.max() if alpha.max() > 0 else 1.0
        n_defects = np.sum(alpha < alpha.max() * 0.99)
        extra = f"，{n_defects} 个瑕疵点" if n_defects > 0 else ""
        progress_cb(
            0.02,
            f"初始化求解器 ({'Backward-Euler 全隐式' if use_implicit else 'RK45 自适应'}{extra})",
        )

    if use_implicit:
        T_matrix = _solve_implicit(
            config, Q, total_time, time_coords, T0,
            progress_cb=progress_cb, cancel_event=cancel_event,
        )
    else:
        T_matrix = _solve_explicit_ivp(
            config, Q, total_time, time_coords, T0,
            progress_cb=progress_cb, cancel_event=cancel_event,
        )

    if progress_cb:
        progress_cb(1.0, "求解完成")
    return T_matrix, x_coords, time_coords


def _solve_explicit_ivp(config, Q, total_time, time_coords, T0,
                        progress_cb=None, cancel_event=None):
    """SciPy RK45 求解（默认高精度模式，支持变系数）"""
    rhs = _build_rhs_vectorized(config, Q)

    if progress_cb is None and cancel_event is None:
        sol = solve_ivp(
            rhs, (0.0, total_time), T0,
            method="RK45", t_eval=time_coords,
            rtol=1e-5, atol=1e-7,
        )
        if not sol.success:
            raise RuntimeError(f"Heat diffusion solver failed: {sol.message}")
        return sol.y.T

    # 有进度/取消需求：分块推进，每块单独 solve_ivp
    n_total = len(time_coords)
    n_chunks = max(1, min(20, n_total // 5))
    chunk_size = (n_total + n_chunks - 1) // n_chunks
    T_frames = np.empty((n_total, config.nodes), dtype=float)
    T_frames[0] = T0.copy()

    T_current = T0.copy()
    for c in range(n_chunks):
        if cancel_event is not None and cancel_event.is_set():
            return T_frames[: max(c * chunk_size + 1, 1)]

        i0 = c * chunk_size
        i1 = min((c + 1) * chunk_size, n_total)
        if i1 - i0 < 2:
            break
        t_eval = time_coords[i0:i1]
        sol = solve_ivp(
            rhs, (t_eval[0], t_eval[-1]), T_current,
            method="RK45", t_eval=t_eval,
            rtol=1e-5, atol=1e-7,
        )
        if not sol.success:
            raise RuntimeError(f"Heat diffusion solver failed: {sol.message}")
        part = sol.y.T  # (n_eval, N)
        T_frames[i0:i1] = part
        T_current = part[-1].copy()

        if progress_cb:
            progress_cb(
                0.05 + 0.92 * (i1 / n_total),
                f"时间推进 {i1}/{n_total} 帧 ({t_eval[-1]:.1f}s)",
            )

    return T_frames


def _solve_implicit(config, Q, total_time, time_coords, T0,
                    progress_cb=None, cancel_event=None):
    """全隐式 Backward-Euler 求解（大规模 / 长时间演化用，A-稳定无振荡）"""
    N = config.nodes
    n_frames = len(time_coords)
    T_frames = np.empty((n_frames, N), dtype=float)
    T_frames[0] = T0.copy()

    # 对每个输出步再做若干内步，保证精度
    output_dt = time_coords[1] - time_coords[0] if n_frames > 1 else total_time
    inner_steps = max(1, int(np.ceil(output_dt / max(5.0, output_dt * 0.1))))
    inner_dt = output_dt / inner_steps

    A_banded, C_vec = _build_backward_euler_system(config, Q, inner_dt)

    T_current = T0.copy()
    for k in range(1, n_frames):
        if cancel_event is not None and cancel_event.is_set():
            return T_frames[: k]

        for _ in range(inner_steps):
            rhs = T_current + C_vec
            # solve_banded(l_and_u=(1, 1), ab, b)
            T_current = solve_banded((1, 1), A_banded, rhs)

        T_frames[k] = T_current

        if progress_cb and (k % max(1, n_frames // 40) == 0 or k == n_frames - 1):
            progress_cb(
                0.05 + 0.92 * (k / (n_frames - 1)),
                f"时间推进 {k}/{n_frames - 1} ({time_coords[k]:.0f}s / {total_time:.0f}s)",
            )

    return T_frames
