/**
 * EditBus runtime — single mutation path for the project document.
 *
 * dispatch(op, actor?, opts?):
 *   1. Reads current project from TanStack Query cache (PRE-edit state).
 *   2. Computes the inverse from the pre-edit state (inverseOp).
 *   3. applyOp(project, op) → new project.
 *   4. setQueryData(['project', projectId], newProject).
 *   5. Emits EditEvent (carrying op + inverse) to subscribers.
 *   6. If !opts.skipHistory → pushes event to past stack.
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
import { inverseOp } from "./inverseOp";

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
  projectId: string | undefined;
  children: ReactNode;
}) {
  const queryClient = useQueryClient();
  const subscribersRef = useRef(new Set<(e: EditEvent) => void>());

  const dispatch = useCallback(
    (op: EditOp, actor: EditActor = "human", opts: DispatchOpts = {}) => {
      const cacheKey = ["project", projectId];
      const current = queryClient.getQueryData<ProjectBundle>(cacheKey) ?? null;
      if (!current) return;

      // Capture the inverse from the PRE-edit state, before applyOp runs.
      // inverseOp reads the previous field/slide value out of `current`;
      // doing this after setQueryData would read the new value (a no-op).
      const inverse = inverseOp(op, current);

      const next = applyOp(current, op);
      if (next === current) return; // applyOp rejected the op (e.g. bad id)

      queryClient.setQueryData(cacheKey, next);

      const event: EditEvent = {
        id: `evt-${Math.random().toString(36).slice(2, 10)}`,
        at: Date.now(),
        actor,
        op,
        inverse,
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
