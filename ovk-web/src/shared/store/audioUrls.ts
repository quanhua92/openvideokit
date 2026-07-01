/**
 * audioUrls — maps slideId → playback URL for generated TTS audio.
 * Populated by useVoiceover after the /tts endpoint returns; read by
 * StageCanvas to play the active slide's voiceover.
 */
import { create } from "zustand";

export const useAudioUrls = create<{
  urls: Record<string, string>;
  setUrls: (urls: Record<string, string>) => void;
}>((set) => ({
  urls: {},
  setUrls: (urls) => set({ urls }),
}));
