import { cn } from "@/lib/utils";
import { useSimStore } from "@/store/useSimStore";
import {
  Sun,
  Thermometer,
  Ruler,
  Grid3x3,
  Clock,
  Zap,
  Flame,
  Wind,
  Play,
  RotateCcw,
  Loader2,
} from "lucide-react";

interface SliderFieldProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  icon?: React.ReactNode;
  onChange: (value: number) => void;
  format?: (v: number) => string;
}

function SliderField({
  label,
  value,
  min,
  max,
  step,
  unit,
  icon,
  onChange,
  format,
}: SliderFieldProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div className="space-y-1.5">
      <div className="flex items-center justify-between text-xs">
        <div className="flex items-center gap-1.5 text-mono-300">
          {icon}
          <span>{label}</span>
        </div>
        <span className="font-mono text-accent-cyan">
          {format ? format(value) : value.toFixed(step < 1 ? 4 : 0)}
          {unit && <span className="text-mono-400 ml-0.5">{unit}</span>}
        </span>
      </div>
      <div className="relative h-5 flex items-center">
        <div className="absolute left-0 right-0 h-1 rounded-full bg-mono-600" />
        <div
          className="absolute left-0 h-1 rounded-full bg-accent-cyan/70"
          style={{ width: `${pct}%` }}
        />
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(parseFloat(e.target.value))}
          className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
        />
        <div
          className="absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full bg-accent-cyan shadow-glow-cyan pointer-events-none"
          style={{ left: `calc(${pct}% - 6px)` }}
        />
      </div>
    </div>
  );
}

interface SectionProps {
  title: string;
  children: React.ReactNode;
  defaultOpen?: boolean;
}

function ParamSection({ title, children, defaultOpen = true }: SectionProps) {
  return (
    <div className="border border-border-subtle rounded-md overflow-hidden">
      <div className="px-3 py-2 bg-bg-panel2/70 border-b border-border-subtle flex items-center justify-between">
        <span className="text-xs font-medium text-mono-200 tracking-wider uppercase">
          {title}
        </span>
      </div>
      <div className="p-3 space-y-3">{children}</div>
    </div>
  );
}

export default function ParameterPanel() {
  const { params, setParams, resetParams, runSim, status } = useSimStore();
  const isComputing = status === "computing";

  return (
    <aside className="h-full w-80 flex flex-col bg-bg-panel2/60 backdrop-blur border-r border-border-subtle">
      <div className="px-4 py-3 border-b border-border-subtle">
        <h2 className="font-mono text-sm font-semibold text-mono-100 flex items-center gap-2">
          <Zap className="w-4 h-4 text-accent-amber" />
          仿真参数配置
        </h2>
        <p className="text-[11px] text-mono-400 mt-0.5 font-mono">
          SOLAR · PV ARRAY · 1D HEAT DIFFUSION
        </p>
      </div>

      <div className="flex-1 overflow-y-auto p-3 space-y-3">
        <ParamSection title="环境条件">
          <SliderField
            label="环境温度"
            value={params.ambientTemp}
            min={-20}
            max={60}
            step={0.5}
            unit="°C"
            icon={<Thermometer className="w-3.5 h-3.5" />}
            onChange={(v) => setParams({ ambientTemp: v })}
            format={(v) => v.toFixed(1)}
          />
          <SliderField
            label="光照辐照度"
            value={params.irradiance}
            min={50}
            max={1200}
            step={10}
            unit="W/m²"
            icon={<Sun className="w-3.5 h-3.5 text-accent-amber" />}
            onChange={(v) => setParams({ irradiance: v })}
            format={(v) => v.toFixed(0)}
          />
          <SliderField
            label="对流换热系数"
            value={params.heatTransferCoeff}
            min={2}
            max={100}
            step={0.5}
            unit="W/m²·K"
            icon={<Wind className="w-3.5 h-3.5" />}
            onChange={(v) => setParams({ heatTransferCoeff: v })}
            format={(v) => v.toFixed(1)}
          />
        </ParamSection>

        <ParamSection title="阵列几何">
          <SliderField
            label="阵列长度"
            value={params.arrayLength}
            min={0.2}
            max={10}
            step={0.1}
            unit="m"
            icon={<Ruler className="w-3.5 h-3.5" />}
            onChange={(v) => setParams({ arrayLength: v })}
            format={(v) => v.toFixed(1)}
          />
          <SliderField
            label="空间网格节点"
            value={params.nodes}
            min={10}
            max={200}
            step={1}
            icon={<Grid3x3 className="w-3.5 h-3.5" />}
            onChange={(v) => setParams({ nodes: Math.round(v) })}
            format={(v) => Math.round(v).toString()}
          />
        </ParamSection>

        <ParamSection title="时间设置">
          <SliderField
            label="总仿真时长"
            value={params.totalTime}
            min={30}
            max={3600}
            step={10}
            unit="s"
            icon={<Clock className="w-3.5 h-3.5" />}
            onChange={(v) => setParams({ totalTime: v })}
            format={(v) => v.toFixed(0)}
          />
          <SliderField
            label="输出时间步长"
            value={params.timeStep}
            min={1}
            max={60}
            step={1}
            unit="s"
            icon={<Clock className="w-3.5 h-3.5" />}
            onChange={(v) => setParams({ timeStep: v })}
            format={(v) => v.toFixed(0)}
          />
        </ParamSection>

        <ParamSection title="材料与电池">
          <SliderField
            label="热扩散系数 α"
            value={params.alpha}
            min={1e-6}
            max={1e-3}
            step={1e-6}
            unit="m²/s"
            icon={<Flame className="w-3.5 h-3.5 text-accent-amber" />}
            onChange={(v) => setParams({ alpha: v })}
            format={(v) => v.toExponential(2)}
          />
          <SliderField
            label="STC 参考效率"
            value={params.refEfficiency}
            min={0.1}
            max={0.4}
            step={0.005}
            icon={<Zap className="w-3.5 h-3.5 text-accent-emerald" />}
            onChange={(v) => setParams({ refEfficiency: v })}
            format={(v) => (v * 100).toFixed(1) + "%"}
          />
          <SliderField
            label="温度系数 β"
            value={params.tempCoeff}
            min={0.001}
            max={0.008}
            step={0.0001}
            unit="/°C"
            icon={<Thermometer className="w-3.5 h-3.5 text-accent-rose" />}
            onChange={(v) => setParams({ tempCoeff: v })}
            format={(v) => v.toFixed(4)}
          />
        </ParamSection>
      </div>

      <div className="p-3 border-t border-border-subtle space-y-2">
        <button
          onClick={() => runSim()}
          disabled={isComputing}
          className={cn(
            "w-full py-2.5 rounded-md font-mono text-sm font-semibold flex items-center justify-center gap-2 transition-all",
            "bg-accent-cyan/90 text-bg-deep hover:bg-accent-cyan hover:shadow-glow-cyan",
            "disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
          )}
        >
          {isComputing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              计算中…
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current" />
              运行仿真
            </>
          )}
        </button>
        <button
          onClick={resetParams}
          disabled={isComputing}
          className="w-full py-2 rounded-md font-mono text-xs border border-mono-500 text-mono-300 hover:text-mono-100 hover:border-mono-400 flex items-center justify-center gap-1.5 transition-all"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          重置参数
        </button>
      </div>
    </aside>
  );
}
