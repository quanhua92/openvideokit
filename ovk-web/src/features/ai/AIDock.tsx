/**
 * AIDock — AI chat surface with real EditBus dispatch.
 *
 *   - Accept dispatches every EditOp in the proposal through EditBus (the
 *     same path a human edit takes) → undo/redo works uniformly.
 *   - The provider streams from the backend LangGraph agent
 *     (/api/projects/:id/ai/chat) via HttpSseProvider. No inference in the
 *     browser. See docs/ai.md.
 *   - ChatThread subscribes to EditBus events → human edits surface as dimmed
 *     system pings in the chat.
 *   - Scenario picker (+ button) remains for quick access.
 */
import { Plus, Send, Sparkles, User } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { create } from "zustand";
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

interface ChatMessage {
  id: string;
  role: "user" | "assistant" | "system";
  content: string;
  proposal?: EditProposal;
  proposalState?: "pending" | "accepted" | "rejected" | "auto-rejected";
}

interface SystemPing {
  id: string;
  role: "system";
  content: string;
}

type ThreadItem = ChatMessage | SystemPing;

const useAIStore = create<{
  items: ThreadItem[];
  setItems: (
    updater: ThreadItem[] | ((prev: ThreadItem[]) => ThreadItem[]),
  ) => void;
}>((set) => ({
  items: [
    {
      id: "welcome",
      role: "assistant",
      content:
        "Hi! I can edit slides. Try a quick prompt below or type your own.",
    },
  ],
  setItems: (updater) =>
    set((state) => ({
      items: typeof updater === "function" ? updater(state.items) : updater,
    })),
}));

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
  const items = useAIStore((s) => s.items);
  const setItems = useAIStore((s) => s.setItems);
  const [streaming, setStreaming] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  // System pings: subscribe to EditBus events and append a ping per edit.
  useEffect(() => {
    return subscribe((event) => {
      if (event.actor.startsWith("ai:")) return; // skip AI's own dispatches
      const label = opLabel(event.op);
      if (!label) return;
      const ping: SystemPing = {
        id: event.id,
        role: "system",
        content: label,
      };
      setItems((prev) => [...prev, ping]);
    });
  }, [subscribe, setItems]);

  // Auto-scroll to bottom on every render (messages change infrequently).
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
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
      setStreaming(true);

      // Stream from the backend LangGraph agent via the provider.
      try {
        const events = provider.stream(
          [{ id: userMsg.id, role: "user", content: text }],
          {
            projectId,
            activeSlideId: slideId,
            pins: [],
            project: { rootSlides: slideIds, slides },
          },
        );
        let content = "";
        for await (const evt of events) {
          if (evt.type === "token") {
            content += evt.text;
            setItems((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content } : m)),
            );
          } else if (evt.type === "proposal") {
            setItems((prev) =>
              prev.map((m) =>
                m.id === assistantId
                  ? {
                      ...m,
                      content,
                      proposal: evt.edit,
                      proposalState: "pending",
                    }
                  : m,
              ),
            );
          } else if (evt.type === "error") {
            content = evt.message;
            setItems((prev) =>
              prev.map((m) => (m.id === assistantId ? { ...m, content } : m)),
            );
          }
        }
      } finally {
        setStreaming(false);
      }
    },
    [streaming, projectId, slideId, slideIds, slides, provider, setItems],
  );

  const handleAccept = useCallback(
    (proposal: EditProposal) => {
      // Dispatch every op through the same EditBus a human edit uses.
      // The agent already lint-gated and validated; Accept is the human review.
      for (const op of proposal.ops) {
        dispatch(op, "ai:langgraph");
      }
      setItems((prev) =>
        prev.map((m) =>
          "proposal" in m && m.proposal?.id === proposal.id
            ? { ...m, proposalState: "accepted" }
            : m,
        ),
      );
      toast.success(`Applied ${proposal.ops.length} edit(s)`);
    },
    [dispatch, setItems],
  );

  const handleReject = useCallback(
    (proposalId: string) => {
      setItems((prev) =>
        prev.map((m) =>
          "proposal" in m && m.proposal?.id === proposalId
            ? { ...m, proposalState: "rejected" }
            : m,
        ),
      );
    },
    [setItems],
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

      <div ref={scrollRef} className="min-h-0 flex-1 overflow-y-auto">
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

      <Composer onSend={handleSend} disabled={streaming} />
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
        <div className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs">
          {message.content || "…"}
        </div>
        {message.proposal && (
          <ProposalCard
            proposal={message.proposal}
            state={message.proposalState ?? "pending"}
            onAccept={() => onAccept(message.proposal as EditProposal)}
            onReject={() => onReject((message.proposal as EditProposal).id)}
          />
        )}
      </div>
    </div>
  );
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
  onAccept,
  onReject,
}: {
  proposal: EditProposal;
  state: "pending" | "accepted" | "rejected" | "auto-rejected";
  onAccept: () => void;
  onReject: () => void;
}) {
  return (
    <div className="rounded-md border border-dashed border-primary/40 bg-primary/5 p-2">
      <div className="mb-1 flex items-center justify-between gap-2">
        <Badge variant="outline" className="text-[10px]">
          {proposal.ops.length} op{proposal.ops.length === 1 ? "" : "s"}
        </Badge>
        <Badge variant="secondary" className="text-[10px]">
          {proposal.slideId ?? "project"}
        </Badge>
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
          <div key={opSummary(op)}>
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
}: {
  onSend: (text: string) => void;
  disabled: boolean;
}) {
  const [text, setText] = useState("");
  const [open, setOpen] = useState(false);

  return (
    <div className="flex shrink-0 items-center gap-1.5 border-t border-border p-2">
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            disabled={disabled}
            aria-label="Quick prompts"
          >
            <Plus className="size-4" />
          </Button>
        </PopoverTrigger>
        <PopoverContent align="start" className="w-64">
          <div className="space-y-1">
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
      <input
        value={text}
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && !disabled) {
            e.preventDefault();
            onSend(text);
            setText("");
          }
        }}
        placeholder="Ask AI to edit…"
        className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      />
      <Button
        variant="ghost"
        size="icon"
        disabled={disabled || !text.trim()}
        onClick={() => {
          onSend(text);
          setText("");
        }}
        aria-label="Send"
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
