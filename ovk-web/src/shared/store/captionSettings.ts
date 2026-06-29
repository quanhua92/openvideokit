/**
 * Caption display settings — presets + per-property overrides.
 *
 * The 4 built-in styles (highlight / neon / editorial / eco-green) are just
 * starting points. Picking one loads its values into `custom`; the user can
 * then tweak any property below the picker. Everything is persisted to
 * localStorage and applied to the stage via CSS custom properties.
 */
import { create } from "zustand";

import type { CaptionStyle } from "@/shared/api/schemas/rootIndex";

const STORAGE_KEY = "ovk:caption-settings-v2";

export interface CaptionCustomSettings {
	/** Active word text color (hex). */
	activeColor: string;
	/** Pill background color (hex) — only used when pill is on. */
	pillColor: string;
	/** Inactive word opacity (0–1). */
	dimOpacity: number;
	/** Font weight 400–900. */
	fontWeight: number;
	/** Drop-shadow glow on active word (0 = off, 1 = max). */
	glow: number;
	/** Background pill behind active word. */
	pill: boolean;
	/** Text-shadow on base word for legibility against busy video. */
	shadow: boolean;
	/** Bottom gradient scrim for caption legibility. */
	scrim: boolean;
	/** Letter-spacing in em. */
	letterSpacing: number;
	/** Font scale multiplier (0.5–1.5). */
	fontScale: number;
}

export const PRESETS: Record<CaptionStyle, CaptionCustomSettings> = {
	highlight: {
		activeColor: "#0a0a14",
		pillColor: "#ffea00",
		dimOpacity: 0.5,
		fontWeight: 900,
		glow: 0,
		pill: true,
		shadow: false,
		letterSpacing: -0.02,
		scrim: false,
		fontScale: 1,
	},
	neon: {
		activeColor: "#00f5ff",
		pillColor: "#0a0a14",
		dimOpacity: 0.25,
		fontWeight: 700,
		glow: 0.8,
		pill: true,
		shadow: true,
		letterSpacing: 0.01,
		scrim: false,
		fontScale: 1,
	},
	editorial: {
		activeColor: "#ffd700",
		pillColor: "#1a1a2e",
		dimOpacity: 0.32,
		fontWeight: 400,
		glow: 0,
		pill: true,
		shadow: true,
		letterSpacing: -0.01,
		scrim: false,
		fontScale: 1,
	},
	"eco-green": {
		activeColor: "#4ade80",
		pillColor: "#0a1a0a",
		dimOpacity: 0.3,
		fontWeight: 800,
		glow: 0.5,
		pill: true,
		shadow: true,
		letterSpacing: -0.01,
		scrim: false,
		fontScale: 1,
	},
};

interface CaptionSettingsStore {
	preset: CaptionStyle;
	custom: CaptionCustomSettings;
	/** Load a preset into custom. */
	applyPreset: (preset: CaptionStyle) => void;
	/** Patch one or more custom properties. */
	patch: (partial: Partial<CaptionCustomSettings>) => void;
	/** Reset custom back to the current preset. */
	reset: () => void;
}

function readStored(): { preset: CaptionStyle; custom: CaptionCustomSettings } {
	const fallback = PRESETS.highlight;
	if (typeof localStorage === "undefined") {
		return { preset: "highlight", custom: fallback };
	}
	try {
		const raw = localStorage.getItem(STORAGE_KEY);
		if (!raw) return { preset: "highlight", custom: fallback };
		const parsed = JSON.parse(raw) as {
			preset: CaptionStyle;
			custom: CaptionCustomSettings;
		};
		return {
			preset: parsed.preset ?? "highlight",
			custom: { ...fallback, ...parsed.custom },
		};
	} catch {
		return { preset: "highlight", custom: fallback };
	}
}

function writeStored(preset: CaptionStyle, custom: CaptionCustomSettings) {
	if (typeof localStorage === "undefined") return;
	localStorage.setItem(STORAGE_KEY, JSON.stringify({ preset, custom }));
}

const initial = readStored();

export const useCaptionSettings = create<CaptionSettingsStore>((set, get) => ({
	preset: initial.preset,
	custom: initial.custom,
	applyPreset: (preset) => {
		const base = { ...PRESETS[preset], fontScale: get().custom.fontScale };
		writeStored(preset, base);
		set({ preset, custom: base });
	},
	patch: (partial) => {
		const next = { ...get().custom, ...partial };
		writeStored(get().preset, next);
		set({ custom: next });
	},
	reset: () => {
		const preset = get().preset;
		const base = { ...PRESETS[preset], fontScale: get().custom.fontScale };
		writeStored(preset, base);
		set({ custom: base });
	},
}));
