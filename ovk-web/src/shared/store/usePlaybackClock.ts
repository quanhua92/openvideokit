/**
 * usePlaybackClock — drives the playhead forward in real time when `playing`
 * is true. Reads/writes the store via getState() so the rAF loop triggers
 * ZERO React re-renders per frame; only components that subscribe via
 * `usePlayhead(s => s.t)` (e.g. TransportBar, Timeline playhead line) re-render.
 *
 * Stops automatically at end of duration. Mount once in <Studio/> while
 * the editor is active.
 */
import { useEffect } from "react";

import { usePlayhead } from "@/shared/store/playhead";

export function usePlaybackClock() {
  const playing = usePlayhead((s) => s.playing);

  useEffect(() => {
    if (!playing) return;
    let raf = 0;
    let lastTs = performance.now();

    const tick = (ts: number) => {
      const dt = (ts - lastTs) / 1000;
      lastTs = ts;

      const state = usePlayhead.getState();
      const next = state.t + dt;
      if (next >= state.duration) {
        state.seek(state.duration);
        state.setPlaying(false);
        return;
      }
      state.seek(next);
      raf = requestAnimationFrame(tick);
    };

    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [playing]);
}
