/**
 * useUndoRedo — ⌘Z / ⌘⇧Z backed by the history store + EditBus.
 *
 * `undo()`:
 *   1. Pop the last event off past.
 *   2. Replay event.inverse (pre-computed at dispatch time from the PRE-edit
 *      state) with skipHistory.
 *   3. Push the original event to future.
 *
 * `redo()` is symmetric: pop future → re-dispatch the original op (event.op)
 * with skipHistory → push back to past.
 *
 * The inverse is NOT recomputed here — it was captured at dispatch time,
 * before the cache was mutated. Recomputing at undo time would read the
 * post-edit value and be a no-op for value-based ops like setField.
 *
 * Keyboard: ⌘Z / Ctrl-Z = undo; ⌘⇧Z / Ctrl-Shift-Z / Ctrl-Y = redo.
 * The listener is mounted on window so it works anywhere in the studio.
 * A ref holds the latest undo/redo so the listener never goes stale.
 */

import { useEffect, useRef } from "react";
import { useHistory } from "@/shared/store/history";
import { useEditBus } from "./EditBusProvider";

export interface UseUndoRedo {
	canUndo: boolean;
	canRedo: boolean;
	undo: () => void;
	redo: () => void;
}

export function useUndoRedo(projectId: string | undefined): UseUndoRedo {
	const { dispatch } = useEditBus();
	const past = useHistory((s) => s.past);
	const future = useHistory((s) => s.future);

	const undo = () => {
		if (!projectId) return;
		const event = useHistory.getState().popPast();
		if (!event) return;
		if (!event.inverse) {
			// No inverse was computable at dispatch time — put it back.
			useHistory.getState().pushPast(event);
			return;
		}
		dispatch(event.inverse, "human", { skipHistory: true });
		useHistory.getState().pushFuture(event);
	};

	const redo = () => {
		if (!projectId) return;
		const event = useHistory.getState().popFuture();
		if (!event) return;
		dispatch(event.op, "human", { skipHistory: true });
		useHistory.getState().pushPast(event);
	};

	// Latest-ref pattern: keep the listener bound once, but always invoke the
	// freshest undo/redo (which read live state via getState()/getQueryData).
	const undoRef = useRef(undo);
	const redoRef = useRef(redo);
	useEffect(() => {
		undoRef.current = undo;
		redoRef.current = redo;
	});

	useEffect(() => {
		const onKey = (e: KeyboardEvent) => {
			const mod = e.metaKey || e.ctrlKey;
			if (!mod) return;
			if (e.key === "z" || e.key === "Z") {
				e.preventDefault();
				if (e.shiftKey) redoRef.current();
				else undoRef.current();
			} else if (e.key === "y" || e.key === "Y") {
				e.preventDefault();
				redoRef.current();
			}
		};
		window.addEventListener("keydown", onKey);
		return () => window.removeEventListener("keydown", onKey);
	}, []);

	return {
		canUndo: past.length > 0,
		canRedo: future.length > 0,
		undo,
		redo,
	};
}
