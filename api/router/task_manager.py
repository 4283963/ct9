"""
异步任务管理器
==============

为长耗时 PDE 仿真提供后台执行能力：
  1. TaskManager 负责在独立线程中运行仿真，记录进度
  2. 支持状态查询、任务取消、结果获取
  3. 每个任务分配唯一 task_id，可被前端轮询

工作机制：
  - 使用 threading.Thread 执行计算任务（GIL 对 NumPy/SciPy 的密集 C-level 计算影响较小）
  - 任务状态保存在内存字典中（不做持久化，服务重启后丢失）
  - 可选：进度回调在 solver 分块推进时调用
"""

from __future__ import annotations
import time
import uuid
import threading
from dataclasses import dataclass, field
from enum import Enum
from typing import Any, Callable, Optional


class TaskStatus(str, Enum):
    PENDING = "pending"
    RUNNING = "running"
    COMPLETED = "completed"
    FAILED = "failed"
    CANCELLED = "cancelled"


@dataclass
class TaskInfo:
    task_id: str
    status: TaskStatus
    progress: float = 0.0           # 0.0 ~ 1.0
    message: str = ""
    created_at: float = field(default_factory=time.time)
    started_at: Optional[float] = None
    completed_at: Optional[float] = None
    result: Optional[dict[str, Any]] = None
    error: Optional[str] = None
    cancel_event: threading.Event = field(default_factory=threading.Event)


class TaskManager:
    """
    单例式任务管理器。
    """

    _instance: Optional["TaskManager"] = None
    _lock: threading.Lock = threading.Lock()

    def __init__(self) -> None:
        self._tasks: dict[str, TaskInfo] = {}
        self._gc_lock = threading.Lock()

    @classmethod
    def instance(cls) -> "TaskManager":
        if cls._instance is None:
            with cls._lock:
                if cls._instance is None:
                    cls._instance = TaskManager()
        return cls._instance

    # ------------------------------------------------------------------
    # 公共 API
    # ------------------------------------------------------------------
    def submit(
        self,
        worker: Callable[
            [Callable[[float, str], None], threading.Event],
            Any,
        ],
    ) -> TaskInfo:
        """
        提交任务并立即返回 TaskInfo。

        worker 签名：
          def worker(progress_cb, cancel_event, params?) -> result_dict

        progress_cb(progress: float, message: str) 用于更新进度
        cancel_event.is_set() 用于判断是否需要取消
        """
        task_id = uuid.uuid4().hex[:16]
        info = TaskInfo(task_id=task_id, status=TaskStatus.PENDING)
        self._tasks[task_id] = info

        def progress_cb(p: float, msg: str = "") -> None:
            with self._gc_lock:
                info.progress = max(0.0, min(1.0, p))
                if msg:
                    info.message = msg

        def runner() -> None:
            info.started_at = time.time()
            info.status = TaskStatus.RUNNING
            try:
                result = worker(progress_cb, info.cancel_event)
                if info.cancel_event.is_set():
                    info.status = TaskStatus.CANCELLED
                    info.message = "任务已取消"
                else:
                    info.result = result
                    info.status = TaskStatus.COMPLETED
                    info.progress = 1.0
            except Exception as exc:  # noqa: BLE001
                info.status = TaskStatus.FAILED
                info.error = f"{type(exc).__name__}: {exc}"
                info.message = str(exc)
            finally:
                info.completed_at = time.time()

        thread = threading.Thread(target=runner, name=f"pv-sim-{task_id}", daemon=True)
        thread.start()
        return info

    def get(self, task_id: str) -> Optional[TaskInfo]:
        return self._tasks.get(task_id)

    def cancel(self, task_id: str) -> bool:
        info = self._tasks.get(task_id)
        if not info:
            return False
        if info.status in (TaskStatus.COMPLETED, TaskStatus.FAILED, TaskStatus.CANCELLED):
            return True
        info.cancel_event.set()
        info.status = TaskStatus.CANCELLED
        info.message = "取消请求已发出"
        return True

    def to_public_dict(self, info: TaskInfo) -> dict[str, Any]:
        """构造对前端安全的任务状态描述"""
        return {
            "taskId": info.task_id,
            "status": info.status.value,
            "progress": info.progress,
            "message": info.message,
            "createdAt": info.created_at,
            "startedAt": info.started_at,
            "completedAt": info.completed_at,
            "hasResult": info.result is not None,
            "error": info.error,
        }
