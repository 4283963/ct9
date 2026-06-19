"""
一维热扩散偏微分方程求解器
求解方程：∂T/∂t = α ∂²T/∂x² + Q(x) - h_v * (T - T_amb)

  其中 h_v * (T - T_amb) 为体积散热项，代表电池厚度方向上
  正反两面通过对流向环境散热的集总效应，使系统存在稳态。

采用方法：
  - 空间二阶中心差分（有限差分法）
  - 时间推进使用 SciPy solve_ivp（Runge-Kutta RK45，自适应步长）
  - 边界条件：对流换热（Robin / Newton 冷却律）
    - k * ∂T/∂x |_x=0 = h_edge * (T0 - T_ambient)
    - -k * ∂T/∂x |_x=L = h_edge * (T_L - T_ambient)

使用时需显式给出：
  - alpha:        热扩散系数 m^2/s
  - h_over_k:     端边对流换热系数 / 导热系数
  - h_volumetric: 体积散热系数 W/(m^3·K)
  - Q:            体积热源项 W/m^3  （由光伏效率模型提供）
"""

from __future__ import annotations
from dataclasses import dataclass
import numpy as np
from scipy.integrate import solve_ivp


@dataclass
class DiffusionConfig:
    length: float
    nodes: int
    alpha: float
    h_over_k: float
    h_volumetric: float
    ambient_temp: float


def _build_rhs(config: DiffusionConfig, Q: np.ndarray):
    """
    构造半离散化后的 ODE 右手边 dT/dt = f(t, T)
    T: 形状 (nodes,)
    Q: 形状 (nodes,)  体积热源（空间分布；本文按时间恒定处理）
    """
    dx = config.length / (config.nodes - 1)
    dx2 = dx * dx
    N = config.nodes
    hk = config.h_over_k
    T_amb = config.ambient_temp
    alpha = config.alpha
    h_v = config.h_volumetric

    def rhs(t, T):
        dT = np.empty_like(T)
        Tm = T[:-2]
        Tc = T[1:-1]
        Tp = T[2:]
        dT[1:-1] = alpha * (Tp - 2.0 * Tc + Tm) / dx2 + Q[1:-1] - h_v * (Tc - T_amb)

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


def solve_heat_diffusion(
    config: DiffusionConfig,
    Q: np.ndarray,
    total_time: float,
    time_step: float | None = None,
    method: str = "RK45",
    rtol: float = 1e-5,
    atol: float = 1e-7,
):
    """
    执行一维热扩散方程的时空求解。

    参数:
        config    : DiffusionConfig
        Q         : (nodes,) 体积热源 W/m^3
        total_time: 总仿真时长 s
        time_step : 输出时间步长（None 则自适应生成约 60 帧）
        method    : solve_ivp 方法（默认 RK45）
    返回:
        T_matrix  : (n_times, nodes) 温度矩阵
        x_coords  : (nodes,)  空间坐标 m
        time_coords: (n_times,) 时间坐标 s
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

    rhs = _build_rhs(config, Q)

    sol = solve_ivp(
        rhs,
        t_span=(0.0, total_time),
        y0=T0,
        method=method,
        t_eval=time_coords,
        rtol=rtol,
        atol=atol,
        vectorized=False,
    )

    if not sol.success:
        raise RuntimeError(f"Heat diffusion solver failed: {sol.message}")

    T_matrix = sol.y.T  # (n_times, nodes)
    return T_matrix, x_coords, sol.t
