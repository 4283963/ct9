import { create } from "zustand";
import type {
  SimulateParams,
  SimulateResponse,
  SimStatus,
  TaskInfo,
} from "@/types/simulation";
import {
  isLargeTask,
  runSimulation,
  runSimulationAsync,
  cancelTask,
} from "@/api/client";

const DEFAULT_PARAMS: SimulateParams = {
  ambientTemp: 25.0,
  irradiance: 900.0,
  arrayLength: 2.0,
  nodes: 80,
  timeStep: 5.0,
  totalTime: 900.0,
  alpha: 9.7e-5,
  refEfficiency: 0.22,
  tempCoeff: 0.0042,
  heatTransferCoeff: 15.0,
};

interface SimState {
  params: SimulateParams;
  result: SimulateResponse | null;
  status: SimStatus;
  error: string | null;
  currentTimeFrame: number;
  isPlaying: boolean;
  activeTaskId: string | null;
  progress: number;
  progressMessage: string;
  isAsyncMode: boolean;

  setParams: (patch: Partial<SimulateParams>) => void;
  resetParams: () => void;
  runSim: () => Promise<void>;
  cancelSim: () => Promise<void>;
  setCurrentTimeFrame: (index: number) => void;
  togglePlay: () => void;
}

export const useSimStore = create<SimState>((set, get) => ({
  params: DEFAULT_PARAMS,
  result: null,
  status: "idle",
  error: null,
  currentTimeFrame: 0,
  isPlaying: false,
  activeTaskId: null,
  progress: 0,
  progressMessage: "",
  isAsyncMode: false,

  setParams: (patch) =>
    set((state) => ({ params: { ...state.params, ...patch } })),

  resetParams: () => set({ params: DEFAULT_PARAMS }),

  cancelSim: async () => {
    const taskId = get().activeTaskId;
    if (taskId) {
      try {
        await cancelTask(taskId);
      } catch {
        // 忽略取消接口错误
      }
    }
    set({
      status: "idle",
      activeTaskId: null,
      progress: 0,
      progressMessage: "",
      error: null,
    });
  },

  runSim: async () => {
    const { params } = get();
    const large = isLargeTask(params);

    set({
      status: large ? "computing-async" : "computing-sync",
      error: null,
      currentTimeFrame: 0,
      progress: 0,
      progressMessage: large ? "已提交异步任务，等待执行…" : "启动求解器…",
      isAsyncMode: large,
      isPlaying: false,
    });

    try {
      let result: SimulateResponse;
      if (large) {
        result = await runSimulationAsync(params, (info: TaskInfo) => {
          set({
            activeTaskId: info.taskId,
            progress: info.progress,
            progressMessage: info.message || `任务状态：${info.status}`,
          });
          if (info.status === "failed") {
            throw new Error(info.error || "任务失败");
          }
          if (info.status === "cancelled") {
            throw new Error("任务已取消");
          }
        });
      } else {
        result = await runSimulation(params);
        set({ progress: 1 });
      }

      set({
        result,
        status: "ready",
        currentTimeFrame: result.timeLabels.length - 1,
        progress: 1,
        progressMessage: "仿真完成",
        activeTaskId: null,
      });
    } catch (err) {
      set({
        status: "error",
        error: err instanceof Error ? err.message : String(err),
        activeTaskId: null,
      });
    }
  },

  setCurrentTimeFrame: (index) => set({ currentTimeFrame: index }),

  togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),
}));
