/**
 * useChat — persists AI chat sessions to the backend JSONL store and reloads
 * the newest chat on mount (so the thread survives F5). See docs/chat.md.
 *
 * Responsibilities:
 *   - load newest chat (or create one) on mount;
 *   - keep `items` in sync with the active chat;
 *   - persist each finalized message via POST /chats/:id/messages (append-only);
 *   - record proposal accept/reject as resolution records (pure append);
 *   - render the LLM history with proposal outcomes folded into assistant
 *     content (Option B — no mid-stream system messages).
 *
 * Streaming + EditBus wiring is still owned by AIDock; this hook exposes
 * `items`, mutators, and the persistence primitives.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { EditProposal } from "@/shared/ai/types";
import { apiBaseUrl } from "@/shared/config";
import type { EditOp } from "@/shared/edit/EditBus";

/** One tool invocation tracked on an assistant message (activity log). */
export interface ToolCallEntry {
  id: string;
  tool: string;
  args: Record<string, unknown>;
  result?: string;
  ok?: boolean;
  done: boolean;
}

/** One proposal attached to a message, with its own accept/reject state. */
export interface ProposalEntry {
  proposal: EditProposal;
  state: "pending" | "accepted" | "rejected" | "auto-rejected";
}

export interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  thinking?: string;
  toolCalls?: ToolCallEntry[];
  proposals?: ProposalEntry[];
  /** ISO timestamp from the backend (absent on not-yet-persisted messages). */
  created_at?: string;
  /** Ephemeral UI (human-edit pings); never persisted, never sent to the LLM. */
  ephemeral?: boolean;
}

export interface ThreadItem extends ChatMessage {
  ephemeral?: boolean;
}

const WELCOME: ChatMessage = {
  id: "welcome",
  role: "assistant",
  content: "Hi! I can edit slides. Try a quick prompt below or type your own.",
};

async function jget(res: Response): Promise<unknown> {
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json();
}

/**
 * Build the lean message array for /ai/chat: role + content only, with proposal
 * outcomes folded into the originating assistant message's content (Option B).
 * thinking / toolCalls / proposals / ephemeral pings are stripped.
 */
export function buildLlmHistory(
  items: ThreadItem[],
): { id: string; role: "user" | "assistant"; content: string }[] {
  const out: { id: string; role: "user" | "assistant"; content: string }[] = [];
  for (const m of items) {
    if (m.ephemeral || m.id === "welcome") continue;
    if (m.role !== "user" && m.role !== "assistant") continue;
    if (!m.content?.trim()) continue;
    let content = m.content;
    if (m.role === "assistant" && m.proposals) {
      const notes = m.proposals
        .filter((p) => p.state === "accepted" || p.state === "rejected")
        .map(
          (p) =>
            `[outcome: proposal ${p.proposal.id} (${opSignature(p.proposal)}) was ${p.state}.]`,
        );
      if (notes.length) content = `${content}\n\n${notes.join("\n")}`;
    }
    out.push({ id: m.id, role: m.role, content });
  }
  return out;
}

/** One-line signature of a proposal's primary op, for the outcome note. */
function opSignature(p: EditProposal): string {
  const op = p.ops[0];
  if (!op) return "edit";
  switch (op.kind) {
    case "setField":
      return `setField ${op.slideId}.${op.fieldId}`;
    case "setVoiceover":
      return `setVoiceover ${op.slideId}`;
    case "addSlide":
      return `addSlide ${op.newId}`;
    case "removeSlide":
      return `removeSlide ${op.slideId}`;
    case "setSlideHtml":
      return `setSlideHtml ${op.slideId}`;
    default:
      return op.kind;
  }
}

export function useChat(projectId: string) {
  const [chatId, setChatId] = useState<string | null>(null);
  const [items, setItems] = useState<ThreadItem[]>([WELCOME]);
  const [loading, setLoading] = useState(true);
  // Mutation helpers consumed by AIDock. Use refs so callbacks stay stable.
  const itemsRef = useRef(items);
  itemsRef.current = items;

  // ── Load newest chat on mount (or create one) ──────────────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const listed = (await jget(
          await fetch(
            `${apiBaseUrl}/projects/${encodeURIComponent(projectId)}/chats`,
          ),
        )) as { id: string; created_at: string }[];
        let active = listed[0]?.id;
        if (!active) {
          const created = (await jget(
            await fetch(
              `${apiBaseUrl}/projects/${encodeURIComponent(projectId)}/chats`,
              {
                method: "POST",
              },
            ),
          )) as { id: string };
          active = created.id;
        }
        const chat = (await jget(
          await fetch(
            `${apiBaseUrl}/projects/${encodeURIComponent(projectId)}/chats/${active}`,
          ),
        )) as { messages: ChatMessage[] };
        if (cancelled) return;
        setChatId(active);
        setItems(chat.messages.length ? chat.messages : [WELCOME]);
      } catch {
        if (!cancelled) setItems([WELCOME]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [projectId]);

  // ── Persistence primitives ─────────────────────────────────────────────
  const appendRecord = useCallback(
    async (rec: Record<string, unknown>) => {
      if (!chatId) return;
      await fetch(
        `${apiBaseUrl}/projects/${encodeURIComponent(projectId)}/chats/${chatId}/messages`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(rec),
        },
      );
    },
    [chatId, projectId],
  );

  /** Persist a finalized chat message (one append). */
  const persistMessage = useCallback(
    (m: ChatMessage) => {
      const { ephemeral, ...rec } = m;
      void ephemeral;
      return appendRecord({ type: "message", ...rec });
    },
    [appendRecord],
  );

  /** Record a proposal accept/reject (pure append; reconciled on reload). */
  const resolveProposal = useCallback(
    (proposalId: string, state: "accepted" | "rejected") => {
      // Update UI state immediately…
      setItems((prev) =>
        prev.map((m) => {
          if (!m.proposals) return m;
          return {
            ...m,
            proposals: m.proposals.map((p) =>
              p.proposal.id === proposalId ? { ...p, state } : p,
            ),
          };
        }),
      );
      // …then persist a tiny resolution record.
      return appendRecord({ type: "resolution", proposalId, state });
    },
    [appendRecord],
  );

  /** Create a fresh chat and switch to it. */
  const newChat = useCallback(async () => {
    try {
      const created = (await jget(
        await fetch(
          `${apiBaseUrl}/projects/${encodeURIComponent(projectId)}/chats`,
          {
            method: "POST",
          },
        ),
      )) as { id: string };
      setChatId(created.id);
      setItems([WELCOME]);
    } catch {
      /* ignore — keep current chat */
    }
  }, [projectId]);

  return {
    chatId,
    items,
    setItems,
    loading,
    persistMessage,
    resolveProposal,
    newChat,
    buildLlmHistory: () => buildLlmHistory(itemsRef.current),
  };
}

// Re-export the EditOp type for callers that build messages with ops.
export type { EditOp };
