import { useEffect, useRef } from "react";

/**
 * Run `callback` on every animation frame, but throttled to `fps`.
 * Capping to the configured FPS keeps idle CPU/battery use low (PRD risk 7).
 * The callback is kept in a ref so changing it does not restart the loop.
 */
export function useAnimationFrame(callback, fps) {
  const callbackRef = useRef(callback);
  callbackRef.current = callback;

  useEffect(() => {
    if (!fps || fps <= 0) return undefined;

    let rafId;
    let last = performance.now();
    const interval = 1000 / fps;

    const loop = (now) => {
      rafId = requestAnimationFrame(loop);
      const elapsed = now - last;
      if (elapsed >= interval) {
        // Subtract the remainder so we don't drift over time.
        last = now - (elapsed % interval);
        callbackRef.current(now);
      }
    };

    rafId = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(rafId);
  }, [fps]);
}
