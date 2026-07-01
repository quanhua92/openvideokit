/**
 * MSW browser worker — intercepts API calls with mock responses.
 *
 * Always enabled — no real backend exists yet. When the FastAPI backend
 * lands, set VITE_USE_MSW=false to disable mocking and let requests
 * reach the real server.
 */

import { setupWorker } from "msw/browser";
import { isDev, useMsw } from "@/shared/config";

import { handlers } from "./handlers";

export const worker = setupWorker(...handlers);

/**
 * Enable MSW. In dev, logs to console; in production, runs quietly.
 * Failures are logged but do NOT block the app from rendering.
 */
export async function enableMocking(): Promise<void> {
  if (!useMsw) return;

  try {
    await worker.start({
      onUnhandledRequest: "bypass",
      quiet: !isDev,
    });
  } catch (error) {
    console.error("[MSW] failed to start mock worker:", error);
  }
}
