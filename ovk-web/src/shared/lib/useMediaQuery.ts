/**
 * useMediaQuery — SSR-safe subscribe to a media query.
 *
 * Defaults to `false` when `window.matchMedia` is unavailable (SSR or test
 * envs without jsdom setup); the value flips on mount.
 */
import { useEffect, useState } from "react";

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mq = window.matchMedia(query);
    setMatches(mq.matches);
    const handler = (e: MediaQueryListEvent) => setMatches(e.matches);
    mq.addEventListener("change", handler);
    return () => mq.removeEventListener("change", handler);
  }, [query]);

  return matches;
}

/** Convenience: returns true at ≥1024px (Tailwind `lg`). */
export function useIsDesktop(): boolean {
  return useMediaQuery("(min-width: 1024px)");
}
