/**
 * View-mode override — lets the user force the studio into desktop or mobile
 * layout regardless of viewport, for testing. Stored in localStorage so a
 * forced mode survives reloads.
 *
 *   default → follows the viewport (responsive)
 *   desktop → desktop layout always
 *   mobile  → mobile layout always
 */
import { create } from "zustand";

export type ViewMode = "default" | "desktop" | "mobile";

const STORAGE_KEY = "ovk:view-mode";

function getInitial(): ViewMode {
	if (typeof localStorage === "undefined") return "default";
	return (localStorage.getItem(STORAGE_KEY) as ViewMode | null) ?? "default";
}

interface ViewModeStore {
	mode: ViewMode;
	setMode: (mode: ViewMode) => void;
}

export const useViewMode = create<ViewModeStore>((set) => ({
	mode: getInitial(),
	setMode: (mode) => {
		if (typeof localStorage !== "undefined") {
			localStorage.setItem(STORAGE_KEY, mode);
		}
		set({ mode });
	},
}));

const LABELS: Record<ViewMode, string> = {
	default: "Default",
	desktop: "Desktop",
	mobile: "Mobile",
};

export function viewModeLabel(mode: ViewMode): string {
	return LABELS[mode];
}
