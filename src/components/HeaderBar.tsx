import { useSimStore } from "@/store/useSimStore";
import { Activity, Sun, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

export default function HeaderBar() {
  const { status, result } = useSimStore();

  const statusMap = {
    idle: { label: "待机", color: "text-mono-400", bg: "bg-mono-500" },
    computing: { label: "计算中", color: "text-accent-amber", bg: "bg-accent-amber" },
    ready: { label: "就绪", color: "text-accent-emerald", bg: "bg-accent-emerald" },
    error: { label: "错误", color: "text-accent-rose", bg: "bg-accent-rose" },
  };

  const s = statusMap[status];

  return (
    <header className="h-14 flex items-center justify-between px-5 border-b border-border-subtle bg-bg-panel2/80 backdrop-blur">
      <div className="flex items-center gap-3">
        <div className="p-1.5 rounded-md bg-accent-amber/10 border border-accent-amber/30">
          <Sun className="w-5 h-5 text-accent-amber" />
        </div>
        <div>
          <h1 className="font-display text-base font-bold text-mono-100 tracking-tight">
            PV Array Simulator
          </h1>
          <p className="text-[11px] font-mono text-mono-400 -mt-0.5">
            光伏阵列热扩散 · 发电效率耦合仿真系统
          </p>
        </div>
      </div>

      <div className="flex items-center gap-6">
        <div className="flex items-center gap-2 text-xs font-mono">
          <Activity className="w-3.5 h-3.5 text-accent-cyan" />
          <span className="text-mono-400">1D HEAT DIFFUSION</span>
          <span className="text-mono-500">·</span>
          <span className="text-mono-400">SciPy</span>
        </div>

        <div className="flex items-center gap-2">
          <Circle
            className={cn(
              "w-2.5 h-2.5 fill-current",
              s.color,
              status === "computing" && "animate-pulse"
            )}
          />
          <span className={cn("text-xs font-mono font-medium", s.color)}>
            {s.label}
          </span>
          {status === "computing" && (
            <span className="text-[10px] font-mono text-mono-500 ml-1">
              求解 PDE…
            </span>
          )}
          {status === "ready" && result && (
            <span className="text-[10px] font-mono text-mono-500 ml-1">
              {result.timeLabels.length} × {result.spaceLabels.length} 网格
            </span>
          )}
        </div>
      </div>
    </header>
  );
}
