import { useEffect, useState } from "react";

import {
	applyTheme,
	getStoredTheme,
	setTheme as persistTheme,
	type ResolvedTheme,
	resolveTheme,
	type Theme,
} from "@/shared/lib/theme";

export interface UseTheme {
	theme: Theme;
	resolved: ResolvedTheme;
	setTheme: (next: Theme) => void;
}

/**
 * React binding for the theme module. The .dark class is the single source
 * of truth on <html>; this hook keeps React state in sync with it and
 * re-applies when the user picks a new option or the system preference
 * changes (only in `system` mode).
 */
export function useTheme(): UseTheme {
	const [theme, setThemeState] = useState<Theme>(() => getStoredTheme());
	const [resolved, setResolved] = useState<ResolvedTheme>(() => {
		if (typeof document === "undefined") return "light";
		return document.documentElement.classList.contains("dark")
			? "dark"
			: "light";
	});

	// Apply + persist whenever the user picks a new option.
	const setTheme = (next: Theme) => {
		persistTheme(next);
		setThemeState(next);
		setResolved(resolveTheme(next));
	};

	// When in system mode, listen for OS preference changes.
	useEffect(() => {
		if (theme !== "system" || typeof window === "undefined") return;
		const mq = window.matchMedia("(prefers-color-scheme: dark)");
		const handler = () => setResolved(applyTheme(theme));
		mq.addEventListener("change", handler);
		return () => mq.removeEventListener("change", handler);
	}, [theme]);

	return { theme, resolved, setTheme };
}
