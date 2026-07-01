/**
 * AI subsystem types — RFC 0002 contract.
 *
 * These are EXPORTED TYPES ONLY in P0. Runtime impls land later:
 *   - P6 builds the provider that produces these (EchoProvider mock + stubs)
 *   - P3 builds the EditBus runtime that consumes EditProposal patches
 *
 * Locking the contract now prevents interface churn across phases.
 */

/** Identifier for the active provider ( EchoProvider is the mock default ). */
export type ProviderId = "echo" | "openai" | "anthropic" | "ollama";

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

/** Context pinned by the user — injected into the next system prompt. */
export type ContextPin =
  | { kind: "slide"; slideId: string }
  | { kind: "field"; slideId: string; fieldId: string }
  | { kind: "asset"; ref: string };

/** Streaming events emitted by an AIProvider. */
export type AIStreamEvent =
  | { type: "token"; text: string }
  | { type: "proposal"; edit: EditProposal }
  | { type: "done" }
  | { type: "error"; message: string };

/** Provider interface — every impl (Echo, OpenAI, Anthropic, Ollama) satisfies this. */
export interface AIProvider {
  readonly id: ProviderId;
  readonly label: string;
  stream(messages: AIMessage[], ctx: AIContext): AsyncIterable<AIStreamEvent>;
}

/** Request-scoped context: pinned refs + project snapshot bits the provider needs. */
export interface AIContext {
  activeSlideId: string | null;
  pins: ContextPin[];
  /** Snapshots the provider may consult to ground responses. */
  project: {
    rootSlides: string[];
  };
}

/**
 * Target a proposal points at.
 *
 * The `{ kind: "root" }` variant is reserved for future use — current Tier-1
 * and Tier-2 proposals only target slides. Root-level edits (canvas, theme,
 * audio) will land as a new Tier variant in a later phase.
 */
export type EditTarget = { kind: "root" } | { kind: "slide"; slideId: string };

/** RFC 6902 JSON Patch op (subset). Tier-1 AI proposals produce these. */
export type JsonPatchOp =
  | { op: "replace"; path: string; value: unknown }
  | { op: "add"; path: string; value: unknown }
  | { op: "remove"; path: string };

/**
 * EditProposal — the atomic unit an AI emits for human verification.
 *
 * Tier-1: JSON Patch over the slide's index.json (fields, voiceover, transition, etc.)
 * Tier-2: full HTML swap of the slide's index.html (gated by lintHtml in P5)
 */
export type EditProposal =
  | {
      id: string;
      tier: 1;
      target: Extract<EditTarget, { kind: "slide" }>;
      patch: JsonPatchOp[];
      rationale: string;
    }
  | {
      id: string;
      tier: 2;
      target: Extract<EditTarget, { kind: "slide" }>;
      html: string;
      rationale: string;
    }
  | {
      id: string;
      tier: 3;
      target: Extract<EditTarget, { kind: "root" }>;
      op: "addSlide";
      afterId: string;
      newId: string;
      html?: string;
      rationale: string;
    };
