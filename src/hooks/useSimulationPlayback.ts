import { useEffect, useRef } from "react";
import { useSimStore } from "@/store/useSimStore";

/**
 * 时间演化动画 hook
 * 当 isPlaying 为 true 时，按指定帧速前进 currentTimeFrame
 */
export function useSimulationPlayback(fps = 30) {
  const { isPlaying, currentTimeFrame, result, setCurrentTimeFrame } = useSimStore();
  const rafRef = useRef<number | null>(null);
  const lastTickRef = useRef<number>(0);

  useEffect(() => {
    if (!isPlaying || !result) return;

    const interval = 1000 / fps;
    const totalFrames = result.timeLabels.length;

    const tick = (now: number) => {
      if (now - lastTickRef.current >= interval) {
        lastTickRef.current = now;
        setCurrentTimeFrame(
          (currentTimeFrame + 1) % totalFrames
        );
      }
      rafRef.current = requestAnimationFrame(tick);
    };

    rafRef.current = requestAnimationFrame(tick);

    return () => {
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
      }
    };
  }, [isPlaying, result, fps, currentTimeFrame, setCurrentTimeFrame]);
}
