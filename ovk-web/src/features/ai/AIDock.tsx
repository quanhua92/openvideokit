/**
 * AIDock — mock chat surface.
 *
 * P2 behavior:
 *   - Welcome message on mount.
 *   - Composer with a `+` button (Popover) listing 3 canned scenarios.
 *   - Picking a scenario appends a user bubble, streams the assistant
 *     preamble token-by-token, then appends an EditProposal.
 *   - Accept / Reject fire a toast ("Mock: real edits ship in P6"); the
 *     proposal is marked accepted/rejected.
 *   - Free-text send returns a canned "Mock mode — real AI ships in P6".
 *
 * P6 swaps EchoProvider for the real provider context and wires Accept to
 * editBus.dispatch(); the UI is unchanged.
 */
import { Plus, Send, Sparkles } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "@/components/ui/popover";
import type { EditProposal } from "@/shared/ai/types";
import { SCENARIOS, type ScenarioId } from "./lib/scenarios";

interface ChatMessage {
	id: string;
	role: "user" | "assistant" | "system";
	content: string;
	proposal?: EditProposal;
	proposalState?: "pending" | "accepted" | "rejected";
	streaming?: boolean;
}

export function AIDock({ slideId }: { slideId: string | null }) {
	const [messages, setMessages] = useState<ChatMessage[]>([
		{
			id: "welcome",
			role: "assistant",
			content: "Hi! I can help edit slides. Tap + to see a demo.",
		},
	]);
	const [streaming, setStreaming] = useState(false);

	function playScenario(id: ScenarioId) {
		if (!slideId) {
			toast.error("No active slide — play the timeline first.");
			return;
		}
		if (streaming) return;
		const scenario = SCENARIOS.find((s) => s.id === id);
		if (!scenario) return;
		const step = scenario.build({ slideId });

		// Append user message
		const userMsg: ChatMessage = {
			id: `u-${Date.now()}`,
			role: "user",
			content: step.userMessage,
		};
		// Append assistant placeholder (streaming)
		const assistantId = `a-${Date.now()}`;
		const assistantMsg: ChatMessage = {
			id: assistantId,
			role: "assistant",
			content: "",
			streaming: true,
		};
		setMessages((m) => [...m, userMsg, assistantMsg]);
		setStreaming(true);

		// Typewriter stream of the preamble
		const tokens = step.assistantPreamble.split(/(\s+)/); // keep whitespace tokens
		let i = 0;
		const interval = setInterval(() => {
			i += 1;
			const partial = tokens.slice(0, i).join("");
			setMessages((m) =>
				m.map((msg) =>
					msg.id === assistantId ? { ...msg, content: partial } : msg,
				),
			);
			if (i >= tokens.length) {
				clearInterval(interval);
				// Append the proposal
				setMessages((m) =>
					m.map((msg) =>
						msg.id === assistantId
							? {
									...msg,
									content: partial,
									streaming: false,
									proposal: step.proposal,
									proposalState: "pending",
								}
							: msg,
					),
				);
				setStreaming(false);
			}
		}, 30);
	}

	function handleAccept(propId: string) {
		setMessages((m) =>
			m.map((msg) =>
				msg.proposal?.id === propId
					? { ...msg, proposalState: "accepted" }
					: msg,
			),
		);
		toast.info("Mock: real edits ship in P6.");
	}

	function handleReject(propId: string) {
		setMessages((m) =>
			m.map((msg) =>
				msg.proposal?.id === propId
					? { ...msg, proposalState: "rejected" }
					: msg,
			),
		);
	}

	function handleSend() {
		if (streaming) return;
		const id = `u-${Date.now()}`;
		setMessages((m) => [
			...m,
			{
				id,
				role: "user",
				content: "(typed message — Mock mode listens for + scenarios)",
			},
			{
				id: `a-${Date.now()}`,
				role: "assistant",
				content: "Mock mode — real AI ships in P6.",
			},
		]);
	}

	return (
		<div className="flex h-full flex-col">
			<header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
				<h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					AI
				</h2>
				<span className="font-mono text-[10px] text-muted-foreground">
					mock · echo
				</span>
			</header>

			<div className="flex-1 min-h-0 overflow-y-auto">
				<div className="space-y-3 p-3">
					{messages.map((m) => (
						<MessageBubble
							key={m.id}
							message={m}
							onAccept={handleAccept}
							onReject={handleReject}
						/>
					))}
				</div>
			</div>

			<Composer
				onPick={playScenario}
				onSend={handleSend}
				disabled={streaming}
			/>
		</div>
	);
}

function MessageBubble({
	message,
	onAccept,
	onReject,
}: {
	message: ChatMessage;
	onAccept: (propId: string) => void;
	onReject: (propId: string) => void;
}) {
	if (message.role === "user") {
		return (
			<div className="flex justify-end">
				<div className="w-full rounded-lg bg-primary px-3 py-1.5 text-xs text-primary-foreground">
					{message.content}
				</div>
			</div>
		);
	}

	return (
		<div className="flex justify-start">
			<div className="w-full space-y-2">
				<div className="flex items-center gap-1 text-[10px] text-muted-foreground">
					<Sparkles className="size-3" />
					Assistant
					{message.streaming && <span className="animate-pulse">…</span>}
				</div>
				<div className="rounded-lg border border-border bg-card px-3 py-1.5 text-xs">
					{message.content || "…"}
				</div>
				{message.proposal && (
					<EditProposalCard
						proposal={message.proposal}
						state={message.proposalState ?? "pending"}
						onAccept={() => onAccept(message.proposal?.id ?? "")}
						onReject={() => onReject(message.proposal?.id ?? "")}
					/>
				)}
			</div>
		</div>
	);
}

function EditProposalCard({
	proposal,
	state,
	onAccept,
	onReject,
}: {
	proposal: EditProposal;
	state: "pending" | "accepted" | "rejected";
	onAccept: () => void;
	onReject: () => void;
}) {
	return (
		<div className="rounded-md border border-dashed border-primary/40 bg-primary/5 p-2">
			<div className="mb-1 flex items-center justify-between gap-2">
				<Badge variant="outline" className="text-[10px]">
					Tier {proposal.tier}
				</Badge>
				<span className="text-[10px] text-muted-foreground">
					{proposal.target.slideId}
				</span>
			</div>
			<div className="mb-2 text-[11px] text-foreground/80">
				{proposal.rationale}
			</div>
			<Digest proposal={proposal} />
			{state === "pending" ? (
				<div className="mt-2 flex gap-2">
					<Button className="h-8 flex-1 text-xs" onClick={onAccept}>
						Accept
					</Button>
					<Button
						variant="ghost"
						className="h-8 flex-1 text-xs"
						onClick={onReject}
					>
						Reject
					</Button>
				</div>
			) : (
				<div className="mt-2 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
					{state === "accepted" ? "✓ Accepted (mock)" : "✗ Rejected"}
				</div>
			)}
		</div>
	);
}

function Digest({ proposal }: { proposal: EditProposal }) {
	if (proposal.tier === 1) {
		const patch = proposal.patch[0];
		return (
			<pre className="overflow-x-auto rounded bg-muted/50 p-1.5 text-[10px] leading-snug">
				{patch.path} → {String(patch.value)}
			</pre>
		);
	}
	const preview =
		proposal.html.length > 100
			? `${proposal.html.slice(0, 100)}…`
			: proposal.html;
	return (
		<pre className="overflow-x-auto rounded bg-muted/50 p-1.5 text-[10px] leading-snug">
			{preview}
		</pre>
	);
}

function Composer({
	onPick,
	onSend,
	disabled,
}: {
	onPick: (id: ScenarioId) => void;
	onSend: () => void;
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
						aria-label="Scenarios"
					>
						<Plus className="size-4" />
					</Button>
				</PopoverTrigger>
				<PopoverContent align="start" className="w-64">
					<div className="space-y-1">
						<p className="px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
							Mock scenarios
						</p>
						{SCENARIOS.map((s) => (
							<button
								key={s.id}
								type="button"
								onClick={() => {
									onPick(s.id);
									setOpen(false);
								}}
								className="flex w-full flex-col items-start gap-0.5 rounded px-2 py-1.5 text-left text-xs hover:bg-accent"
							>
								<span className="font-medium">{s.label}</span>
								<span className="text-[10px] text-muted-foreground">
									{s.description}
								</span>
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
						onSend();
						setText("");
					}
				}}
				placeholder="Type a message…"
				className="flex-1 rounded-md border border-border bg-background px-2 py-1 text-xs focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
			/>
			<Button
				variant="ghost"
				size="icon"
				onClick={() => {
					onSend();
					setText("");
				}}
				disabled={disabled}
				aria-label="Send"
			>
				<Send className="size-4" />
			</Button>
		</div>
	);
}
