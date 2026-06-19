"""
光伏阵列耦合求解编排器

物理设定（1D 沿阵列长度方向）：
  ∂T/∂t = α ∂²T/∂x² + Q_src(x) − h_vol (T − T_amb)

  其中 Q_src  由辐照未转化为电能的部分除以面板有效热容得到
       h_vol  代表厚度方向正反两面对流散热的集总体积散热系数

工作流：
1) 根据参数生成立体光照分布  G(x)
2) 用初值温度 = 环境温度，生成初始效率 η0(x)
3) 由 η0 推出体积热源 Q(x)  [单位: ℃/s]
4) 调用 heat_diffusion 求解完整的时空温度场 T(t, x)
5) 从最终帧温度计算稳态效率剖面 η_profile(x)
"""

from __future__ import annotations
from dataclasses import dataclass
import numpy as np

from .heat_diffusion import DiffusionConfig, solve_heat_diffusion
from .pv_model import (
    G_REF,
    cell_efficiency,
    linear_irradiance_profile,
)


RHO_C = 2.5e6         # J/(m^3·K)  面板有效体积热容 (玻璃+EVA+Si+背板 集总)
PANEL_THICKNESS = 0.04  # m  面板有效厚度

# 导热系数 (W/(m·K)) — 用于由 α = k/(ρc) 反推 k，配合 Robin 边界
# 我们的 alpha 是轴向上的有效扩散率，k 也是轴向等效值
def _k_from_alpha(alpha: float) -> float:
    return alpha * RHO_C


@dataclass
class SimulationParams:
    ambient_temp: float
    irradiance: float
    array_length: float
    nodes: int
    time_step: float
    total_time: float
    alpha: float
    ref_efficiency: float
    temp_coeff: float
    heat_transfer_coeff: float   # 表面对流换热系数 W/(m^2·K) (双面总和已包含在 h_vol 中)


@dataclass
class SimulationResult:
    T_matrix: np.ndarray       # (n_time, n_space)
    x_coords: np.ndarray       # (n_space,)
    time_coords: np.ndarray    # (n_time,)
    G_profile: np.ndarray      # (n_space,)
    eta_profile: np.ndarray    # (n_space,)  稳态效率
    eta_matrix: np.ndarray     # (n_time, n_space)  逐时刻效率


def _compute_volumetric_source(G: np.ndarray, eta: np.ndarray) -> np.ndarray:
    """
    由入射辐照 G (W/m^2) 与实际效率 η，推出体积热源强度 [℃/s]
    Q = G * (1-η) / (ρc * d_panel)
    """
    absorbed = np.maximum(G * (1.0 - eta), 0.0)
    return absorbed / (RHO_C * PANEL_THICKNESS)


def _compute_volumetric_heat_loss(h_surf: float) -> float:
    """
    由表面对流换热系数 h_surf (W/(m^2·K), 双面之和) 推出
    体积散热系数 h_v [1/s]
    h_v = h_surf / (ρc * d_panel)
    """
    return h_surf / (RHO_C * PANEL_THICKNESS)


def run_simulation(p: SimulationParams) -> SimulationResult:
    nodes = max(5, int(p.nodes))
    alpha = float(p.alpha)
    h_surf = float(p.heat_transfer_coeff)

    # --- 边界 Robin 系数 h/k ---
    k_eff = _k_from_alpha(alpha)
    h_over_k = h_surf * 0.5 / k_eff  # 端边散热只有端面，取单侧 h

    h_vol = _compute_volumetric_heat_loss(h_surf)

    diff_cfg = DiffusionConfig(
        length=float(p.array_length),
        nodes=nodes,
        alpha=alpha,
        h_over_k=h_over_k,
        h_volumetric=h_vol,
        ambient_temp=float(p.ambient_temp),
    )

    # --- 1) 构造辐照度分布（含边缘遮挡） ---
    G_profile = linear_irradiance_profile(nodes, float(p.irradiance), edge_drop=0.28)

    # --- 2) 预估初始热源：用环境温度做效率初猜 ---
    T_init_guess = np.full(nodes, float(p.ambient_temp))
    eta_init = cell_efficiency(T_init_guess, G_profile,
                               float(p.ref_efficiency), float(p.temp_coeff))
    Q = _compute_volumetric_source(G_profile, eta_init)

    # --- 3) 求解热扩散 PDE  ---
    T_matrix, x_coords, time_coords = solve_heat_diffusion(
        diff_cfg, Q,
        total_time=float(p.total_time),
        time_step=float(p.time_step),
    )

    # --- 4) 由逐时刻温度计算逐时刻效率与稳态效率 ---
    eta_matrix = np.empty_like(T_matrix)
    for k, T_k in enumerate(T_matrix):
        eta_matrix[k] = cell_efficiency(T_k, G_profile,
                                        float(p.ref_efficiency), float(p.temp_coeff))

    eta_profile = eta_matrix[-1]  # 最后一帧视作稳态

    return SimulationResult(
        T_matrix=T_matrix,
        x_coords=x_coords,
        time_coords=time_coords,
        G_profile=G_profile,
        eta_profile=eta_profile,
        eta_matrix=eta_matrix,
    )
