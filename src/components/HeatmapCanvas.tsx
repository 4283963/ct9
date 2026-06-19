import { useRef, useEffect, useMemo, useState } from "react";
import { useSimStore } from "@/store/useSimStore";

/**
 * 二维热力分布图谱
 * 横轴：空间位置 (m)
 * 纵轴：时间演化 (s)
 * 颜色：温度 (°C)
 *
 * 使用 Canvas 直接渲染以获得高性能
 */

interface HeatmapCanvasProps {
  className?: string;
}

// 自定义 colormap: 深蓝 -> 青 -> 黄 -> 橙红 (类 inferno/icefire)
function tempToColor(t: number, tMin: number, tMax: number): [number, number, number] {
  const ratio = tMax === tMin ? 0.5 : Math.max(0, Math.min(1, (t - tMin) / (tMax - tMin)));

  // 5 段渐变控制点
  const stops = [
    { pos: 0.0, r: 8, g: 12, b: 48 },    // 极深蓝冷
    { pos: 0.2, r: 14, g: 116, b: 144 },  // 深青
    { pos: 0.45, r: 34, g: 211, b: 238 }, // 青
    { pos: 0.7, r: 250, g: 204, b: 21 },  // 黄
    { pos: 0.85, r: 245, g: 158, b: 11 }, // 琥珀
    { pos: 1.0, r: 239, g: 68, b: 68 },   // 红
  ];

  let i = 0;
  while (i < stops.length - 1 && ratio > stops[i + 1].pos) i++;
  const s0 = stops[i];
  const s1 = stops[Math.min(i + 1, stops.length - 1)];
  const localRatio =
    s1.pos === s0.pos ? 0 : (ratio - s0.pos) / (s1.pos - s0.pos);

  return [
    Math.round(s0.r + (s1.r - s0.r) * localRatio),
    Math.round(s0.g + (s1.g - s0.g) * localRatio),
    Math.round(s0.b + (s1.b - s0.b) * localRatio),
  ];
}

export default function HeatmapCanvas({ className }: HeatmapCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const { result, currentTimeFrame } = useSimStore();
  const [sizeTick, setSizeTick] = useState(0);

  // 监听容器尺寸变化
  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setSizeTick((t) => t + 1));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const { matrix, tMin, tMax, space, time } = useMemo(() => {
    if (!result) return { matrix: null, tMin: 0, tMax: 0, space: [], time: [] };
    const m = result.spaceTimeGrid.matrix;
    let mn = Infinity;
    let mx = -Infinity;
    for (const row of m) {
      for (const v of row) {
        if (v < mn) mn = v;
        if (v > mx) mx = v;
      }
    }
    return {
      matrix: m,
      tMin: mn,
      tMax: mx,
      space: result.spaceTimeGrid.space,
      time: result.spaceTimeGrid.time,
    };
  }, [result]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const container = containerRef.current;
    if (!canvas || !container || !matrix || matrix.length === 0) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = container.getBoundingClientRect();
    const w = rect.width;
    const h = rect.height;

    canvas.width = w * dpr;
    canvas.height = h * dpr;
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.scale(dpr, dpr);

    const nRows = matrix.length;
    const nCols = matrix[0].length;
    const cellW = w / nCols;
    const cellH = h / nRows;

    const imageData = ctx.createImageData(w, h);
    const data = imageData.data;

    // 用双线性插值/最近邻采样填充每个像素
    for (let py = 0; py < h; py++) {
      const rowFrac = py / h;
      const rowIdx = Math.floor(rowFrac * nRows);
      const clampedRow = Math.max(0, Math.min(nRows - 1, rowIdx));

      for (let px = 0; px < w; px++) {
        const colFrac = px / w;
        const colIdx = Math.floor(colFrac * nCols);
        const clampedCol = Math.max(0, Math.min(nCols - 1, colIdx));

        const t = matrix[clampedRow][clampedCol];
        const [r, g, b] = tempToColor(t, tMin, tMax);

        const idx = (py * w + px) * 4;
        data[idx] = r;
        data[idx + 1] = g;
        data[idx + 2] = b;
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(imageData, 0, 0);

    // 当前时间帧指示线
    const lineY = (currentTimeFrame / (nRows - 1)) * h;
    ctx.strokeStyle = "rgba(255,255,255,0.6)";
    ctx.lineWidth = 1.5;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(0, lineY);
    ctx.lineTo(w, lineY);
    ctx.stroke();
    ctx.setLineDash([]);

    // 扫描线光晕
    const gradient = ctx.createLinearGradient(0, lineY - 10, 0, lineY + 10);
    gradient.addColorStop(0, "rgba(34, 211, 238, 0)");
    gradient.addColorStop(0.5, "rgba(34, 211, 238, 0.15)");
    gradient.addColorStop(1, "rgba(34, 211, 238, 0)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, lineY - 10, w, 20);
  }, [matrix, tMin, tMax, currentTimeFrame, sizeTick]);

  // 颜色图例条
  const colorBar = useMemo(() => {
    const stops = [];
    for (let i = 0; i <= 20; i++) {
      const ratio = i / 20;
      const [r, g, b] = tempToColor(tMin + ratio * (tMax - tMin), tMin, tMax);
      stops.push(`rgb(${r},${g},${b}) ${ratio * 100}%`);
    }
    return `linear-gradient(to bottom, ${stops.join(", ")})`;
  }, [tMin, tMax]);

  if (!result) {
    return (
      <div className="h-full flex items-center justify-center text-mono-400 text-sm font-mono">
        运行仿真以查看热力图谱
      </div>
    );
  }

  return (
    <div className="w-full h-full flex flex-col">
      <div className="text-xs font-mono text-mono-300 mb-2 flex items-center gap-2">
        <span className="w-1.5 h-1.5 rounded-full bg-accent-amber" />
        时空热力分布 · 温度场演化
      </div>
      <div className="flex-1 min-h-0 flex gap-3">
        <div
          ref={containerRef}
          className="flex-1 relative rounded border border-border-subtle overflow-hidden bg-bg-panel2"
        >
          <canvas ref={canvasRef} className="block w-full h-full" />
          {/* 坐标轴标签 */}
          <div className="absolute bottom-1 left-1/2 -translate-x-1/2 text-[10px] font-mono text-mono-400 bg-bg-deep/70 px-1.5 py-0.5 rounded">
            阵列位置 (m)
          </div>
          <div className="absolute left-1 top-1/2 -translate-y-1/2 -rotate-90 origin-left text-[10px] font-mono text-mono-400 bg-bg-deep/70 px-1.5 py-0.5 rounded whitespace-nowrap">
            时间 (s) →
          </div>
          {/* 刻度 */}
          <div className="absolute bottom-3 left-2 right-2 flex justify-between text-[10px] font-mono text-mono-400 pointer-events-none">
            <span>{space[0]?.toFixed(1)}</span>
            <span>{space[Math.floor(space.length / 2)]?.toFixed(1)}</span>
            <span>{space[space.length - 1]?.toFixed(1)}</span>
          </div>
          <div className="absolute top-2 bottom-8 left-1 flex flex-col justify-between text-[10px] font-mono text-mono-400 pointer-events-none">
            <span>{time[0]?.toFixed(0)}</span>
            <span>{time[Math.floor(time.length / 2)]?.toFixed(0)}</span>
            <span>{time[time.length - 1]?.toFixed(0)}</span>
          </div>
        </div>

        {/* 颜色条 */}
        <div className="flex flex-col items-center gap-1 w-8">
          <div
            className="flex-1 w-full rounded border border-border-subtle"
            style={{ background: colorBar }}
          />
          <div className="text-[10px] font-mono text-mono-400 text-center space-y-0.5">
            <div>{tMax.toFixed(1)}°</div>
            <div className="text-mono-500">—</div>
            <div>{tMin.toFixed(1)}°</div>
          </div>
        </div>
      </div>
    </div>
  );
}
