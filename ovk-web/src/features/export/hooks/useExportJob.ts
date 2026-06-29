/**
 * useExportJob — simulates the 6-step export pipeline.
 *
 * Steps: assemble → stamp → voiceover → captions → render → done.
 * Includes re-entrancy guard, unmount cleanup, and error handling.
 */
import { useCallback, useEffect, useRef, useState } from "react";

export type ExportStep =
	| "idle"
	| "assemble"
	| "stamp"
	| "voiceover"
	| "captions"
	| "render"
	| "done"
	| "error";

export interface ExportState {
	step: ExportStep;
	renderProgress: number;
	stepsCompleted: ExportStep[];
	error?: string;
}

const STEP_ORDER: ExportStep[] = [
	"assemble",
	"stamp",
	"voiceover",
	"captions",
	"render",
	"done",
];

const STEP_DELAYS: Record<string, number> = {
	assemble: 150,
	stamp: 100,
	voiceover: 400,
	captions: 150,
	render: 50,
};

function delay(ms: number): Promise<void> {
	return new Promise((r) => setTimeout(r, ms));
}

export function useExportJob() {
	const [state, setState] = useState<ExportState>({
		step: "idle",
		renderProgress: 0,
		stepsCompleted: [],
	});
	const cancelledRef = useRef(false);
	const runningRef = useRef(false);

	// Cleanup on unmount: cancel any in-flight export.
	useEffect(() => {
		return () => {
			cancelledRef.current = true;
		};
	}, []);

	const start = useCallback(async () => {
		// Re-entrancy guard: bail if already running.
		if (runningRef.current) return;
		runningRef.current = true;
		cancelledRef.current = false;
		const completed: ExportStep[] = [];

		try {
			for (const step of STEP_ORDER) {
				if (cancelledRef.current) return;

				setState({ step, renderProgress: 0, stepsCompleted: [...completed] });

				if (step === "render") {
					for (let i = 0; i <= 100; i += 10) {
						if (cancelledRef.current) return;
						await delay(STEP_DELAYS.render);
						setState({
							step,
							renderProgress: i,
							stepsCompleted: [...completed],
						});
					}
				} else if (step === "done") {
					setState({
						step: "done",
						renderProgress: 100,
						stepsCompleted: [...completed, step],
					});
				} else {
					await delay(STEP_DELAYS[step] ?? 200);
				}

				completed.push(step);
			}
		} catch (err) {
			setState((s) => ({
				...s,
				step: "error",
				error: err instanceof Error ? err.message : String(err),
			}));
		} finally {
			runningRef.current = false;
		}
	}, []);

	const reset = useCallback(() => {
		cancelledRef.current = true;
		runningRef.current = false;
		setState({ step: "idle", renderProgress: 0, stepsCompleted: [] });
	}, []);

	const cancel = useCallback(() => {
		cancelledRef.current = true;
		runningRef.current = false;
		setState((s) => ({ ...s, step: "error", error: "Cancelled by user" }));
	}, []);

	return { state, start, reset, cancel };
}
