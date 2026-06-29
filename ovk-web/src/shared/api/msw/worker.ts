/**
 * MSW browser worker — intercepts API calls with mock responses.
 *
 * Always enabled — no real backend exists yet. When the FastAPI backend
 * lands, set VITE_USE_MSW=false to disable mocking and let requests
 * reach the real server.
 */
import { setupWorker } from "msw/browser";

import { handlers } from "./handlers";

export const worker = setupWorker(...handlers);

/**
 * Enable MSW. In dev, logs to console; in production, runs quietly.
 * Failures are logged but do NOT block the app from rendering.
 */
export async function enableMocking(): Promise<void> {
	// Allow explicit opt-out via VITE_USE_MSW=false for when the real
	// backend is wired.
	if (import.meta.env.VITE_USE_MSW === "false") return;

	try {
		await worker.start({
			onUnhandledRequest: "bypass",
			quiet: !import.meta.env.DEV,
		});
	} catch (error) {
		console.error("[MSW] failed to start mock worker:", error);
	}
}
