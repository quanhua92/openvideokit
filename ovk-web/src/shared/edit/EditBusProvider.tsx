/**
 * EditBus runtime — single mutation path for the project document.
 *
 * dispatch(op, actor?, opts?):
 *   1. Reads current project from TanStack Query cache.
 *   2. applyOp(project, op) → new project.
 *   3. setQueryData(['project', projectId], newProject).
 *   4. Emits EditEvent to subscribers (for chat pings, etc.).
 *   5. If !opts.skipHistory → pushes event to past stack.
 *
 * Every mutation goes through this bus — both human edits and AI Accept
 * calls (P6). No backdoor.
 */
import { useQueryClient } from "@tanstack/react-query";
import {
	createContext,
	type ReactNode,
	useCallback,
	useContext,
	useRef,
} from "react";
import type { ProjectBundle } from "@/shared/api/client";
import { useHistory } from "@/shared/store/history";
import { applyOp } from "./applyOp";
import type { EditActor, EditBus, EditEvent, EditOp } from "./EditBus";

interface DispatchOpts {
	/** Skip pushing to the undo/redo stacks (used internally by undo/redo). */
	skipHistory?: boolean;
}

interface EditBusContextValue extends EditBus {
	dispatch: (op: EditOp, actor?: EditActor, opts?: DispatchOpts) => void;
}

const EditBusContext = createContext<EditBusContextValue | null>(null);

export function EditBusProvider({
	projectId,
	children,
}: {
	projectId: string;
	children: ReactNode;
}) {
	const queryClient = useQueryClient();
	const subscribersRef = useRef(new Set<(e: EditEvent) => void>());

	const dispatch = useCallback(
		(op: EditOp, actor: EditActor = "human", opts: DispatchOpts = {}) => {
			const cacheKey = ["project", projectId];
			const current = queryClient.getQueryData<ProjectBundle>(cacheKey) ?? null;
			if (!current) return;

			const next = applyOp(current, op);
			if (next === current) return; // applyOp rejected the op (e.g. bad id)

			queryClient.setQueryData(cacheKey, next);

			const event: EditEvent = {
				id: `evt-${Math.random().toString(36).slice(2, 10)}`,
				at: Date.now(),
				actor,
				op,
			};
			for (const fn of subscribersRef.current) fn(event);

			if (!opts.skipHistory) {
				useHistory.getState().pushPast(event);
			}
		},
		[projectId, queryClient],
	);

	const subscribe = useCallback((fn: (e: EditEvent) => void) => {
		subscribersRef.current.add(fn);
		return () => {
			subscribersRef.current.delete(fn);
		};
	}, []);

	return (
		<EditBusContext.Provider value={{ dispatch, subscribe }}>
			{children}
		</EditBusContext.Provider>
	);
}

export function useEditBus(): EditBusContextValue {
	const ctx = useContext(EditBusContext);
	if (!ctx) {
		throw new Error("useEditBus must be used inside <EditBusProvider>");
	}
	return ctx;
}
