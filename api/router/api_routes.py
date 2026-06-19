"""
FastAPI 路由层

暴露接口：
  GET  /api/health
  POST /api/simulate
"""

from __future__ import annotations
from typing import Any

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from api.physics.solver import SimulationParams, run_simulation
from api.router.matrix_transform import to_frontend_payload


class SimulateRequest(BaseModel):
    ambientTemp: float = Field(default=25.0, ge=-40.0, le=80.0,
                               description="环境温度 ℃")
    irradiance: float = Field(default=800.0, ge=0.0, le=2000.0,
                              description="中心辐照度 W/m²")
    arrayLength: float = Field(default=5.0, ge=0.1, le=50.0,
                               description="阵列长度 m")
    nodes: int = Field(default=80, ge=5, le=600,
                       description="空间网格节点数")
    timeStep: float = Field(default=1.0, ge=0.01, le=600.0,
                            description="输出时间步长 s")
    totalTime: float = Field(default=60.0, ge=1.0, le=36000.0,
                             description="总仿真时长 s")
    alpha: float = Field(default=9.7e-5, ge=1e-8, le=1e-2,
                         description="热扩散系数 m²/s (典型铝 ~ 9.7e-5)")
    refEfficiency: float = Field(default=0.22, ge=0.05, le=0.5,
                                 description="STC 参考效率")
    tempCoeff: float = Field(default=0.0042, ge=0.0005, le=0.01,
                             description="温度系数 1/℃")
    heatTransferCoeff: float = Field(default=15.0, ge=1.0, le=200.0,
                                     description="对流换热系数 W/(m²·K)")


router = APIRouter(prefix="/api", tags=["simulation"])


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/simulate")
async def simulate(req: SimulateRequest) -> dict[str, Any]:
    try:
        params = SimulationParams(
            ambient_temp=req.ambientTemp,
            irradiance=req.irradiance,
            array_length=req.arrayLength,
            nodes=req.nodes,
            time_step=req.timeStep,
            total_time=req.totalTime,
            alpha=req.alpha,
            ref_efficiency=req.refEfficiency,
            temp_coeff=req.tempCoeff,
            heat_transfer_coeff=req.heatTransferCoeff,
        )
        result = run_simulation(params)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return to_frontend_payload(result)
