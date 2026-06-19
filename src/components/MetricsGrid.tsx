import { useSimStore } from "@/store/useSimStore";
import { cn } from "@/lib/utils";
import {
  Gauge,
  ThermometerSun,
  Flame,
  BatteryCharging,
  Timer,
} from "lucide-react";

interface MetricCardProps {
  label: string;
  value: string;
  unit: string;
  icon: React.ReactNode;
  color: "cyan" | "amber" | "emerald" | "rose";
  sublabel?: string;
}

function MetricCard({ label, value, unit, icon, color, sublabel }: MetricCardProps) {
  const colorMap = {
    cyan: "text-accent-cyan border-accent-cyan/30 shadow-glow-cyan",
    amber: "text-accent-amber border-accent-amber/30 shadow-glow-amber",
    emerald: "text-accent-emerald border-accent-emerald/30 shadow-glow-emerald",
    rose: "text-accent-rose border-accent-rose/30",
  };
  return (
    <div
      className={cn(
        "p-4 rounded-md border bg-bg-panel2/80 backdrop-blur-sm",
        "border-border-subtle",
        "hover:border-opacity-80 transition-all"
      )}
    >
      <div className="flex items-start justify-between mb-2">
        <span className="text-[11px] uppercase tracking-wider text-mono-400 font-mono">
          {label}
        </span>
        <div className={cn("p-1.5 rounded", colorMap[color])}>
          {icon}
        </div>
      </div>
      <div className="flex items-baseline gap-1.5">
        <span
          className={cn(
            "font-mono text-2xl font-bold tabular-nums",
            colorMap[color].split(" ")[0]
          )}
        >
          {value}
        </span>
        <span className="text-xs text-mono-400 font-mono">{unit}</span>
      </div>
      {sublabel && (
        <div className="text-[10px] text-mono-500 font-mono mt-1">{sublabel}</div>
      )}
    </div>
  );
}

function formatPercent(v: number, digits = 2) {
  return (v * 100).toFixed(digits);
}

function formatTemp(v: number) {
  return v.toFixed(2);
}

function formatEnergy(v: number) {
  if (v >= 1e6) return (v / 1e6).toFixed(2) + "M";
  if (v >= 1e3) return (v / 1e3).toFixed(1) + "k";
  return v.toFixed(1);
}

function formatTime(v: number) {
  if (v >= 3600) return (v / 3600).toFixed(2) + " h";
  if (v >= 60) return (v / 60).toFixed(1) + " min";
  return v.toFixed(0) + " s";
}

export default function MetricsGrid() {
  const { result, status } = useSimStore();
  const m = result?.metrics;
  const loading =
    status === "computing-sync" || status === "computing-async";
  const empty = status === "idle" || status === "error";

  return (
    <div className="grid grid-cols-5 gap-3">
      <MetricCard
        label="峰值效率"
        value={empty ? "—" : formatPercent(m?.peakEfficiency ?? 0)}
        unit="%"
        color="emerald"
        icon={<Gauge className="w-4 h-4" />}
        sublabel="Peak Efficiency"
      />
      <MetricCard
        label="平均温度"
        value={empty ? "—" : formatTemp(m?.avgTemp ?? 0)}
        unit="°C"
        color="cyan"
        icon={<ThermometerSun className="w-4 h-4" />}
        sublabel="Avg Cell Temp"
      />
      <MetricCard
        label="峰值温度"
        value={empty ? "—" : formatTemp(m?.peakTemp ?? 0)}
        unit="°C"
        color="amber"
        icon={<Flame className="w-4 h-4" />}
        sublabel="Peak Temperature"
      />
      <MetricCard
        label="总发电量"
        value={empty ? "—" : formatEnergy(m?.totalEnergy ?? 0)}
        unit="J/m"
        color="emerald"
        icon={<BatteryCharging className="w-4 h-4" />}
        sublabel="Total Energy / m"
      />
      <MetricCard
        label="稳态时间"
        value={empty ? "—" : formatTime(m?.steadyStateTime ?? 0)}
        unit=""
        color="cyan"
        icon={<Timer className="w-4 h-4" />}
        sublabel="Steady-State"
      />
      {loading && (
        <div className="col-span-5 text-center text-xs font-mono text-mono-400 animate-pulse">
          ◉ 求解一维热扩散 PDE 中…
        </div>
      )}
    </div>
  );
}
