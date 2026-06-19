export interface SimulateParams {
  ambientTemp: number;
  irradiance: number;
  arrayLength: number;
  nodes: number;
  timeStep: number;
  totalTime: number;
  alpha: number;
  refEfficiency: number;
  tempCoeff: number;
  heatTransferCoeff: number;
}

export interface SimMetrics {
  peakEfficiency: number;
  avgTemp: number;
  peakTemp: number;
  totalEnergy: number;
  steadyStateTime: number;
  referenceIrradiance: number;
}

export interface EfficiencyPoint {
  x: number;
  eff: number;
  G: number;
}

export interface SpaceTimeGrid {
  space: number[];
  time: number[];
  matrix: number[][];
}

export interface SimulateResponse {
  metrics: SimMetrics;
  efficiencyProfile: EfficiencyPoint[];
  temperatureFrames: number[][];
  spaceTimeGrid: SpaceTimeGrid;
  timeLabels: number[];
  spaceLabels: number[];
}

export type TaskStatus =
  | "pending"
  | "running"
  | "completed"
  | "failed"
  | "cancelled";

export interface TaskInfo {
  taskId: string;
  status: TaskStatus;
  progress: number;
  message: string;
  createdAt: number;
  startedAt: number | null;
  completedAt: number | null;
  hasResult: boolean;
  error: string | null;
}

export interface TaskResultResponse {
  task: TaskInfo;
  result: SimulateResponse;
}

export type SimStatus =
  | "idle"
  | "computing-sync"
  | "computing-async"
  | "ready"
  | "error";
