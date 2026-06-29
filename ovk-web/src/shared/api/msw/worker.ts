/**
 * MSW browser worker — initialized in dev only.
 *
 * Mount via `src/main.tsx` (or a dedicated bootstrap module) before React:
 *   await enableMocking()
 *   ReactDOM.createRoot(...).render(...)
 *
 * P7 removes this and points the client at the real FastAPI server.
 */
import { setupWorker } from "msw/browser";

import { handlers } from "./handlers";

export const worker = setupWorker(...handlers);

/**
 * Enable MSW in dev (or when VITE_USE_MSW is set). Returns once the worker
 * is ready. In production, this is a no-op. Failures are logged but do NOT
 * block the app from rendering — broken mocks shouldn't kill the studio.
 */
export async function enableMocking(): Promise<void> {
	if (!import.meta.env.DEV && !import.meta.env.VITE_USE_MSW) return;
	try {
		await worker.start({
			onUnhandledRequest: "bypass",
			quiet: false,
		});
	} catch (error) {
		console.error("[MSW] failed to start mock worker:", error);
	}
}
