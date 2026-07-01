/**
 * EditBus — the single mutation path for the project document.
 *
 * P0 exports the TYPES only (no runtime). P3 builds the runtime:
 *   - dispatch(op) → applyOp(project, op) → queryClient.setQueryData + emit EditEvent
 *   - subscribe(fn) → fn receives every EditEvent (consumed by undo/redo, AI chat pings)
 *
 * Key invariant: every mutation (human keyboard edit OR AI Accept) dispatches
 * an EditOp through this bus. There is no other write path.
 */

/** Who initiated the edit. AI edits carry their provider id. */
export type EditActor = "human" | `ai:${string}`;

/** Discriminated union of every slide/root mutation. P3/P4/P5/P7 extend this. */
export type EditOp =
  | { kind: "setField"; slideId: string; fieldId: string; value: string }
  | { kind: "reorderSlides"; order: string[] }
  | {
      kind: "addSlide";
      afterId?: string;
      layoutId: string;
      newId: string;
    }
  | { kind: "removeSlide"; slideId: string }
  | { kind: "duplicateSlide"; slideId: string; newId: string }
  | {
      kind: "restoreSlide";
      slide: import("@/shared/api/schemas/slideIndex").SlideIndex;
      at: number;
    }
  | {
      kind: "setTransition";
      slideId: string;
      transition: Record<string, unknown> | null;
    }
  | { kind: "setAsset"; slideId: string; fieldId: string; ref: string }
  | {
      kind: "setVoiceover";
      slideId: string;
      text?: string;
      voice?: string;
      rate?: string;
      pitch?: string;
      volume?: string;
    }
  | { kind: "setDuration"; slideId: string; duration: number }
  | { kind: "setCaptionStyle"; style: string }
  | { kind: "setSlideHtml"; slideId: string; html: string };

/** An op + metadata about who/when. Emitted on every dispatch.
 *
 *  `op` is the forward op (replayed by redo). `inverse` is pre-computed at
 *  dispatch time against the PRE-edit state (replayed by undo). The inverse
 *  MUST be captured before applyOp mutates the cache, because inverseOp reads
 *  the previous value out of the project bundle — deriving it lazily at undo
 *  time would read the post-edit value and be a no-op. */
export interface EditEvent {
  id: string;
  at: number;
  actor: EditActor;
  op: EditOp;
  inverse: EditOp | null;
}

/** Subscriber callback. */
export type EditBusSubscriber = (event: EditEvent) => void;

/**
 * EditBus runtime contract — implemented in P3.
 * Exported here so other modules can reference the shape before P3 ships.
 */
export interface EditBus {
  dispatch(op: EditOp, actor?: EditActor): void;
  subscribe(fn: EditBusSubscriber): () => void;
}
