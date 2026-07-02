/**
 * AIDock — AI chat surface with real EditBus dispatch.
 *
 *   - Accept dispatches every EditOp in the proposal through EditBus (the
 *     same path a human edit takes) → undo/redo works uniformly.
 *   - The provider streams from the backend LangGraph agent
 *     (/api/projects/:id/ai/chat) via HttpSseProvider. No inference in the
 *     browser. See docs/ai.md.
 *   - The thread is persisted to the backend JSONL store via useChat (see
 *     docs/chat.md) — it survives F5, and proposal accept/reject is fed back
 *     to the model on the next turn (folded into assistant content).
 *   - ChatThread subscribes to EditBus events → human edits surface as dimmed
 *     ephemeral system pings in the chat (not persisted).
 *   - The (+) button offers "New chat" + quick prompts.
 */
import { Plus, Send, Sparkles, User, Wrench } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { useAIProvider } from "@/shared/ai/AIProviderContext";
import type { EditProposal } from "@/shared/ai/types";
import { useEditBus } from "@/shared/edit/EditBusProvider";
import { useAudioUrls } from "@/shared/store/audioUrls";
import { Markdown } from "./components/Markdown";
import { type ChatMessage, type ToolCallEntry, useChat } from "./hooks/useChat";

const QUICK_PROMPTS = [
  "Change the title to be punchier",
  "Set slide-0 title to Hello",
  "Rewrite the HTML with bigger text",
  "Update the narration text",
  "Add a pricing slide",
];

export function AIDock({
  projectId,
  slideId,
  slideIds,
  slides,
}: {
  projectId: string;
  slideId: string | null;
  slideIds: string[];
  slides: Record<string, { fields: Record<string, string> }>;
}) {
  const { dispatch, subscribe } = useEditBus();
  const { provider } = useAIProvider();
  const {
    items,
    setItems,
    loading,
    persistMessage,
    resolveProposal,
    newChat,
    buildLlmHistory,
  } = useChat(projectId);
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // System pings: subscribe to EditBus events and append a ping per edit.
  useEffect(() => {
    return subscribe((event) => {
      if (event.actor.startsWith("ai:")) return; // skip AI's own dispatches
      const label = opLabel(event.op);
      if (!label) return;
      const ping: ChatMessage = {
        id: event.id,
        role: "system",
        content: label,
        ephemeral: true,
      };
      setItems((prev) => [...prev, ping]);
    });
  }, [subscribe, setItems]);

  // Auto-scroll to bottom — only if the user is already near the bottom,
  // so we don't fight manual scrolling. Uses "auto" (instant) to avoid
  // competing smooth-scroll animations during rapid token updates.
  const isNearBottomRef = useRef(true);
  const onScroll = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    isNearBottomRef.current =
      el.scrollHeight - el.scrollTop - el.clientHeight < 80;
  }, []);

  useEffect(() => {
    if (isNearBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "auto" });
    }
  });

  const handleSend = useCallback(
    async (text: string) => {
      if (!text.trim() || streaming) return;
      const userMsg: ChatMessage = {
        id: `u-${Date.now()}`,
        role: "user",
        content: text,
      };
      const assistantId = `a-${Date.now()}`;
      const assistantMsg: ChatMessage = {
        id: assistantId,
        role: "assistant",
        content: "",
      };
      setItems((prev) => [...prev, userMsg, assistantMsg]);
      // Persist the user message immediately (durable before the slow stream).
      void persistMessage(userMsg);
      setStreaming(true);

      // The agent is stateless per request — send the full lean history
      // (with proposal outcomes folded in) plus the new user message.
      const outgoing = [
        ...buildLlmHistory(),
        { id: userMsg.id, role: "user" as const, content: text },
      ];

      // Stream from the backend LangGraph agent via the provider.
      let content = "";
      try {
        const events = provider.stream(outgoing, {
          projectId,
          activeSlideId: slideId,
          pins: [],
          project: { rootSlides: slideIds, slides },
        });
        for await (const evt of events) {
          if (evt.type === "token") {
            content += evt.text;
            setItems((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content } : m)),
            );
          } else if (evt.type === "thinking") {
            setItems((prev) =>
              prev.map((m) => {
                if (m.id !== assistantId) return m;
                const am = m as ChatMessage;
                return { ...am, thinking: (am.thinking ?? "") + evt.text };
              }),
            );
          } else if (evt.type === "tool_start") {
            // Append a new in-flight tool entry; tool_end fills its result.
            setItems((prev) =>
              prev.map((m) => {
                if (m.id !== assistantId) return m;
                const am = m as ChatMessage;
                return {
                  ...am,
                  toolCalls: [
                    ...(am.toolCalls ?? []),
                    {
                      id: `tc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                      tool: evt.tool,
                      args: evt.args,
                      done: false,
                    },
                  ],
                };
              }),
            );
          } else if (evt.type === "tool_end") {
            setItems((prev) =>
              prev.map((m) => {
                if (m.id !== assistantId) return m;
                const am = m as ChatMessage;
                const calls = [...(am.toolCalls ?? [])];
                for (let i = calls.length - 1; i >= 0; i--) {
                  if (!calls[i].done && calls[i].tool === evt.tool) {
                    calls[i] = {
                      ...calls[i],
                      result: evt.result,
                      ok: evt.ok,
                      done: true,
                    };
                    break;
                  }
                }
                return { ...am, toolCalls: calls };
              }),
            );
          } else if (evt.type === "proposal") {
            // Append — a turn can emit several proposals; each gets its own card.
            setItems((prev) =>
              prev.map((m) => {
                if (m.id !== assistantId) return m;
                const am = m as ChatMessage;
                return {
                  ...am,
                  content,
                  proposals: [
                    ...(am.proposals ?? []),
                    { proposal: evt.edit, state: "pending" as const },
                  ],
                };
              }),
            );
          } else if (evt.type === "error") {
            content = evt.message;
            setItems((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content } : m)),
            );
          }
        }
      } catch (err) {
        content = err instanceof Error ? err.message : "AI request failed";
        setItems((prev) =>
          prev.map((m) => (m.id === assistantId ? { ...m, content } : m)),
        );
      } finally {
        setStreaming(false);
        // Persist the finalized assistant message once (full richness).
        setItems((prev) => {
          const am = prev.find((m) => m.id === assistantId);
          if (am) void persistMessage(am);
          return prev;
        });
      }
    },
    [
      streaming,
      projectId,
      slideId,
      slideIds,
      slides,
      provider,
      setItems,
      persistMessage,
      buildLlmHistory,
    ],
  );

  const handleAccept = useCallback(
    (proposal: EditProposal) => {
      // Dispatch every op through the same EditBus a human edit uses.
      // The agent already lint-gated and validated; Accept is the human review.
      for (const op of proposal.ops) {
        dispatch(op, "ai:langgraph");
      }
      // Bridge: any setVoiceover op needs TTS to actually run. Proposal tools
      // never touch the filesystem, so trigger the existing voiceover pipeline
      // (the same path CaptionTextEditor uses) for each affected slide. Audio
      // + duration generate here, after the user accepted.
      const regenSlides = proposal.ops
        .filter((op) => op.kind === "setVoiceover")
        .map((op) => op.slideId);
      if (regenSlides.length) {
        const requestRegenerate = useAudioUrls.getState().requestRegenerate;
        for (const sid of regenSlides) requestRegenerate(sid);
      }
      void resolveProposal(proposal.id, "accepted");
      toast.success(`Applied ${proposal.ops.length} edit(s)`);
    },
    [dispatch, resolveProposal],
  );

  const handleReject = useCallback(
    (proposalId: string) => {
      void resolveProposal(proposalId, "rejected");
    },
    [resolveProposal],
  );

  return (
    <div className="flex h-full flex-col">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
        <div className="flex items-center gap-1.5">
          <Sparkles className="size-3.5 text-primary" />
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            AI
          </h2>
        </div>
        <span className="font-mono text-[10px] text-muted-foreground">
          {provider.id} · {slideId ?? "no slide"}
        </span>
      </header>

      <div
        ref={scrollRef}
        onScroll={onScroll}
        className="min-h-0 flex-1 overflow-y-auto"
      >
        <div className="space-y-3 p-3">
          {items.map((m) => {
            if (m.role === "system") {
              return <SystemPingBubble key={m.id} text={m.content} />;
            }
            return (
              <MessageBubble
                key={m.id}
                message={m}
                onAccept={handleAccept}
                onReject={handleReject}
              />
            );
          })}
          <div ref={bottomRef} />
        </div>
      </div>

      <Composer
        onSend={handleSend}
        disabled={streaming || loading}
        onNewChat={newChat}
      />
    </div>
  );
}

/** Render non-system messages; system pings are rendered separately below. */
function MessageBubble({
  message,
  onAccept,
  onReject,
}: {
  message: ChatMessage;
  onAccept: (p: EditProposal) => void;
  onReject: (id: string) => void;
}) {
  if (message.role === "system") return null;
  if (message.role === "user") {
    return (
      <div className="flex justify-end gap-1.5">
        <span className="max-w-[85%] rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground">
          {message.content}
        </span>
        <User className="mt-0.5 size-3.5 shrink-0 text-muted-foreground" />
      </div>
    );
  }

  return (
    <div className="flex justify-start gap-1.5">
      <Sparkles className="mt-0.5 size-3.5 shrink-0 text-primary" />
      <div className="w-full max-w-[90%] space-y-2">
        {message.thinking && <ThinkingBlock text={message.thinking} />}
        {message.toolCalls && message.toolCalls.length > 0 && (
          <ToolActivity calls={message.toolCalls} />
        )}
        <div className="rounded-lg border border-border bg-card px-3 py-1.5">
          {message.content ? (
            <Markdown>{message.content}</Markdown>
          ) : (
            <span className="text-xs text-muted-foreground">…</span>
          )}
        </div>
        {(() => {
          const proposals = message.proposals;
          if (!proposals || !proposals.length) return null;
          return (
            <div className="space-y-2">
              {proposals.map((p, i) => (
                <ProposalCard
                  key={p.proposal.id}
                  index={i + 1}
                  total={proposals.length}
                  proposal={p.proposal}
                  state={p.state}
                  onAccept={() => onAccept(p.proposal)}
                  onReject={() => onReject(p.proposal.id)}
                />
              ))}
            </div>
          );
        })()}
      </div>
    </div>
  );
}

/** Collapsible reasoning trace — dimmed, monospace, hidden by default. */
function ThinkingBlock({ text }: { text: string }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="rounded-md border border-dashed border-muted-foreground/30 bg-muted/30">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-[10px] font-medium uppercase tracking-wide text-muted-foreground hover:bg-muted/50"
      >
        <Sparkles className="size-3" />
        Thinking{open ? " ▾" : " ▸"}
      </button>
      {open && (
        <div className="max-h-40 overflow-y-auto whitespace-pre-wrap border-t border-dashed border-muted-foreground/20 px-2 py-1.5 font-mono text-[10px] leading-relaxed text-muted-foreground/80">
          {text}
        </div>
      )}
    </div>
  );
}

/** Inline activity log of tool invocations (args + result, collapsible). */
function ToolActivity({ calls }: { calls: ToolCallEntry[] }) {
  const [openMap, setOpenMap] = useState<Record<number, boolean>>({});
  return (
    <div className="space-y-1">
      {calls.map((c, i) => {
        const open = openMap[i] ?? false;
        return (
          <div
            key={c.id}
            className="rounded-md border border-border bg-muted/40"
          >
            <button
              type="button"
              onClick={() => setOpenMap((p) => ({ ...p, [i]: !open }))}
              className="flex w-full items-center gap-1.5 px-2 py-1 text-left text-[10px] hover:bg-muted/70"
            >
              <Wrench className="size-3 shrink-0 text-muted-foreground" />
              <span className="font-mono text-muted-foreground">{c.tool}</span>
              <span className="truncate text-muted-foreground/70">
                {summarizeArgs(c.args)}
              </span>
              <span className="ml-auto shrink-0 font-medium">
                {!c.done ? (
                  <span className="text-primary">…</span>
                ) : c.ok ? (
                  <span className="text-emerald-600 dark:text-emerald-400">
                    ✓
                  </span>
                ) : (
                  <span className="text-destructive">✗</span>
                )}
              </span>
            </button>
            {open && c.result && (
              <pre className="max-h-40 overflow-auto border-t border-border px-2 py-1.5 font-mono text-[10px] leading-snug text-muted-foreground/80">
                {c.result.slice(0, 600)}
                {c.result.length > 600 ? "\n…[truncated]" : ""}
              </pre>
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Short `key=value` summary of tool args for the chip line. */
function summarizeArgs(args: Record<string, unknown>): string {
  const parts: string[] = [];
  for (const [k, v] of Object.entries(args)) {
    if (v === undefined || v === null || v === "") continue;
    const s =
      typeof v === "string"
        ? v
        : Array.isArray(v)
          ? `[${v.length}]`
          : JSON.stringify(v);
    parts.push(`${k}=${s.length > 24 ? `${s.slice(0, 24)}…` : s}`);
  }
  return parts.join(", ");
}

function SystemPingBubble({ text }: { text: string }) {
  return (
    <div className="flex justify-center">
      <span className="rounded-full bg-muted px-2.5 py-0.5 text-[10px] text-muted-foreground">
        {text}
      </span>
    </div>
  );
}

function ProposalCard({
  proposal,
  state,
  index,
  total,
  onAccept,
  onReject,
}: {
  proposal: EditProposal;
  state: "pending" | "accepted" | "rejected" | "auto-rejected";
  /** 1-based position within the turn's proposals (omitted when only one). */
  index?: number;
  total?: number;
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <div className="rounded-md border border-dashed border-primary/40 bg-primary/5 p-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <Badge variant="outline" className="text-[10px]">
          {proposal.ops.length} op{proposal.ops.length === 1 ? "" : "s"}
        </Badge>
        <div className="flex items-center gap-1.5">
          {total && total > 1 && (
            <Badge variant="outline" className="text-[10px]">
              {index} / {total}
            </Badge>
          )}
          <Badge variant="secondary" className="text-[10px]">
            {proposal.slideId ?? "project"}
          </Badge>
        </div>
      </div>
      <p className="mb-2 text-[11px] text-foreground/80">
        {proposal.rationale}
      </p>
      <DiffDigest proposal={proposal} />
      {state === "pending" ? (
        <div className="mt-2 flex gap-2">
          <Button size="sm" className="h-8 flex-1 text-xs" onClick={onAccept}>
            Accept
          </Button>
          <Button
            size="sm"
            variant="ghost"
            className="h-8 flex-1 text-xs"
            onClick={onReject}
          >
            Reject
          </Button>
        </div>
      ) : (
        <div className="mt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {state === "accepted" && "✓ Applied"}
          {state === "rejected" && "✗ Rejected"}
          {state === "auto-rejected" && "✗ Auto-rejected"}
        </div>
      )}
    </div>
  );
}

/** Short human-readable summary of one EditOp (for the digest). */
function opSummary(op: import("@/shared/edit/EditBus").EditOp): string {
  switch (op.kind) {
    case "setField":
      return `${op.slideId}.${op.fieldId} = ${JSON.stringify(op.value).slice(0, 50)}`;
    case "setVoiceover":
      return `${op.slideId}.voiceover${op.text ? ` text=${JSON.stringify(op.text).slice(0, 40)}` : ""}`;
    case "setDuration":
      return `${op.slideId}.duration = ${op.duration}s`;
    case "addSlide":
      return `add ${op.newId}${op.afterId ? ` after ${op.afterId}` : ""}`;
    case "removeSlide":
      return `remove ${op.slideId}`;
    case "duplicateSlide":
      return `dup ${op.slideId} → ${op.newId}`;
    case "reorderSlides":
      return `reorder → ${op.order.join(", ")}`;
    case "setSlideHtml":
      return `${op.slideId}.html (<template>, ${op.html.length} chars)`;
    case "setCaptionStyle":
      return `captionStyle = ${op.style}`;
    case "setCaptionSettings":
      return `captionSettings ${JSON.stringify(op.settings).slice(0, 50)}`;
    case "setAsset":
      return `${op.slideId}.${op.fieldId} = ${op.ref.slice(0, 16)}…`;
    case "setTransition":
      return `${op.slideId}.transition`;
    default:
      return op.kind;
  }
}

function DiffDigest({ proposal }: { proposal: EditProposal }) {
  const hasHtml = proposal.ops.some((o) => o.kind === "setSlideHtml");
  const htmlStr = hasHtml
    ? (proposal.ops.find((o) => o.kind === "setSlideHtml") as { html: string })
        .html
    : "";
  const [expanded, setExpanded] = useState(false);

  return (
    <div className="space-y-1">
      <pre className="overflow-x-auto rounded bg-muted/50 p-1.5 text-[10px] leading-snug">
        {proposal.ops.map((op) => (
          <div key={JSON.stringify(op)}>
            <span className="text-primary">+ {opSummary(op)}</span>
          </div>
        ))}
      </pre>
      {htmlStr && (
        <HtmlPreview
          html={htmlStr}
          expanded={expanded}
          setExpanded={setExpanded}
        />
      )}
    </div>
  );
}

function HtmlPreview({
  html,
  expanded,
  setExpanded,
}: {
  html: string;
  expanded: boolean;
  setExpanded: (v: boolean) => void;
}) {
  const isTruncated = html.length > 120;
  const preview = !expanded && isTruncated ? `${html.slice(0, 120)}…` : html;
  return (
    <div className="relative">
      <pre
        className={`overflow-x-auto rounded bg-muted/50 p-1.5 text-[10px] leading-snug ${isTruncated ? "cursor-pointer hover:bg-muted/70 transition-colors" : ""}`}
        role={isTruncated ? "button" : undefined}
        tabIndex={isTruncated ? 0 : undefined}
        onClick={() => isTruncated && setExpanded(!expanded)}
        onKeyDown={(e) => {
          if (isTruncated && (e.key === "Enter" || e.key === " ")) {
            e.preventDefault();
            setExpanded(!expanded);
          }
        }}
        title={
          isTruncated
            ? expanded
              ? "Click to collapse"
              : "Click to expand"
            : undefined
        }
      >
        {preview}
      </pre>
      {!expanded && isTruncated && (
        <div className="pointer-events-none absolute bottom-0 left-0 right-0 h-6 bg-gradient-to-t from-muted/50 to-transparent" />
      )}
    </div>
  );
}

function Composer({
  onSend,
  disabled,
  onNewChat,
}: {
  onSend: (text: string) => void;
  disabled: boolean;
  onNewChat: () => void;
}) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);
  const taRef = useRef<HTMLTextAreaElement>(null);

  // Auto-grow: fit content up to a max, then scroll.
  // Re-run on every text change to re-measure scrollHeight.
  // biome-ignore lint/correctness/useExhaustiveDependencies: text drives the resize
  useEffect(() => {
    const ta = taRef.current;
    if (!ta) return;
    ta.style.height = "auto";
    ta.style.height = `${Math.min(ta.scrollHeight, 160)}px`;
  }, [text]);

  const submit = () => {
    if (disabled || !text.trim()) return;
    onSend(text);
    setText("");
  };

  return (
    <div className="flex shrink-0 items-center gap-1.5 border-t border-border p-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            disabled={disabled}
            aria-label="Quick prompts"
            className="shrink-0"
          >
            <Plus className="size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64">
          <div className="space-y-1">
            <button
              type="button"
              onClick={() => {
                onNewChat();
                setText("");
                setOpen(false);
              }}
              className="block w-full rounded px-2 py-1.5 text-left text-xs font-medium text-primary hover:bg-accent"
            >
              + New chat
            </button>
            <div className="mx-2 my-1 border-t border-border" />
            <p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
              Quick prompts
            </p>
            {QUICK_PROMPTS.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => {
                  onSend(q);
                  setText("");
                  setOpen(false);
                }}
                className="block w-full rounded px-2 py-1.5 text-left text-xs hover:bg-accent"
              >
                {q}
              </button>
            ))}
          </div>
        </PopoverContent>
      </Popover>
      <textarea
        ref={taRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          // Enter to send, Shift+Enter for a newline.
          if (e.key === "Enter" && !e.shiftKey && !disabled) {
            e.preventDefault();
            submit();
          }
        }}
        rows={2}
        placeholder="Ask AI to edit…"
        className="max-h-40 min-h-[60px] flex-1 resize-none rounded-md border border-border bg-background px-2.5 py-2 text-sm leading-relaxed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <Button
        variant="ghost"
        size="icon"
        disabled={disabled || !text.trim()}
        onClick={submit}
        aria-label="Send"
        className="shrink-0"
      >
        <Send className="size-4" />
      </Button>
    </div>
  );
}

/** Human-readable label for an EditEvent — shown as a system ping. */
function opLabel(op: import("@/shared/edit/EditBus").EditOp): string | null {
  switch (op.kind) {
    case "setField":
      return `You changed ${op.slideId}.${op.fieldId}`;
    case "reorderSlides":
      return "You reordered slides";
    case "addSlide":
      return `You added ${op.newId}`;
    case "removeSlide":
      return `You removed ${op.slideId}`;
    case "duplicateSlide":
      return `You duplicated ${op.slideId}`;
    case "setVoiceover":
      return `You updated voiceover on ${op.slideId}`;
    case "setDuration":
      return `Duration updated for ${op.slideId}`;
    case "setCaptionStyle":
      return `Caption style changed`;
    case "setSlideHtml":
      return `You edited HTML on ${op.slideId}`;
    case "setTransition":
      return `Transition updated on ${op.slideId}`;
    case "setAsset":
      return `Asset updated on ${op.slideId}`;
    default:
      return null;
  }
}
