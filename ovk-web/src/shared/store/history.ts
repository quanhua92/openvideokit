/**
 * History store — past/future stacks of EditEvents.
 *
 * The EditBus auto-pushes every dispatched event to `past` (and clears
 * `future`). Undo pops from `past` and pushes the original to `future`.
 * Redo pops from `future` and pushes back to `past`. Undo/redo dispatch
 * their inverses with `skipHistory: true` so the stacks don't churn.
 */
import { create } from "zustand";

import type { EditEvent } from "@/shared/edit/EditBus";

interface HistoryStore {
  past: EditEvent[];
  future: EditEvent[];
  pushPast: (event: EditEvent) => void;
  popPast: () => EditEvent | null;
  pushFuture: (event: EditEvent) => void;
  popFuture: () => EditEvent | null;
  clear: () => void;
}

export const useHistory = create<HistoryStore>((set, get) => ({
  past: [],
  future: [],
  pushPast: (event) => set((s) => ({ past: [...s.past, event], future: [] })),
  popPast: () => {
    const { past } = get();
    if (past.length === 0) return null;
    const last = past[past.length - 1];
    set({ past: past.slice(0, -1) });
    return last;
  },
  pushFuture: (event) => set((s) => ({ future: [...s.future, event] })),
  popFuture: () => {
    const { future } = get();
    if (future.length === 0) return null;
    const last = future[future.length - 1];
    set({ future: future.slice(0, -1) });
    return last;
  },
  clear: () => set({ past: [], future: [] }),
}));
