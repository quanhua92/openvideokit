/**
 * Light/dark/system theme — no deps.
 *
 * Three-state model (light | dark | system) persisted to localStorage.
 * The resolved class is applied on <html> via the `.dark` class (matches
 * the @custom-variant dark in styles.css). sonner.tsx's useThemeClass
 * observes the same class, so toasts stay in sync automatically.
 *
 * FOUC prevention: index.html runs an inline script before any CSS paints
 * to set the initial class. React only takes over from there.
 */

export type Theme = "light" | "dark" | "system";
export type ResolvedTheme = "light" | "dark";

const STORAGE_KEY = "ovk:theme";

export function getStoredTheme(): Theme {
  if (typeof localStorage === "undefined") return "system";
  return (localStorage.getItem(STORAGE_KEY) as Theme | null) ?? "system";
}

export function resolveTheme(theme: Theme): ResolvedTheme {
  if (theme !== "system") return theme;
  if (typeof window === "undefined" || !window.matchMedia) return "light";
  return window.matchMedia("(prefers-color-scheme: dark)").matches
    ? "dark"
    : "light";
}

/** Set the .dark class on <html> from a theme choice. Returns what it resolved to. */
export function applyTheme(theme: Theme): ResolvedTheme {
  const resolved = resolveTheme(theme);
  if (typeof document !== "undefined") {
    document.documentElement.classList.toggle("dark", resolved === "dark");
  }
  return resolved;
}

/** Persist + apply. */
export function setTheme(theme: Theme): void {
  if (typeof localStorage !== "undefined") {
    localStorage.setItem(STORAGE_KEY, theme);
  }
  applyTheme(theme);
}
