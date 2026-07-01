/**
 * compositionVersion — bumped after every successful save or SSE push.
 * StageCanvas appends `?v=N` to the HF player src so the iframe reloads.
 */
import { create } from "zustand";

export const useCompositionVersion = create<{
  version: number;
  bump: () => void;
}>((set) => ({
  version: 0,
  bump: () => set((s) => ({ version: s.version + 1 })),
}));
