/**
 * Playhead store — the single source of truth for playback position.
 *
 * Critical invariant: the rAF loop in P2's usePreviewEngine writes `t` up to
 * 60×/sec via `usePlayhead.getState().seek(t)` — NEVER via React state. This
 * keeps per-frame writes off the React reconciliation cycle.
 *
 * Components that need to re-render on playhead change opt in via
 * `usePlayhead(s => s.t)`. A component that doesn't select `t` (e.g. the
 * Properties panel) doesn't re-render at all.
 */
import { create } from "zustand";

export interface PlayheadState {
  t: number;
  playing: boolean;
  duration: number;
  seek: (t: number) => void;
  togglePlay: () => void;
  setPlaying: (playing: boolean) => void;
  setDuration: (duration: number) => void;
}

export const usePlayhead = create<PlayheadState>((set) => ({
  t: 0,
  playing: false,
  duration: 12,
  seek: (t) => set({ t }),
  togglePlay: () => set((s) => ({ playing: !s.playing })),
  setPlaying: (playing) => set({ playing }),
  setDuration: (duration) => set({ duration }),
}));
