import { useSimStore } from "@/store/useSimStore";
import { Activity, Sun, Circle } from "lucide-react";
import { cn } from "@/lib/utils";

export default function HeaderBar() {
  const { status, result, progress, isAsyncMode } = useSimStore();

  const statusMap: Record<
    string,
    { label: string; color: string; bg: string; pulse?: boolean }
  > = {
    idle: { label: "待机", color: "text-mono-400", bg: "bg-mono-500" },
    "computing-sync": {
      label: "计算中",
      color: "text-accent-amber",
      bg: "bg-accent-amber",
      pulse: true,
    },
    "computing-async": {
      label: "后台计算",
      color: "text-accent-cyan",
      bg: "bg-accent-cyan",
      pulse: true,
    },
    ready: {
      label: "就绪",
      color: "text-accent-emerald",
      bg: "bg-accent-emerald",
    },
    error: {
      label: "错误",
      color: "text-accent-rose",
      bg: "bg-accent-rose",
    },
  };

  const s = statusMap[status] ?? statusMap.idle;
  const computing =
    status === "computing-sync" || status === "computing-async";

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
          {isAsyncMode && (
            <>
              <span className="text-mono-500">·</span>
              <span className="text-accent-cyan">ASYNC</span>
            </>
          )}
        </div>

        <div className="flex items-center gap-2">
          <Circle
            className={cn("w-2.5 h-2.5 fill-current", s.color, s.pulse && "animate-pulse")}
          />
          <span className={cn("text-xs font-mono font-medium", s.color)}>
            {s.label}
          </span>
          {computing && (
            <span className="text-[10px] font-mono text-mono-500 ml-1">
              {isAsyncMode
                ? `任务队列 ${(progress * 100).toFixed(0)}%`
                : "求解 PDE…"}
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
