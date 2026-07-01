import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it } from "vitest";

import type { ProjectBundle } from "@/shared/api/client";
import { fixtureBundle } from "@/shared/api/fixtures";
import { applyOp } from "./applyOp";
import type { EditEvent, EditOp } from "./EditBus";
import { inverseOp } from "./inverseOp";
import { setField } from "./ops";

const clone = (b: ProjectBundle): ProjectBundle =>
  JSON.parse(JSON.stringify(b));

const base = clone(fixtureBundle);

/**
 * One valid op per EditOp kind, each against a "before" state where it
 * applies cleanly and inverseOp returns a non-null inverse.
 *
 * If a new EditOp variant is added, it MUST be added here too — the
 * round-trip proves it is reversible. The compile-time exhaustiveness guard
 * in inverseOp.ts / applyOp.ts catches a missing case at build time; this
 * test catches a WRONG case at runtime.
 */
const cases: Array<{ name: string; before: ProjectBundle; op: EditOp }> = [
  {
    name: "setField",
    before: clone(base),
    op: {
      kind: "setField",
      slideId: "slide-0",
      fieldId: "title",
      value: "Changed",
    },
  },
  {
    name: "reorderSlides",
    before: clone(base),
    op: { kind: "reorderSlides", order: ["slide-2", "slide-0", "slide-1"] },
  },
  {
    name: "addSlide",
    before: clone(base),
    op: { kind: "addSlide", newId: "slide-x", layoutId: "default" },
  },
  {
    name: "duplicateSlide",
    before: clone(base),
    op: { kind: "duplicateSlide", slideId: "slide-0", newId: "slide-copy" },
  },
  {
    name: "removeSlide",
    before: clone(base),
    op: { kind: "removeSlide", slideId: "slide-1" },
  },
  {
    name: "restoreSlide",
    // "before" already has slide-1 removed; restoring it is the forward op.
    before: applyOp(clone(base), { kind: "removeSlide", slideId: "slide-1" }),
    op: {
      kind: "restoreSlide",
      slide: base.slides["slide-1"],
      at: 1,
    },
  },
  {
    name: "setTransition",
    before: clone(base),
    op: {
      kind: "setTransition",
      slideId: "slide-0",
      transition: { type: "fade", duration: 0.5 },
    },
  },
  {
    name: "setAsset",
    before: clone(base),
    op: {
      kind: "setAsset",
      slideId: "slide-0",
      fieldId: "img",
      ref: "sha256:deadbeef",
    },
  },
  {
    name: "setVoiceover",
    before: clone(base),
    op: { kind: "setVoiceover", slideId: "slide-0", text: "New narration" },
  },
  {
    name: "setDuration",
    before: clone(base),
    op: { kind: "setDuration", slideId: "slide-0", duration: 7.5 },
  },
  {
    name: "setCaptionStyle",
    before: clone(base),
    op: { kind: "setCaptionStyle", style: "neon" },
  },
  {
    name: "setSlideHtml",
    before: clone(base),
    op: {
      kind: "setSlideHtml",
      slideId: "slide-0",
      html: "<template><p>override</p></template>",
    },
  },
];

describe("inverseOp + applyOp round-trip (every op is reversible)", () => {
  for (const { name, before, op } of cases) {
    it(`undo: applying ${name} then its inverse restores the original state`, () => {
      const after = applyOp(before, op);
      // The op must actually produce a new state (not be silently rejected).
      expect(after).not.toBe(before);

      const inverse = inverseOp(op, before);
      expect(
        inverse,
        `inverseOp must return an inverse for ${name}`,
      ).not.toBeNull();

      const undone = applyOp(after, inverse as EditOp);
      expect(undone).toEqual(before);
    });

    it(`redo: replaying the original ${name} op from the undone state recovers the applied state`, () => {
      // Mirrors useUndoRedo.redo: it re-dispatches the ORIGINAL op
      // (event.op), NOT the inverse of the inverse. inverseOp is not an
      // involution by design — it captures the previous value, so only
      // replaying the original op is a valid redo.
      const after = applyOp(before, op);
      const inverse = inverseOp(op, before);
      expect(inverse).not.toBeNull();

      const undone = applyOp(after, inverse as EditOp);
      const redone = applyOp(undone, op); // replay original op, as redo does
      expect(redone).toEqual(after);
    });
  }
});

/**
 * Integration regression test: simulates the REAL dispatch → undo path the
 * way EditBusProvider + useUndoRedo execute it, against a live QueryClient.
 *
 * This catches bugs the pure inverseOp tests cannot — specifically, bugs in
 * WHICH state the inverse is computed against. The inverse MUST be captured
 * at dispatch time (pre-edit state) and replayed at undo time. Recomputing
 * it at undo time against the post-edit state is a no-op for setField.
 */
describe("dispatch → undo integration (setField restores previous value)", () => {
  it("restores the title after undoing an AI-style setField", () => {
    const qc = new QueryClient();
    const key = ["project", "p1"] as const;
    const before = clone(fixtureBundle);
    qc.setQueryData(key, before);

    const ORIGINAL_TITLE = before.slides["slide-0"].fields.title; // "Eco Bottle"

    // --- simulate dispatch(setField) as EditBusProvider does (fixed) ---
    const op = setField("slide-0", "title", "BOLD: Eco Bottle");
    const current = qc.getQueryData<ProjectBundle>(key)!; // pre-edit state
    const event: EditEvent = {
      id: "evt-1",
      at: Date.now(),
      actor: "ai:echo",
      op,
      inverse: inverseOp(op, current), // captured from PRE-edit state
    };
    qc.setQueryData(key, applyOp(current, op));
    expect(
      qc.getQueryData<ProjectBundle>(key)!.slides["slide-0"].fields.title,
    ).toBe("BOLD: Eco Bottle");

    // --- simulate undo as useUndoRedo does (fixed): replay event.inverse ---
    const undoCurrent = qc.getQueryData<ProjectBundle>(key)!; // post-edit
    qc.setQueryData(key, applyOp(undoCurrent, event.inverse as EditOp));

    expect(
      qc.getQueryData<ProjectBundle>(key)!.slides["slide-0"].fields.title,
    ).toBe(ORIGINAL_TITLE);
  });
});
