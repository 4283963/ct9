import { useMemo } from "react";
import { useSimStore } from "@/store/useSimStore";
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
} from "recharts";
import { cn } from "@/lib/utils";
import { Play, Pause, SkipBack, SkipForward } from "lucide-react";

function CustomTooltip({ active, payload, label }: any) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-bg-panel2/95 backdrop-blur border border-border-subtle px-3 py-2 rounded text-xs font-mono shadow-lg">
      <div className="text-mono-400 mb-1">位置: {label.toFixed(3)} m</div>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: p.color }}
          />
          <span className="text-mono-300">{p.name}</span>
          <span className="text-mono-100 ml-auto">{p.value?.toFixed?.(2) ?? p.value} °C</span>
        </div>
      ))}
    </div>
  );
}

export default function TemperatureProfile() {
  const {
    result,
    currentTimeFrame,
    setCurrentTimeFrame,
    isPlaying,
    togglePlay,
  } = useSimStore();

  const data = useMemo(() => {
    if (!result) return [];
    const temps = result.spaceTimeGrid.matrix[currentTimeFrame] || [];
    const space = result.spaceTimeGrid.space;
    return space.map((x, i) => ({
      x,
      温度: temps[i] ?? 0,
    }));
  }, [result, currentTimeFrame]);

  const currentTime = result?.timeLabels[currentTimeFrame] ?? 0;
  const maxFrames = result?.timeLabels.length ?? 1;

  if (!result) {
    return (
      <div className="h-full flex items-center justify-center text-mono-400 text-sm font-mono">
        运行仿真以查看温度剖面
      </div>
    );
  }

  const formatTime = (s: number) => {
    if (s >= 60) return `${(s / 60).toFixed(1)} min`;
    return `${s.toFixed(0)} s`;
  };

  return (
    <div className="w-full h-full flex flex-col">
      <div className="flex items-center justify-between mb-2">
        <div className="text-xs font-mono text-mono-300 flex items-center gap-2">
          <span className="w-1.5 h-1.5 rounded-full bg-accent-cyan animate-pulse-glow" />
          温度剖面 · T ={" "}
          <span className="text-accent-cyan">{formatTime(currentTime)}</span>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => setCurrentTimeFrame(0)}
            className="p-1 text-mono-400 hover:text-mono-100 transition-colors"
            title="起始"
          >
            <SkipBack className="w-4 h-4" />
          </button>
          <button
            onClick={togglePlay}
            className={cn(
              "p-1.5 rounded border transition-colors",
              isPlaying
                ? "text-accent-cyan border-accent-cyan/40 bg-accent-cyan/10"
                : "text-mono-400 border-mono-500 hover:text-mono-100"
            )}
            title={isPlaying ? "暂停" : "播放"}
          >
            {isPlaying ? (
              <Pause className="w-4 h-4" />
            ) : (
              <Play className="w-4 h-4" />
            )}
          </button>
          <button
            onClick={() => setCurrentTimeFrame(maxFrames - 1)}
            className="p-1 text-mono-400 hover:text-mono-100 transition-colors"
            title="结束"
          >
            <SkipForward className="w-4 h-4" />
          </button>
        </div>
      </div>

      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="tempGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#22D3EE" stopOpacity={0.5} />
                <stop offset="100%" stopColor="#22D3EE" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
            <XAxis
              dataKey="x"
              stroke="#64748B"
              tick={{ fill: "#94A3B8", fontSize: 10, fontFamily: "JetBrains Mono" }}
              axisLine={{ stroke: "#334155" }}
              tickLine={{ stroke: "#334155" }}
            />
            <YAxis
              stroke="#64748B"
              tick={{ fill: "#94A3B8", fontSize: 10, fontFamily: "JetBrains Mono" }}
              axisLine={{ stroke: "#334155" }}
              tickLine={{ stroke: "#334155" }}
              domain={["auto", "auto"]}
              label={{
                value: "温度 (°C)",
                angle: -90,
                position: "insideLeft",
                fill: "#22D3EE",
                fontSize: 10,
                fontFamily: "JetBrains Mono",
              }}
            />
            <Tooltip content={<CustomTooltip />} cursor={{ stroke: "#334155", strokeDasharray: "4 4" }} />
            <ReferenceLine
              y={result?.metrics?.avgTemp ?? 25}
              stroke="#F59E0B"
              strokeDasharray="4 4"
              strokeWidth={1}
            />
            <Area
              type="monotone"
              dataKey="温度"
              stroke="#22D3EE"
              strokeWidth={2}
              fill="url(#tempGrad)"
              name="温度"
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      <div className="mt-2 px-1">
        <input
          type="range"
          min={0}
          max={maxFrames - 1}
          value={currentTimeFrame}
          onChange={(e) => setCurrentTimeFrame(parseInt(e.target.value))}
          className="w-full h-1 bg-mono-600 rounded-full appearance-none cursor-pointer
            [&::-webkit-slider-thumb]:appearance-none
            [&::-webkit-slider-thumb]:w-3
            [&::-webkit-slider-thumb]:h-3
            [&::-webkit-slider-thumb]:rounded-full
            [&::-webkit-slider-thumb]:bg-accent-cyan
            [&::-webkit-slider-thumb]:shadow-glow-cyan
            [&::-webkit-slider-thumb]:cursor-pointer"
        />
      </div>
    </div>
  );
}
