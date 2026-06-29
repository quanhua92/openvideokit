/**
 * useUndoRedo — ⌘Z / ⌘⇧Z backed by the history store + EditBus.
 *
 * `undo()`:
 *   1. Pop the last event off past.
 *   2. Read the CURRENT project from the TanStack Query cache.
 *   3. inverseOp(op, currentState) → inverse op.
 *   4. dispatch(inverse, 'human', { skipHistory: true }).
 *   5. Push the original event to future.
 *
 * `redo()` is symmetric: pop future → re-dispatch the original op with
 * skipHistory → push back to past.
 *
 * Keyboard: ⌘Z / Ctrl-Z = undo; ⌘⇧Z / Ctrl-Shift-Z / Ctrl-Y = redo.
 * The listener is mounted on window so it works anywhere in the studio.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useEffect } from "react";
import type { ProjectBundle } from "@/shared/api/client";
import { useHistory } from "@/shared/store/history";
import { useEditBus } from "./EditBusProvider";
import { inverseOp } from "./inverseOp";

export interface UseUndoRedo {
	canUndo: boolean;
	canRedo: boolean;
	undo: () => void;
	redo: () => void;
}

export function useUndoRedo(projectId: string): UseUndoRedo {
	const queryClient = useQueryClient();
	const { dispatch } = useEditBus();
	const past = useHistory((s) => s.past);
	const future = useHistory((s) => s.future);

	const undo = () => {
		const event = useHistory.getState().popPast();
		if (!event) return;
		const current =
			queryClient.getQueryData<ProjectBundle>(["project", projectId]) ?? null;
		if (!current) return;
		const inverse = inverseOp(event.op, current);
		if (!inverse) {
			// Put the event back — undo wasn't possible.
			useHistory.getState().pushPast(event);
			return;
		}
		dispatch(inverse, "human", { skipHistory: true });
		useHistory.getState().pushFuture(event);
	};

	const redo = () => {
		const event = useHistory.getState().popFuture();
		if (!event) return;
		dispatch(event.op, "human", { skipHistory: true });
		useHistory.getState().pushPast(event);
	};

	// undo/redo close over the projectId-scoped EditBus; the listener rebinds
	// when projectId changes.
	// biome-ignore lint/correctness/useExhaustiveDependencies: undo/redo are stable per project
	useEffect(() => {
		const undoFn = undo;
		const redoFn = redo;
		const onKey = (e: KeyboardEvent) => {
			const mod = e.metaKey || e.ctrlKey;
			if (!mod) return;
			if (e.key === "z" || e.key === "Z") {
				if (e.shiftKey) {
					e.preventDefault();
					redoFn();
				} else {
					e.preventDefault();
					undoFn();
				}
			} else if (e.key === "y" || e.key === "Y") {
				e.preventDefault();
				redoFn();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, [projectId]);

	return {
		canUndo: past.length > 0,
		canRedo: future.length > 0,
		undo,
		redo,
	};
}
