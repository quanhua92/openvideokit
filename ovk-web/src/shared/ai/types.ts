/**
 * AI subsystem types — the contract between the Python LangGraph agent and
 * the frontend AIDock.
 *
 * The agent streams ``AIStreamEvent``s over SSE. Proposal events carry
 * ``edit.ops`` — a list of ``EditOp`` (the same union used by the frontend
 * EditBus). The AIDock dispatches each op through EditBus on Accept, so an
 * AI edit travels the exact same path as a human edit (AI flow == human flow;
 * undo/redo preserved). See docs/ai.md.
 */

import type { EditOp } from "@/shared/edit/EditBus";

/** Identifier for the active provider. */
export type ProviderId = "http";

/** A single message in a chat thread. */
export interface AIMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  /** Unix epoch milliseconds — consistent with `EditEvent.at` in EditBus.ts. */
  at?: number;
  /** Present on assistant messages that carry an edit proposal. */
  proposal?: EditProposal;
}

/** Context pinned by the user — injected into the system prompt. */
export type ContextPin =
  | { kind: "slide"; value: string }
  | { kind: "field"; value: string }
  | { kind: "asset"; value: string };

/** Streaming events emitted by the backend agent (SSE) / a provider. */
export type AIStreamEvent =
  | { type: "open" }
  | { type: "token"; text: string }
  | { type: "thinking"; text: string }
  | { type: "tool_start"; tool: string; args: Record<string, unknown> }
  | { type: "tool_end"; tool: string; ok: boolean; result: string }
  | { type: "proposal"; edit: EditProposal }
  | { type: "done" }
  | { type: "error"; message: string };

/** Provider interface — every impl satisfies this. */
export interface AIProvider {
  readonly id: ProviderId;
  readonly label: string;
  stream(messages: AIMessage[], ctx: AIContext): AsyncIterable<AIStreamEvent>;
}

/** Request-scoped context: pinned refs + project snapshot bits the provider needs. */
export interface AIContext {
  projectId: string;
  activeSlideId: string | null;
  pins: ContextPin[];
  /** Snapshots the provider may consult to ground responses. */
  project: {
    rootSlides: string[];
    slides: Record<string, { fields: Record<string, string> }>;
  };
}

/**
 * EditProposal — one or more EditOps the AI proposes for human verification.
 *
 * ``ops`` are the exact same EditOp shapes the frontend EditBus dispatches
 * (camelCase, matching EditBus.ts). Accept loops over them and dispatches
 * each via ``editBus.dispatch(op, "ai:langgraph")``.
 */
export interface EditProposal {
  id: string;
  ops: EditOp[];
  rationale: string;
  slideId?: string;
}
