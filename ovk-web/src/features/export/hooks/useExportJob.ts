/**
 * useExportJob — simulates the 6-step export pipeline.
 *
 * Steps: assemble → stamp → voiceover → captions → render → done.
 * Each step fires after a mock delay; render streams frame-by-frame
 * progress. When the real backend lands, swap the setTimeout chain for
 * an SSE/EventSource subscription — the state shape is identical.
 */
import { useCallback, useRef, useState } from "react";

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
	renderProgress: number; // 0–100 during render step
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
	render: 50, // per frame batch
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

	const start = useCallback(async () => {
		cancelledRef.current = false;
		const completed: ExportStep[] = [];

		for (const step of STEP_ORDER) {
			if (cancelledRef.current) return;

			setState({ step, renderProgress: 0, stepsCompleted: [...completed] });

			if (step === "render") {
				// Stream frame-by-frame progress.
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
				// Final state.
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
	}, []);

	const reset = useCallback(() => {
		cancelledRef.current = true;
		setState({ step: "idle", renderProgress: 0, stepsCompleted: [] });
	}, []);

	const cancel = useCallback(() => {
		cancelledRef.current = true;
		setState((s) => ({ ...s, step: "error", error: "Cancelled by user" }));
	}, []);

	return { state, start, reset, cancel };
}
