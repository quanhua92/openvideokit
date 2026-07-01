/**
 * Global runtime configuration — every Vite env var is read here, once.
 *
 * The API base can be pointed at any origin so the SPA talks to a remote
 * backend instead of the Vite dev proxy:
 *
 *   VITE_API_BASE_URL=https://api.example.com/api  pnpm dev
 *
 * MSW mocks stay on by default; flip them off to hit a real backend:
 *
 *   VITE_USE_MSW=false  pnpm dev
 */

const env = import.meta.env;

function resolveApiBase(): string {
  const raw = (env.VITE_API_BASE_URL as string | undefined)?.trim() || "/api";
  return raw.replace(/\/+$/, "");
}

/** Root for every API call. Trailing slash stripped. */
export const apiBaseUrl: string = resolveApiBase();

/** True unless `VITE_USE_MSW === "false"`. */
export const useMsw: boolean = env.VITE_USE_MSW !== "false";

/** Vite dev flag passthrough (conditional logging, etc.). */
export const isDev: boolean = Boolean(env.DEV);

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
