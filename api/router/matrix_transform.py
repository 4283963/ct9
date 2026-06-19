"""
数据矩阵转换路由
将后端 NumPy 矩阵转换为前端可视化友好的分层 JSON 结构。
包含：
  - 关键指标提取（峰值效率、平均/峰值温度、总能量、稳态时间）
  - 温度-时间矩阵的时空降采样（避免过多点数）
  - 效率剖面打包
"""

from __future__ import annotations
from dataclasses import dataclass
from typing import Any
import numpy as np

from api.physics.solver import SimulationResult
from api.physics.pv_model import G_REF


@dataclass
class Metrics:
    peak_efficiency: float
    avg_temp: float
    peak_temp: float
    total_energy: float
    steady_state_time: float


def _estimate_steady_state_time(time_coords: np.ndarray,
                                T_matrix: np.ndarray,
                                eps_frac: float = 0.02) -> float:
    """
    估计温度场达到稳态的时刻：当 T(t, ·) 的全均值 与 最终均值 的相对差
    首次 < eps_frac 时即视为稳态。
    """
    means = T_matrix.mean(axis=1)
    if len(means) < 2:
        return float(time_coords[-1])
    final = means[-1]
    if abs(final - means[0]) < 1e-6:
        return float(time_coords[0])
    mask = np.abs(means - final) / max(abs(final - means[0]), 1e-6) < eps_frac
    idx = int(np.argmax(mask)) if mask.any() else len(time_coords) - 1
    return float(time_coords[idx])


def _downsample_2d(matrix: np.ndarray, max_time: int = 120,
                   max_space: int = 120) -> tuple[np.ndarray, list[int], list[int]]:
    """对时空矩阵做均匀降采样，控制点数上限"""
    nt, ns = matrix.shape
    t_stride = max(1, int(np.ceil(nt / max_time)))
    s_stride = max(1, int(np.ceil(ns / max_space)))
    t_idx = list(range(0, nt, t_stride))
    s_idx = list(range(0, ns, s_stride))
    if t_idx[-1] != nt - 1:
        t_idx.append(nt - 1)
    if s_idx[-1] != ns - 1:
        s_idx.append(ns - 1)
    return matrix[np.ix_(t_idx, s_idx)], t_idx, s_idx


def build_metrics(res: SimulationResult) -> Metrics:
    T_mat = res.T_matrix
    eta_mat = res.eta_matrix
    x = res.x_coords
    t = res.time_coords

    # 效率峰值（空间+时间）
    peak_eff = float(np.max(eta_mat))

    # 温度统计（最终稳态帧）
    T_steady = T_mat[-1]
    avg_T = float(np.mean(T_steady))
    peak_T = float(np.max(T_steady))

    # 总发电量（单位长度归一化）：∫_t ∫_x  η(t,x) * G(x) dx dt
    # 采用梯形积分
    if len(t) >= 2:
        dx = x[1] - x[0] if len(x) > 1 else 1.0
        integrand_space = np.trapz(eta_mat * res.G_profile[None, :], dx=dx, axis=1)
        total_e = float(np.trapz(integrand_space, x=t))  # W·s/m  (J/m)
    else:
        total_e = 0.0

    steady_t = _estimate_steady_state_time(t, T_mat)
    return Metrics(
        peak_efficiency=peak_eff,
        avg_temp=avg_T,
        peak_temp=peak_T,
        total_energy=total_e,
        steady_state_time=steady_t,
    )


def to_frontend_payload(res: SimulationResult) -> dict[str, Any]:
    """
    生成符合前端接口 SimulateResponse 的 JSON 可序列化字典。
    """
    metrics = build_metrics(res)

    # 效率剖面（沿阵列长度方向）
    efficiency_profile = [
        {"x": float(x), "eff": float(e), "G": float(G)}
        for x, e, G in zip(res.x_coords, res.eta_profile, res.G_profile)
    ]

    # 温度帧 + 时空网格（统一降采样）
    T_ds, t_idx, s_idx = _downsample_2d(res.T_matrix, max_time=120, max_space=140)
    time_labels = [float(res.time_coords[i]) for i in t_idx]
    space_labels = [float(res.x_coords[j]) for j in s_idx]

    temperature_frames = T_ds.tolist()

    payload = {
        "metrics": {
            "peakEfficiency": metrics.peak_efficiency,
            "avgTemp": metrics.avg_temp,
            "peakTemp": metrics.peak_temp,
            "totalEnergy": metrics.total_energy,
            "steadyStateTime": metrics.steady_state_time,
            "referenceIrradiance": G_REF,
        },
        "efficiencyProfile": efficiency_profile,
        "temperatureFrames": temperature_frames,
        "spaceTimeGrid": {
            "space": space_labels,
            "time": time_labels,
            "matrix": temperature_frames,
        },
        "timeLabels": time_labels,
        "spaceLabels": space_labels,
    }
    return payload
