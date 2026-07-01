/**
 * Global runtime configuration — every Vite env var is read here, once.
 *
 * The API base can be pointed at any origin so the SPA talks to a remote
 * backend instead of the Vite dev proxy:
 *
 *   VITE_API_BASE_URL=https://api.example.com/api  pnpm dev
 */

const env = import.meta.env;

function resolveApiBase(): string {
  const raw = (env.VITE_API_BASE_URL as string | undefined)?.trim() || "/api";
  return raw.replace(/\/+$/, "");
}

/** Root for every API call. Trailing slash stripped. */
export const apiBaseUrl: string = resolveApiBase();

/** Full URL to a project's root composition (loaded by <hyperframes-player>). */
export function compositionUrl(projectId: string): string {
  return `${apiBaseUrl}/projects/${encodeURIComponent(projectId)}/composition`;
}

/** Full URL to a single slide sub-composition. */
export function slideCompositionUrl(
  projectId: string,
  slideId: string,
): string {
  return `${apiBaseUrl}/projects/${encodeURIComponent(projectId)}/composition/compositions/${encodeURIComponent(slideId)}`;
}
