/**
 * Resolve the effective studio layout (desktop | mobile) from the user's
 * view-mode preference plus the live viewport. Components that care about
 * the active layout (Studio, MobileToolbar, etc.) subscribe to this so a
 * mode change anywhere in the app re-renders them.
 */

import { useViewMode, type ViewMode } from "@/shared/store/view-mode";
import { useMediaQuery } from "./useMediaQuery";

export type EffectiveLayout = "desktop" | "mobile";

export function useStudioLayout(): {
	layout: EffectiveLayout;
	mode: ViewMode;
	setMode: (m: ViewMode) => void;
} {
	const mode = useViewMode((s) => s.mode);
	const setMode = useViewMode((s) => s.setMode);
	const isDesktopViewport = useMediaQuery("(min-width: 1024px)");

	const layout: EffectiveLayout =
		mode === "desktop"
			? "desktop"
			: mode === "mobile"
				? "mobile"
				: isDesktopViewport
					? "desktop"
					: "mobile";

	return { layout, mode, setMode };
}
