import { cn } from "@/lib/utils";
import { useSimStore, HOTSPOT_PRESETS } from "@/store/useSimStore";
import { isLargeTask } from "@/api/client";
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
  X,
  Server,
  Cpu,
  AlertTriangle,
  Pencil,
  Trash2,
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

function ParamSection({ title, children }: SectionProps) {
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
  const {
    params,
    setParams,
    resetParams,
    runSim,
    cancelSim,
    status,
    progress,
    progressMessage,
    error,
    hotspots,
    selectedPreset,
    hotspotEditMode,
    setSelectedPreset,
    setHotspotEditMode,
    removeHotspot,
    clearHotspots,
  } = useSimStore();

  const computing =
    status === "computing-sync" || status === "computing-async";
  const isAsync = status === "computing-async";
  const large = isLargeTask(params);

  const pct = Math.max(0, Math.min(1, progress)) * 100;

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
        {computing && (
          <div
            className={cn(
              "border rounded-md p-3 space-y-2",
              isAsync
                ? "border-accent-cyan/40 bg-accent-cyan/5"
                : "border-accent-amber/40 bg-accent-amber/5"
            )}
          >
            <div className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-1.5 font-mono">
                {isAsync ? (
                  <Server className="w-3.5 h-3.5 text-accent-cyan" />
                ) : (
                  <Cpu className="w-3.5 h-3.5 text-accent-amber" />
                )}
                <span className={isAsync ? "text-accent-cyan" : "text-accent-amber"}>
                  {isAsync ? "异步任务模式" : "同步求解模式"}
                </span>
              </div>
              <span className="font-mono text-mono-200">
                {pct.toFixed(0)}%
              </span>
            </div>
            <div className="relative h-1.5 rounded-full bg-mono-600 overflow-hidden">
              <div
                className={cn(
                  "h-full transition-all duration-300",
                  isAsync ? "bg-accent-cyan" : "bg-accent-amber"
                )}
                style={{ width: `${pct}%` }}
              />
              {isAsync && (
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-pulse" />
              )}
            </div>
            <div className="text-[11px] font-mono text-mono-400 truncate">
              {progressMessage || "…"}
            </div>
            {isAsync && (
              <button
                onClick={() => cancelSim()}
                className="w-full mt-1 py-1.5 rounded-md font-mono text-xs border border-accent-rose/40 text-accent-rose hover:bg-accent-rose/10 flex items-center justify-center gap-1.5 transition-all"
              >
                <X className="w-3.5 h-3.5" />
                取消任务
              </button>
            )}
          </div>
        )}

        {!computing && large && (
          <div className="border border-accent-cyan/30 rounded-md p-2.5 flex items-start gap-2 bg-accent-cyan/5">
            <Server className="w-4 h-4 text-accent-cyan mt-0.5 shrink-0" />
            <div className="text-[11px] font-mono text-mono-300 leading-relaxed">
              检测到大规模仿真参数，将自动使用<span className="text-accent-cyan"> 异步任务队列 </span>
              进行后台计算，避免 504 网关超时。
            </div>
          </div>
        )}

        {status === "error" && error && (
          <div className="border border-accent-rose/40 rounded-md p-2.5 bg-accent-rose/5">
            <div className="text-[11px] font-mono text-accent-rose">
              ERROR · {error}
            </div>
          </div>
        )}

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
            max={500}
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
            max={86400}
            step={10}
            unit="s"
            icon={<Clock className="w-3.5 h-3.5" />}
            onChange={(v) => setParams({ totalTime: v })}
            format={(v) => {
              if (v >= 3600) return `${(v / 3600).toFixed(1)} h`;
              if (v >= 60) return `${(v / 60).toFixed(1)} min`;
              return `${v.toFixed(0)} s`;
            }}
          />
          <SliderField
            label="输出时间步长"
            value={params.timeStep}
            min={1}
            max={360}
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

        <ParamSection title="热斑瑕疵点">
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-mono-300 font-mono flex items-center gap-1.5">
                <AlertTriangle className="w-3.5 h-3.5 text-accent-amber" />
                瑕疵点预设
              </span>
              <button
                onClick={() => setHotspotEditMode(!hotspotEditMode)}
                className={cn(
                  "text-[10px] font-mono px-2 py-1 rounded border flex items-center gap-1.5 transition-all",
                  hotspotEditMode
                    ? "bg-accent-rose/20 text-accent-rose border-accent-rose/40"
                    : "bg-bg-panel2 text-mono-300 border-border-subtle hover:border-mono-500"
                )}
              >
                <Pencil className="w-3 h-3" />
                {hotspotEditMode ? "退出编辑" : "在图上点选"}
              </button>
            </div>

            <div className="grid grid-cols-2 gap-1.5">
              {(Object.keys(HOTSPOT_PRESETS) as Array<keyof typeof HOTSPOT_PRESETS>).map(
                (key) => {
                  const preset = HOTSPOT_PRESETS[key];
                  const active = selectedPreset === key;
                  const severityColor =
                    key === "bird_dropping"
                      ? "border-accent-rose/50 text-accent-rose"
                      : key === "delamination"
                      ? "border-accent-orange/50 text-accent-orange"
                      : key === "surface_crack"
                      ? "border-accent-amber/50 text-accent-amber"
                      : "border-mono-500 text-mono-300";
                  return (
                    <button
                      key={key}
                      onClick={() => setSelectedPreset(key)}
                      className={cn(
                        "text-[10px] font-mono py-1.5 px-2 rounded border text-left transition-all",
                        active
                          ? cn(severityColor, "bg-current/10")
                          : "border-border-subtle text-mono-400 hover:border-mono-500"
                      )}
                    >
                      <div className="font-medium">{preset.label}</div>
                      <div className="text-[9px] opacity-70">
                        k×{preset.cond} η×{preset.eff}
                      </div>
                    </button>
                  );
                }
              )}
            </div>

            {hotspots.length > 0 ? (
              <div className="space-y-1 max-h-32 overflow-y-auto">
                {hotspots
                  .sort((a, b) => a.nodeIndex - b.nodeIndex)
                  .map((hs) => (
                    <div
                      key={hs.nodeIndex}
                      className="flex items-center justify-between px-2 py-1.5 rounded bg-bg-panel2 border border-border-subtle group"
                    >
                      <div className="flex items-center gap-2">
                        <span
                          className="w-2 h-2 rounded-full"
                          style={{
                            background:
                              hs.conductivityMultiplier < 0.2
                                ? "#ff2d55"
                                : hs.conductivityMultiplier < 0.5
                                ? "#ff9500"
                                : "#ffcc00",
                          }}
                        />
                        <span className="text-[11px] font-mono text-mono-200">
                          #{hs.nodeIndex}
                        </span>
                        <span className="text-[10px] font-mono text-mono-400">
                          {hs.label}
                        </span>
                      </div>
                      <button
                        onClick={() => removeHotspot(hs.nodeIndex)}
                        className="opacity-0 group-hover:opacity-100 text-mono-500 hover:text-accent-rose transition-all"
                      >
                        <Trash2 className="w-3 h-3" />
                      </button>
                    </div>
                  ))}
              </div>
            ) : (
              <div className="text-[10px] font-mono text-mono-500 text-center py-2 border border-dashed border-border-subtle rounded">
                {hotspotEditMode
                  ? "点击右侧热力图的列添加瑕疵点"
                  : "点击「在图上点选」开始添加瑕疵点"}
              </div>
            )}

            {hotspots.length > 0 && (
              <button
                onClick={clearHotspots}
                className="w-full text-[10px] font-mono text-mono-500 hover:text-accent-rose py-1 flex items-center justify-center gap-1.5 transition-all"
              >
                <Trash2 className="w-3 h-3" />
                清除所有瑕疵点
              </button>
            )}
          </div>
        </ParamSection>
      </div>

      <div className="p-3 border-t border-border-subtle space-y-2">
        <button
          onClick={() => runSim()}
          disabled={computing}
          className={cn(
            "w-full py-2.5 rounded-md font-mono text-sm font-semibold flex items-center justify-center gap-2 transition-all",
            large
              ? "bg-accent-cyan/90 text-bg-deep hover:bg-accent-cyan hover:shadow-glow-cyan"
              : "bg-accent-amber/90 text-bg-deep hover:bg-accent-amber hover:shadow-glow-amber",
            "disabled:opacity-50 disabled:cursor-not-allowed disabled:shadow-none"
          )}
        >
          {computing ? (
            <>
              <Loader2 className="w-4 h-4 animate-spin" />
              {isAsync ? "后台计算中…" : "计算中…"}
            </>
          ) : (
            <>
              <Play className="w-4 h-4 fill-current" />
              {large ? "运行后台仿真" : "运行仿真"}
            </>
          )}
        </button>
        <button
          onClick={resetParams}
          disabled={computing}
          className="w-full py-2 rounded-md font-mono text-xs border border-mono-500 text-mono-300 hover:text-mono-100 hover:border-mono-400 flex items-center justify-center gap-1.5 transition-all"
        >
          <RotateCcw className="w-3.5 h-3.5" />
          重置参数
        </button>
      </div>
    </aside>
  );
}
