"""
FastAPI 主入口
  uvicorn api.main:app --reload --port 8000
"""

from __future__ import annotations
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from api.router.api_routes import router as simulation_router


app = FastAPI(
    title="Photovoltaic Array Simulation API",
    version="1.0.0",
    description=(
        "新能源实验室：光伏阵列热扩散 & 发电效率耦合仿真后端。"
        "求解一维热扩散 PDE，提供分层 JSON 结果。"
    ),
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["*"],
)

app.include_router(simulation_router)


@app.get("/")
async def index():
    return {"service": "pv-sim-backend", "docs": "/docs"}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("api.main:app", host="0.0.0.0", port=8000, reload=True)
