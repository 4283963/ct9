"""
FastAPI 路由层（同步 + 异步任务双模式）

暴露接口：
  GET  /api/health
  POST /api/simulate                 同步接口（小任务，≤30s）
  POST /api/tasks/submit             异步任务提交（大任务，立即返回 task_id）
  GET  /api/tasks/{task_id}/status   查询任务进度 / 状态
  GET  /api/tasks/{task_id}/result   获取结果（完成后）
  POST /api/tasks/{task_id}/cancel   取消任务
"""

from __future__ import annotations
from typing import Any, Optional
import threading

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from api.physics.solver import SimulationParams, run_simulation
from api.router.matrix_transform import to_frontend_payload
from api.router.task_manager import TaskManager, TaskStatus


class HotspotDefect(BaseModel):
    nodeIndex: int = Field(ge=0)
    conductivityMultiplier: float = Field(gt=0.0, le=1.0)
    efficiencyMultiplier: Optional[float] = Field(default=1.0, ge=0.0, le=1.0)
    label: Optional[str] = None


class SimulateRequest(BaseModel):
    ambientTemp: float = Field(default=25.0, ge=-40.0, le=80.0)
    irradiance: float = Field(default=800.0, ge=0.0, le=2000.0)
    arrayLength: float = Field(default=5.0, ge=0.1, le=50.0)
    nodes: int = Field(default=80, ge=5, le=1000)
    timeStep: float = Field(default=1.0, ge=0.01, le=600.0)
    totalTime: float = Field(default=60.0, ge=1.0, le=3600 * 48.0)
    alpha: float = Field(default=9.7e-5, ge=1e-8, le=1e-2)
    refEfficiency: float = Field(default=0.22, ge=0.05, le=0.5)
    tempCoeff: float = Field(default=0.0042, ge=0.0005, le=0.01)
    heatTransferCoeff: float = Field(default=15.0, ge=1.0, le=200.0)
    hotspots: list[HotspotDefect] = Field(default_factory=list)


def _build_params(req: SimulateRequest) -> SimulationParams:
    from api.physics.solver import HotspotDefect as SolverHotspot
    hotspots = None
    if req.hotspots:
        hotspots = [
            SolverHotspot(
                node_index=hs.nodeIndex,
                conductivity_multiplier=hs.conductivityMultiplier,
                efficiency_multiplier=hs.efficiencyMultiplier if hs.efficiencyMultiplier is not None else 1.0,
            )
            for hs in req.hotspots
        ]
    return SimulationParams(
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
        hotspots=hotspots,
    )


def _is_large_task(req: SimulateRequest) -> bool:
    """
    根据节点数 × 时间帧数判断是否为大任务（超过阈值走异步）。
    阈值：估算工作量 > 150_000 节点-帧时走异步。
    """
    n_frames = int(req.totalTime / max(req.timeStep, 0.01)) + 1
    return req.nodes * n_frames > 150_000 or req.nodes >= 400 or n_frames >= 800


router = APIRouter(prefix="/api", tags=["simulation"])
_task_manager = TaskManager.instance()


@router.get("/health")
async def health() -> dict[str, str]:
    return {"status": "ok"}


@router.post("/simulate")
async def simulate(req: SimulateRequest) -> dict[str, Any]:
    """同步仿真接口（用于小任务）。对于大任务，自动重定向建议使用异步接口。"""
    params = _build_params(req)
    try:
        result = run_simulation(params)
    except Exception as exc:
        raise HTTPException(status_code=500, detail=str(exc)) from exc

    return to_frontend_payload(result)


@router.post("/tasks/submit", status_code=202)
async def submit_task(req: SimulateRequest) -> dict[str, Any]:
    """异步提交任务，立即返回 task_id，通过 /tasks/{id}/status 轮询进度。"""
    params = _build_params(req)

    def worker(progress_cb, cancel_event: threading.Event):
        result = run_simulation(params, progress_cb=progress_cb, cancel_event=cancel_event)
        if cancel_event.is_set():
            return None
        return to_frontend_payload(result)

    info = _task_manager.submit(worker)
    return _task_manager.to_public_dict(info)


@router.get("/tasks/{task_id}/status")
async def task_status(task_id: str) -> dict[str, Any]:
    info = _task_manager.get(task_id)
    if not info:
        raise HTTPException(status_code=404, detail=f"任务 {task_id} 不存在")
    return _task_manager.to_public_dict(info)


@router.get("/tasks/{task_id}/result")
async def task_result(task_id: str) -> dict[str, Any]:
    info = _task_manager.get(task_id)
    if not info:
        raise HTTPException(status_code=404, detail=f"任务 {task_id} 不存在")
    if info.status != TaskStatus.COMPLETED:
        raise HTTPException(
            status_code=409,
            detail=f"任务尚未完成（当前状态：{info.status.value}）",
        )
    if info.result is None:
        raise HTTPException(status_code=500, detail="任务完成但无结果")
    # 附带状态信息，前端一次请求拿到所有数据
    return {
        "task": _task_manager.to_public_dict(info),
        "result": info.result,
    }


@router.post("/tasks/{task_id}/cancel")
async def cancel_task(task_id: str) -> dict[str, Any]:
    ok = _task_manager.cancel(task_id)
    if not ok:
        raise HTTPException(status_code=404, detail=f"任务 {task_id} 不存在")
    info = _task_manager.get(task_id)
    return _task_manager.to_public_dict(info)
