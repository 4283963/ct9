import { create } from "zustand";
import type {
  SimulateParams,
  SimulateResponse,
  SimStatus,
} from "@/types/simulation";
import { runSimulation } from "@/api/client";

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

  setParams: (patch: Partial<SimulateParams>) => void;
  resetParams: () => void;
  runSim: () => Promise<void>;
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

  setParams: (patch) =>
    set((state) => ({ params: { ...state.params, ...patch } })),

  resetParams: () => set({ params: DEFAULT_PARAMS }),

  runSim: async () => {
    const { params } = get();
    set({ status: "computing", error: null, currentTimeFrame: 0 });
    try {
      const result = await runSimulation(params);
      set({
        result,
        status: "ready",
        currentTimeFrame: result.timeLabels.length - 1,
      });
    } catch (err) {
      set({
        status: "error",
        error: err instanceof Error ? err.message : String(err),
      });
    }
  },

  setCurrentTimeFrame: (index) => set({ currentTimeFrame: index }),

  togglePlay: () => set((s) => ({ isPlaying: !s.isPlaying })),
}));
