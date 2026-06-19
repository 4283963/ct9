import { useMemo } from "react";
import { useSimStore } from "@/store/useSimStore";
import {
  LineChart,
  Line,
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
} from "recharts";

function CustomTooltip({ active, payload, label, labelKey }: any) {
  if (!active || !payload || payload.length === 0) return null;
  return (
    <div className="bg-bg-panel2/95 backdrop-blur border border-border-subtle px-3 py-2 rounded text-xs font-mono shadow-lg">
      <div className="text-mono-400 mb-1">
        {labelKey}: {typeof label === "number" ? label.toFixed(2) : label}
      </div>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span
            className="w-2 h-2 rounded-full"
            style={{ backgroundColor: p.color }}
          />
          <span className="text-mono-300">{p.name}</span>
          <span className="text-mono-100 ml-auto">{p.value?.toFixed?.(3) ?? p.value}</span>
        </div>
      ))}
    </div>
  );
}

export default function EfficiencyChart() {
  const { result } = useSimStore();

  const data = useMemo(() => {
    if (!result) return [];
    return result.efficiencyProfile.map((pt) => ({
      x: pt.x,
      效率: pt.eff * 100,
      辐照度: pt.G,
    }));
  }, [result]);

  if (!result) {
    return (
      <div className="h-full flex items-center justify-center text-mono-400 text-sm font-mono">
        运行仿真以查看效率曲线
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      <div className="text-xs font-mono text-mono-300 mb-2 flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-accent-emerald" />
        发电效率分布 · 沿阵列长度
      </div>
      <div className="flex-1 min-h-0">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={data} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="effGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#34D399" stopOpacity={0.4} />
                <stop offset="100%" stopColor="#34D399" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
            <XAxis
              dataKey="x"
              stroke="#64748B"
              tick={{ fill: "#94A3B8", fontSize: 11, fontFamily: "JetBrains Mono" }}
              axisLine={{ stroke: "#334155" }}
              tickLine={{ stroke: "#334155" }}
              label={{
                value: "阵列位置 (m)",
                position: "insideBottom",
                offset: -2,
                fill: "#64748B",
                fontSize: 10,
                fontFamily: "JetBrains Mono",
              }}
            />
            <YAxis
              yAxisId="left"
              stroke="#64748B"
              tick={{ fill: "#94A3B8", fontSize: 11, fontFamily: "JetBrains Mono" }}
              axisLine={{ stroke: "#334155" }}
              tickLine={{ stroke: "#334155" }}
              domain={["auto", "auto"]}
              label={{
                value: "效率 (%)",
                angle: -90,
                position: "insideLeft",
                fill: "#34D399",
                fontSize: 10,
                fontFamily: "JetBrains Mono",
              }}
            />
            <YAxis
              yAxisId="right"
              orientation="right"
              stroke="#64748B"
              tick={{ fill: "#94A3B8", fontSize: 11, fontFamily: "JetBrains Mono" }}
              axisLine={{ stroke: "#334155" }}
              tickLine={{ stroke: "#334155" }}
              label={{
                value: "辐照 (W/m²)",
                angle: 90,
                position: "insideRight",
                fill: "#F59E0B",
                fontSize: 10,
                fontFamily: "JetBrains Mono",
              }}
            />
            <Tooltip
              content={<CustomTooltip labelKey="位置 (m)" />}
              cursor={{ stroke: "#334155", strokeDasharray: "4 4" }}
            />
            <Legend
              wrapperStyle={{
                fontSize: "11px",
                fontFamily: "JetBrains Mono",
                color: "#94A3B8",
              }}
            />
            <Line
              yAxisId="left"
              type="monotone"
              dataKey="效率"
              stroke="#34D399"
              strokeWidth={2}
              dot={false}
              activeDot={{ r: 5, fill: "#34D399", stroke: "#070B14", strokeWidth: 2 }}
              name="效率"
            />
            <Line
              yAxisId="right"
              type="monotone"
              dataKey="辐照度"
              stroke="#F59E0B"
              strokeWidth={1.5}
              strokeDasharray="5 3"
              dot={false}
              name="辐照度"
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
