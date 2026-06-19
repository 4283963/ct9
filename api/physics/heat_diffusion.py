"""
一维热扩散偏微分方程求解器（优化版）
=================================================

求解方程：∂T/∂t = α ∂²T/∂x² + Q(x) - h_v * (T - T_amb)

针对大规模 / 长时间仿真的优化：
  1. **双方法路由**：
     - 规模小：沿用 SciPy `solve_ivp` (RK45)，精度高
     - 规模大：切换到 Crank-Nicolson 隐式格式 + `scipy.linalg.solve_banded`
       对长时间步长无条件稳定，大幅减少推进步数
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
    alpha: float
    h_over_k: float
    h_volumetric: float
    ambient_temp: float


# ---------------------------------------------------------------------------
# SciPy solve_ivp 向量化 RHS（保留高精度模式）
# ---------------------------------------------------------------------------
def _build_rhs_vectorized(config: DiffusionConfig, Q: np.ndarray):
    """向量化构造 ODE 右手边：避免对 Python 循环依赖。"""
    dx = config.length / (config.nodes - 1)
    dx2 = dx * dx
    N = config.nodes
    hk = config.h_over_k
    T_amb = config.ambient_temp
    alpha = config.alpha
    h_v = config.h_volumetric

    def rhs(t, T):
        dT = np.empty_like(T)
        # 内部节点 (1..N-2)
        dT[1:-1] = (
            alpha * (T[2:] - 2.0 * T[1:-1] + T[:-2]) / dx2
            + Q[1:-1]
            - h_v * (T[1:-1] - T_amb)
        )
        # 边界：Robin 条件虚拟节点
        T_left_virtual = (T[1] + hk * dx * T_amb) / (1.0 + hk * dx)
        dT[0] = (
            alpha * (T[1] - 2.0 * T[0] + T_left_virtual) / dx2
            + Q[0]
            - h_v * (T[0] - T_amb)
        )
        T_right_virtual = (T[-2] + hk * dx * T_amb) / (1.0 + hk * dx)
        dT[-1] = (
            alpha * (T[-2] - 2.0 * T[-1] + T_right_virtual) / dx2
            + Q[-1]
            - h_v * (T[-1] - T_amb)
        )
        return dT

    return rhs


# ---------------------------------------------------------------------------
# Crank-Nicolson 隐式推进（大规模 / 长时间演化用）
# ---------------------------------------------------------------------------
def _build_backward_euler_system(config: DiffusionConfig, Q: np.ndarray, dt: float):
    """
    组装全隐式 Backward-Euler 三对角系统：

        (I - dt·L + dt·h_v·I) T_{n+1} = T_n + dt·Q + dt·h_v·T_amb

    其中 L(T) = α ∂²T/∂x²（含 Robin 边界虚拟节点嵌入）。

    Backward Euler 对任意 dt 绝对稳定（A-稳定），且无 Crank-Nicolson
    特有的高波数寄生振荡，非常适合长时间 / 大步长演化。

    记 r̃ = α·dt/dx², s̃ = h_v·dt,
        a = 1/(1+hk·dx),  b = a·hk·dx

    内部节点 (1..N-2):
        (1+2r̃+s̃) T_i  -  r̃ T_{i-1}  -  r̃ T_{i+1}
            = T_i^n  +  dt·Q_i  +  s̃·T_amb

    左边界 (i=0):
        (1+2r̃+s̃) T_0  -  r̃(1+a) T_1
            = T_0^n  +  dt·Q_0  +  s̃·T_amb  +  r̃·b·T_amb

    右边界 (i=N-1):
        (1+2r̃+s̃) T_{N-1}  -  r̃(1+a) T_{N-2}
            = T_{N-1}^n  +  dt·Q_{N-1}  +  s̃·T_amb  +  r̃·b·T_amb

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
    hk = config.h_over_k
    T_amb = config.ambient_temp
    alpha = config.alpha
    h_v = config.h_volumetric
    r = alpha * dt / dx2      # r̃
    s = h_v * dt              # s̃

    a_rb = 1.0 / (1.0 + hk * dx)
    b_rb = a_rb * hk * dx
    one_plus_a = 1.0 + a_rb

    # solve_banded((l=1, u=1), ab, b)
    #   ab[0, j] = A[j-1, j]   (上对角，j from 1..N-1)
    #   ab[1, j] = A[j, j]     (主对角)
    #   ab[2, j] = A[j+1, j]   (下对角，j from 0..N-2)
    A_banded = np.zeros((3, N), dtype=float)
    C_vec = np.zeros(N, dtype=float)

    diag_center = 1.0 + 2.0 * r + s

    # 内部节点 i in [1, N-2]
    #   A[i, i-1] = -r       → ab[2, i-1]
    #   A[i, i]   = 1+2r+s   → ab[1, i]
    #   A[i, i+1] = -r       → ab[0, i+1]
    for i in range(1, N - 1):
        A_banded[2, i - 1] = -r
        A_banded[1, i] = diag_center
        A_banded[0, i + 1] = -r
        C_vec[i] = s * T_amb + dt * Q[i]

    # 左边界 i=0
    #   A[0, 0] = 1+2r+s             → ab[1, 0]
    #   A[0, 1] = -r * (1+a)         → ab[0, 1]
    A_banded[1, 0] = diag_center
    A_banded[0, 1] = -r * one_plus_a
    C_vec[0] = s * T_amb + dt * Q[0] + r * b_rb * T_amb

    # 右边界 i=N-1
    #   A[N-1, N-1] = 1+2r+s         → ab[1, N-1]
    #   A[N-1, N-2] = -r * (1+a)     → ab[2, N-2]
    A_banded[1, N - 1] = diag_center
    A_banded[2, N - 2] = -r * one_plus_a
    C_vec[N - 1] = s * T_amb + dt * Q[N - 1] + r * b_rb * T_amb

    return A_banded, C_vec


def _apply_B(B_diag, B_off, T):
    """
    应用 B * T（三对角对称矩阵）。

    B_diag[i]  = B[i, i]
    B_off[i]   = B[i, i-1] = B[i-1, i]  (i >= 1)
                （B_off[0] 未使用，恒为 0）
    """
    N = len(T)
    out = B_diag * T
    # B[i, i-1] * T[i-1]  for i = 1..N-1
    for i in range(1, N):
        out[i] += B_off[i] * T[i - 1]
    # B[i, i+1] * T[i+1]  for i = 0..N-2
    for i in range(N - 1):
        out[i] += B_off[i + 1] * T[i + 1]
    return out


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
      - 否则：Crank-Nicolson 隐式，无条件稳定、大步长推进
    """
    assert Q.shape == (config.nodes,)
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
        progress_cb(
            0.02,
            f"初始化求解器 ({'Crank-Nicolson 隐式' if use_implicit else 'RK45 自适应'})",
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
    """SciPy RK45 求解（默认高精度模式）"""
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
