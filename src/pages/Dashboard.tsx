import { useEffect } from "react";
import { useSimStore } from "@/store/useSimStore";
import { useSimulationPlayback } from "@/hooks/useSimulationPlayback";
import ParameterPanel from "@/components/ParameterPanel";
import HeaderBar from "@/components/HeaderBar";
import MetricsGrid from "@/components/MetricsGrid";
import EfficiencyChart from "@/components/EfficiencyChart";
import TemperatureProfile from "@/components/TemperatureProfile";
import HeatmapCanvas from "@/components/HeatmapCanvas";

export default function Dashboard() {
  const { runSim, status } = useSimStore();
  useSimulationPlayback(24);

  // 首次加载自动运行一次初始仿真
  useEffect(() => {
    if (status === "idle") {
      runSim();
    }
  }, [status, runSim]);

  return (
    <div className="h-screen flex flex-col bg-bg-deep text-mono-200 overflow-hidden">
      <HeaderBar />
      <div className="flex flex-1 min-h-0">
        <ParameterPanel />
        <main className="flex-1 flex flex-col p-4 gap-4 min-w-0 overflow-hidden">
          <MetricsGrid />

          <div className="flex-1 min-h-0 grid grid-cols-2 gap-4">
            {/* 左上：效率曲线 */}
            <div className="bg-bg-panel/50 backdrop-blur rounded-md border border-border-subtle p-4 overflow-hidden">
              <EfficiencyChart />
            </div>

            {/* 右上：温度剖面 */}
            <div className="bg-bg-panel/50 backdrop-blur rounded-md border border-border-subtle p-4 overflow-hidden">
              <TemperatureProfile />
            </div>

            {/* 下方：二维热力图（跨两列） */}
            <div className="col-span-2 bg-bg-panel/50 backdrop-blur rounded-md border border-border-subtle p-4 overflow-hidden min-h-0">
              <HeatmapCanvas />
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}
