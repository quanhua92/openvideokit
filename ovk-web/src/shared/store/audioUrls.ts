/**
 * audioUrls — maps slideId → playback URL for generated TTS audio.
 * Also holds a regeneration trigger: CaptionTextEditor calls
 * requestRegenerate(), useVoiceover watches regenerateNonce.
 */
import { create } from "zustand";

export const useAudioUrls = create<{
  urls: Record<string, string>;
  setUrls: (urls: Record<string, string>) => void;
  clearSlide: (slideId: string) => void;
  generatingSlideId: string | null;
  setGenerating: (slideId: string | null) => void;
  regenerateNonce: number;
  regenerateSlideId: string | null;
  requestRegenerate: (slideId: string) => void;
}>((set) => ({
  urls: {},
  setUrls: (urls) => set({ urls }),
  clearSlide: (slideId) =>
    set((s) => {
      const next = { ...s.urls };
      delete next[slideId];
      return { urls: next };
    }),
  generatingSlideId: null,
  setGenerating: (slideId) => set({ generatingSlideId: slideId }),
  regenerateNonce: 0,
  regenerateSlideId: null,
  requestRegenerate: (slideId) =>
    set((s) => {
      const next = { ...s.urls };
      delete next[slideId];
      return {
        urls: next,
        regenerateNonce: s.regenerateNonce + 1,
        regenerateSlideId: slideId,
        generatingSlideId: slideId,
      };
    }),
}));
