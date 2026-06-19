import { Link } from "react-router-dom";

export default function Analysis() {
  return (
    <div className="min-h-screen bg-bg-deep text-mono-200 p-8">
      <div className="max-w-5xl mx-auto">
        <Link
          to="/"
          className="text-sm font-mono text-accent-cyan hover:underline"
        >
          ← 返回驾驶舱
        </Link>
        <h1 className="font-display text-2xl font-bold mt-4 mb-6">结果分析 · 多工况对比</h1>
        <p className="text-mono-400 font-mono text-sm">
          多工况对比分析功能即将推出 / Under Construction
        </p>
      </div>
    </div>
  );
}
