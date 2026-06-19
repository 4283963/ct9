import type {
  SimulateParams,
  SimulateResponse,
  TaskInfo,
  TaskResultResponse,
} from "@/types/simulation";

const API_BASE =
  import.meta.env.VITE_API_BASE_URL || "http://localhost:8000";

const WORK_THRESHOLD = 150_000;

export function isLargeTask(p: SimulateParams): boolean {
  const nFrames = Math.floor(p.totalTime / Math.max(p.timeStep, 0.01)) + 1;
  return p.nodes * nFrames > WORK_THRESHOLD || p.nodes >= 400 || nFrames >= 800;
}

export async function fetchHealth(): Promise<{ status: string }> {
  const res = await fetch(`${API_BASE}/api/health`);
  if (!res.ok) throw new Error(`Health check failed: ${res.status}`);
  return res.json();
}

export async function runSimulation(
  params: SimulateParams
): Promise<SimulateResponse> {
  const res = await fetch(`${API_BASE}/api/simulate`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Simulation failed: ${res.status}`);
  }
  return res.json();
}

// ------- 异步任务接口 -------

export async function submitAsyncTask(
  params: SimulateParams
): Promise<TaskInfo> {
  const res = await fetch(`${API_BASE}/api/tasks/submit`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(params),
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Submit task failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchTaskStatus(taskId: string): Promise<TaskInfo> {
  const res = await fetch(`${API_BASE}/api/tasks/${taskId}/status`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Status fetch failed: ${res.status}`);
  }
  return res.json();
}

export async function fetchTaskResult(
  taskId: string
): Promise<TaskResultResponse> {
  const res = await fetch(`${API_BASE}/api/tasks/${taskId}/result`);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Result fetch failed: ${res.status}`);
  }
  return res.json();
}

export async function cancelTask(taskId: string): Promise<TaskInfo> {
  const res = await fetch(`${API_BASE}/api/tasks/${taskId}/cancel`, {
    method: "POST",
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }));
    throw new Error(err.detail || `Cancel failed: ${res.status}`);
  }
  return res.json();
}

/**
 * 提交并轮询直到完成（内部使用）。
 * 外部应直接使用 zustand 的异步流程。
 */
export async function runSimulationAsync(
  params: SimulateParams,
  onProgress: (info: TaskInfo) => void,
  pollIntervalMs = 1200
): Promise<SimulateResponse> {
  const task = await submitAsyncTask(params);
  onProgress(task);

  const start = Date.now();
  const MAX_POLL_MS = 10 * 60 * 1000; // 10 分钟内兜底保护

  while (true) {
    await new Promise((r) => setTimeout(r, pollIntervalMs));
    const status = await fetchTaskStatus(task.taskId);
    onProgress(status);

    if (status.status === "completed") {
      const { result } = await fetchTaskResult(task.taskId);
      return result;
    }
    if (status.status === "failed") {
      throw new Error(status.error || "任务失败");
    }
    if (status.status === "cancelled") {
      throw new Error("任务已取消");
    }
    if (Date.now() - start > MAX_POLL_MS) {
      throw new Error("任务轮询超时");
    }
  }
}
