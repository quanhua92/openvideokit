/**
 * useChat tests — focus on buildLlmHistory (the proposal-outcome fold + strip
 * logic), which is the correctness-critical part. The hook lifecycle is
 * covered by the integration smoke (load → send → resolve).
 */
import { describe, expect, it } from "vitest";

import type { EditProposal } from "@/shared/ai/types";
import { buildLlmHistory, type ThreadItem } from "./useChat";

function proposal(id: string): EditProposal {
  return {
    id,
    ops: [
      { kind: "setField", slideId: "slide-0", fieldId: "title", value: "X" },
    ],
    rationale: "r",
  };
}

describe("buildLlmHistory", () => {
  it("skips the welcome message and ephemeral pings", () => {
    const items: ThreadItem[] = [
      { id: "welcome", role: "assistant", content: "Hi!" },
      { id: "u1", role: "user", content: "hello" },
      { id: "sys1", role: "system", content: "You changed x", ephemeral: true },
      { id: "a1", role: "assistant", content: "hi back" },
    ];
    const out = buildLlmHistory(items);
    expect(out.map((m) => m.id)).toEqual(["u1", "a1"]);
  });

  it("strips thinking and toolCalls — sends only role + content", () => {
    const items: ThreadItem[] = [
      {
        id: "a1",
        role: "assistant",
        content: "ans",
        thinking: "secret reasoning",
        toolCalls: [{ id: "tc1", tool: "list_slides", args: {}, done: true }],
      },
    ];
    const out = buildLlmHistory(items);
    expect(out).toEqual([{ id: "a1", role: "assistant", content: "ans" }]);
  });

  it("folds accepted/rejected proposal outcomes into the assistant content", () => {
    const items: ThreadItem[] = [
      {
        id: "a1",
        role: "assistant",
        content: "Sure.",
        proposals: [
          { proposal: proposal("p1"), state: "rejected" },
          { proposal: proposal("p2"), state: "accepted" },
          { proposal: proposal("p3"), state: "pending" }, // unresolved → no note
        ],
      },
    ];
    const out = buildLlmHistory(items);
    expect(out[0].content).toContain("Sure.");
    expect(out[0].content).toContain(
      "[outcome: proposal p1 (setField slide-0.title) was rejected.]",
    );
    expect(out[0].content).toContain(
      "[outcome: proposal p2 (setField slide-0.title) was accepted.]",
    );
    expect(out[0].content).not.toContain("p3"); // unresolved proposal omitted
  });

  it("omits empty-content messages", () => {
    const items: ThreadItem[] = [
      { id: "a1", role: "assistant", content: "" },
      { id: "u1", role: "user", content: "   " },
      { id: "u2", role: "user", content: "real" },
    ];
    expect(buildLlmHistory(items).map((m) => m.id)).toEqual(["u2"]);
  });
});
