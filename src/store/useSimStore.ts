import { create } from "zustand";
import type {
  SimulateParams,
  SimulateResponse,
  SimStatus,
  TaskInfo,
  HotspotDefect,
} from "@/types/simulation";
import {
  isLargeTask,
  runSimulation,
  runSimulationAsync,
  cancelTask,
} from "@/api/client";

export const HOTSPOT_PRESETS: Record<string, { label: string; cond: number; eff: number }> = {
  bird_dropping: { label: "鸟粪覆盖", cond: 0.05, eff: 0.0 },
  surface_crack: { label: "表面裂纹", cond: 0.2, eff: 0.3 },
  dust_cover: { label: "严重积灰", cond: 0.5, eff: 0.6 },
  delamination: { label: "分层脱粘", cond: 0.1, eff: 0.1 },
  normal: { label: "正常", cond: 1.0, eff: 1.0 },
};

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
  hotspots: [],
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
  hotspots: HotspotDefect[];
  selectedPreset: keyof typeof HOTSPOT_PRESETS;
  hotspotEditMode: boolean;

  setParams: (patch: Partial<SimulateParams>) => void;
  resetParams: () => void;
  runSim: () => Promise<void>;
  cancelSim: () => Promise<void>;
  setCurrentTimeFrame: (index: number) => void;
  togglePlay: () => void;
  addHotspot: (nodeIndex: number) => void;
  removeHotspot: (nodeIndex: number) => void;
  toggleHotspot: (nodeIndex: number) => void;
  clearHotspots: () => void;
  setSelectedPreset: (preset: keyof typeof HOTSPOT_PRESETS) => void;
  setHotspotEditMode: (enabled: boolean) => void;
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
  hotspots: [],
  selectedPreset: "bird_dropping",
  hotspotEditMode: false,

  setParams: (patch) =>
    set((state) => {
      const newParams = { ...state.params, ...patch };
      return {
        params: newParams,
        hotspots: (patch.hotspots ?? state.hotspots).filter(
          (h) => h.nodeIndex < newParams.nodes
        ),
      };
    }),

  resetParams: () =>
    set({
      params: DEFAULT_PARAMS,
      hotspots: [],
    }),

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
    const { params, hotspots } = get();
    const paramsWithHotspots = { ...params, hotspots };
    const large = isLargeTask(paramsWithHotspots);

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
        result = await runSimulationAsync(paramsWithHotspots, (info: TaskInfo) => {
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
        result = await runSimulation(paramsWithHotspots);
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

  addHotspot: (nodeIndex) => {
    const { hotspots, selectedPreset, params } = get();
    if (nodeIndex < 0 || nodeIndex >= params.nodes) return;
    if (hotspots.some((h) => h.nodeIndex === nodeIndex)) return;

    const preset = HOTSPOT_PRESETS[selectedPreset];
    const newHotspot: HotspotDefect = {
      nodeIndex,
      conductivityMultiplier: preset.cond,
      efficiencyMultiplier: preset.eff,
      label: preset.label,
    };
    set({ hotspots: [...hotspots, newHotspot] });
  },

  removeHotspot: (nodeIndex) => {
    set((state) => ({
      hotspots: state.hotspots.filter((h) => h.nodeIndex !== nodeIndex),
    }));
  },

  toggleHotspot: (nodeIndex) => {
    const { hotspots } = get();
    const exists = hotspots.some((h) => h.nodeIndex === nodeIndex);
    if (exists) {
      get().removeHotspot(nodeIndex);
    } else {
      get().addHotspot(nodeIndex);
    }
  },

  clearHotspots: () => set({ hotspots: [] }),

  setSelectedPreset: (preset) => set({ selectedPreset: preset }),

  setHotspotEditMode: (enabled) => set({ hotspotEditMode: enabled }),
}));
