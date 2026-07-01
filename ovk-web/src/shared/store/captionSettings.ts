/**
 * Caption display settings — local cache synced to the project bundle.
 *
 * The source of truth is ``root.captions`` in the project bundle (persisted
 * to the server via EditBus). This store provides instant local updates for
 * the CaptionControls UI and is synced FROM the bundle on project load/SSE.
 *
 * Changes are dispatched via ``setCaptionSettings`` EditBus op by the
 * component layer (CaptionControls), NOT by the store itself.
 */
import { create } from "zustand";
import type {
  CaptionSettings,
  CaptionStyle,
} from "@/shared/api/schemas/rootIndex";

export interface CaptionCustomSettings {
  activeColor: string;
  pillColor: string;
  dimColor: string;
  dimOpacity: number;
  fontWeight: number;
  glow: number;
  pill: boolean;
  shadow: boolean;
  scrim: boolean;
  letterSpacing: number;
  fontScale: number;
}

export const PRESETS: Record<CaptionStyle, CaptionCustomSettings> = {
  highlight: {
    activeColor: "#ffea00",
    pillColor: "#0a0a14",
    dimColor: "#ffffff",
    dimOpacity: 0.5,
    fontWeight: 900,
    glow: 0,
    pill: true,
    shadow: false,
    scrim: false,
    letterSpacing: -0.02,
    fontScale: 1,
  },
  neon: {
    activeColor: "#00f5ff",
    pillColor: "#0a0a14",
    dimColor: "#ffffff",
    dimOpacity: 0.25,
    fontWeight: 700,
    glow: 0.8,
    pill: true,
    shadow: true,
    scrim: false,
    letterSpacing: 0.01,
    fontScale: 1,
  },
  editorial: {
    activeColor: "#ffd700",
    pillColor: "#1a1a2e",
    dimColor: "#ffffff",
    dimOpacity: 0.32,
    fontWeight: 400,
    glow: 0,
    pill: true,
    shadow: true,
    scrim: false,
    letterSpacing: -0.01,
    fontScale: 1,
  },
  "eco-green": {
    activeColor: "#4ade80",
    pillColor: "#0a1a0a",
    dimColor: "#ffffff",
    dimOpacity: 0.3,
    fontWeight: 800,
    glow: 0.5,
    pill: true,
    shadow: true,
    scrim: false,
    letterSpacing: -0.01,
    fontScale: 1,
  },
};

interface CaptionSettingsStore {
  preset: CaptionStyle;
  custom: CaptionCustomSettings;
  /** Sync from project bundle (called on load + SSE). */
  syncFromBundle: (caps?: CaptionSettings) => void;
  /** Load a preset into custom (local only — caller dispatches EditBus). */
  applyPreset: (preset: CaptionStyle) => void;
  /** Patch one or more custom properties (local only). */
  patch: (partial: Partial<CaptionCustomSettings>) => void;
  /** Reset custom back to the current preset (local only). */
  reset: () => void;
}

export const useCaptionSettings = create<CaptionSettingsStore>((set, get) => ({
  preset: "highlight",
  custom: { ...PRESETS.highlight },
  syncFromBundle: (caps) => {
    if (!caps) return;
    set({
      preset: caps.preset ?? "highlight",
      custom: {
        activeColor: caps.activeColor,
        pillColor: caps.pillColor,
        dimColor: caps.dimColor,
        dimOpacity: caps.dimOpacity,
        fontWeight: caps.fontWeight,
        glow: caps.glow,
        pill: caps.pill,
        shadow: caps.shadow,
        scrim: caps.scrim,
        letterSpacing: caps.letterSpacing,
        fontScale: caps.fontScale,
      },
    });
  },
  applyPreset: (preset) => {
    const base = { ...PRESETS[preset], fontScale: get().custom.fontScale };
    set({ preset, custom: base });
  },
  patch: (partial) => {
    set({ custom: { ...get().custom, ...partial } });
  },
  reset: () => {
    const preset = get().preset;
    const base = { ...PRESETS[preset], fontScale: get().custom.fontScale };
    set({ custom: base });
  },
}));
