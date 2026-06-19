"""
光伏阵列耦合求解编排器（支持异步进度回调与取消）
"""

from __future__ import annotations
from dataclasses import dataclass
import numpy as np
import threading
from typing import Callable, Optional

from .heat_diffusion import DiffusionConfig, solve_heat_diffusion, ProgressCb
from .pv_model import (
    G_REF,
    cell_efficiency,
    linear_irradiance_profile,
)


RHO_C = 2.5e6
PANEL_THICKNESS = 0.04


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
    heat_transfer_coeff: float


@dataclass
class SimulationResult:
    T_matrix: np.ndarray
    x_coords: np.ndarray
    time_coords: np.ndarray
    G_profile: np.ndarray
    eta_profile: np.ndarray
    eta_matrix: np.ndarray


def _compute_volumetric_source(G: np.ndarray, eta: np.ndarray) -> np.ndarray:
    absorbed = np.maximum(G * (1.0 - eta), 0.0)
    return absorbed / (RHO_C * PANEL_THICKNESS)


def _compute_volumetric_heat_loss(h_surf: float) -> float:
    return h_surf / (RHO_C * PANEL_THICKNESS)


def run_simulation(
    p: SimulationParams,
    progress_cb: Optional[ProgressCb] = None,
    cancel_event: Optional[threading.Event] = None,
) -> SimulationResult:
    nodes = max(5, int(p.nodes))
    alpha = float(p.alpha)
    h_surf = float(p.heat_transfer_coeff)

    k_eff = _k_from_alpha(alpha)
    h_over_k = h_surf / k_eff
    h_vol = _compute_volumetric_heat_loss(h_surf)

    diff_cfg = DiffusionConfig(
        length=float(p.array_length),
        nodes=nodes,
        alpha=alpha,
        h_over_k=h_over_k,
        h_volumetric=h_vol,
        ambient_temp=float(p.ambient_temp),
    )

    if progress_cb:
        progress_cb(0.0, "生成辐照度分布")
    G_profile = linear_irradiance_profile(nodes, float(p.irradiance), edge_drop=0.28)

    if cancel_event and cancel_event.is_set():
        raise RuntimeError("任务已取消")

    if progress_cb:
        progress_cb(0.01, "计算初始热源")
    T_init_guess = np.full(nodes, float(p.ambient_temp))
    eta_init = cell_efficiency(T_init_guess, G_profile,
                               float(p.ref_efficiency), float(p.temp_coeff))
    Q = _compute_volumetric_source(G_profile, eta_init)

    if progress_cb:
        progress_cb(0.03, "启动 PDE 求解器")

    T_matrix, x_coords, time_coords = solve_heat_diffusion(
        diff_cfg, Q,
        total_time=float(p.total_time),
        time_step=float(p.time_step),
        progress_cb=progress_cb,
        cancel_event=cancel_event,
    )

    if cancel_event and cancel_event.is_set():
        raise RuntimeError("任务已取消")

    if progress_cb:
        progress_cb(0.97, "计算效率剖面")

    eta_matrix = np.empty_like(T_matrix)
    for k, T_k in enumerate(T_matrix):
        eta_matrix[k] = cell_efficiency(T_k, G_profile,
                                        float(p.ref_efficiency), float(p.temp_coeff))

    eta_profile = eta_matrix[-1]

    if progress_cb:
        progress_cb(1.0, "仿真完成")

    return SimulationResult(
        T_matrix=T_matrix,
        x_coords=x_coords,
        time_coords=time_coords,
        G_profile=G_profile,
        eta_profile=eta_profile,
        eta_matrix=eta_matrix,
    )
