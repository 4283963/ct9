"""
光伏效率与体积热源耦合模型
---------------------------------------------------------------
Q_source = G * (1 - η) / L_thickness      (W/m^3)

  - L_thickness：光伏板总等效厚度（玻璃/电池/背板）。
                 体积热源、体积冷却均用此厚度归一。
  - η(T, G) = η_ref (1 - β(T - T_ref)) f(G)
  - f(G) 为弱光修正经验项。
---------------------------------------------------------------
"""

from __future__ import annotations
import numpy as np


G_REF = 1000.0
T_REF = 25.0
L_THICKNESS = 0.006  # m (6 mm，典型光伏组件等效厚度)


def irradiance_correction(G: np.ndarray | float) -> np.ndarray | float:
    ratio = np.maximum(G / G_REF, 1e-6)
    return 1.0 + 0.05 * np.log10(ratio)


def cell_efficiency(T_cell: np.ndarray, G: np.ndarray,
                    eta_ref: float, beta: float) -> np.ndarray:
    f_G = irradiance_correction(G)
    eta = eta_ref * (1.0 - beta * (T_cell - T_REF)) * f_G
    return np.clip(eta, 0.0, 1.0)


def compute_volume_heat_source(G: np.ndarray, eta: np.ndarray,
                               thickness: float = L_THICKNESS) -> np.ndarray:
    absorbed = np.maximum(G * (1.0 - eta), 0.0)
    return absorbed / thickness


def linear_irradiance_profile(nodes: int, G_center: float,
                              edge_drop: float = 0.25) -> np.ndarray:
    x = np.linspace(-1.0, 1.0, nodes)
    profile = 1.0 - edge_drop * (0.6 * x**2 + 0.4 * np.cos(np.pi * x / 2.0)**2)
    return G_center * np.clip(profile, 0.0, 1.0)


def volumetric_cooling_coeff(h_back: float,
                             thickness: float = L_THICKNESS,
                             surfaces: int = 2) -> float:
    """
    将背板/玻璃的对流换热系数 h_back [W/(m²·K)] 转换为体积冷却系数
        gamma = (surfaces * h_back) / thickness  [1/s]
    默认 surfaces = 2（上下两面都有对流）
    """
    return (surfaces * float(h_back)) / float(thickness)
