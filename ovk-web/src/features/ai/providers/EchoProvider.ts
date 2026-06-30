/**
 * EchoProvider — keyword-routed mock AI provider.
 *
 * Matches keywords in the user's last message and returns canned
 * EditProposal shapes. Deterministic, offline, no tokens. Streams tokens
 * via async generator + setTimeout.
 */

import type {
	AIContext,
	AIProvider,
	AIStreamEvent,
	ProviderId,
} from "@/shared/ai/types";

interface Scenario {
	keywords: string[];
	build: (ctx: AIContext) => AIStreamEvent[];
}

const SCENARIOS: Scenario[] = [
	{
		keywords: ["title", "change", "punchy", "bolder"],
		build: (ctx) =>
			withStream("Sure — here's a punchier title.", {
				id: rand(),
				tier: 1 as const,
				target: {
					kind: "slide" as const,
					slideId: ctx.activeSlideId ?? "slide-0",
				},
				patch: [
					{
						op: "replace" as const,
						path: "/fields/title",
						value: "BOLD: Eco Bottle",
					},
				],
				rationale: "Stronger verbs + brand emphasis.",
			}),
	},
	{
		keywords: ["body", "change", "text"],
		build: (ctx) =>
			withStream("Updated body text for this slide.", {
				id: rand(),
				tier: 1 as const,
				target: {
					kind: "slide" as const,
					slideId: ctx.activeSlideId ?? "slide-0",
				},
				patch: [
					{
						op: "replace" as const,
						path: "/fields/body",
						value: "Reclaimed ocean plastic, reimagined.",
					},
				],
				rationale: "Shorter, more impactful copy.",
			}),
	},
	{
		keywords: ["html", "rewrite", "layout", "bigger"],
		build: (ctx) =>
			withStream("Try this — same fields, bigger type, tighter spacing.", {
				id: rand(),
				tier: 2 as const,
				target: {
					kind: "slide" as const,
					slideId: ctx.activeSlideId ?? "slide-0",
				},
				html: `<template>\n  <div data-composition-id="__SLIDE_ID__" data-width="1920" data-height="1080">\n    <h1 style="font-size:160px">__TITLE__</h1>\n    <p>__BODY__</p>\n  </div>\n</template>`,
				rationale: "Bumped h1 to 160px, removed extra padding.",
			}),
	},
	{
		keywords: ["add", "slide", "pricing", "new"],
		build: (ctx) =>
			withStream("Here's a new pricing slide layout.", {
				id: rand(),
				tier: 3 as const,
				target: { kind: "root" as const },
				op: "addSlide" as const,
				afterId: ctx.activeSlideId ?? "slide-0",
				newId: rand(),
				html: `<template>\n  <div data-composition-id="__SLIDE_ID__" data-width="1920" data-height="1080">\n    <h1>Pricing</h1>\n    <p>__BODY__</p>\n  </div>\n</template>`,
				rationale: "Standard pricing layout tied to existing fields.",
			}),
	},
	{
		keywords: ["voiceover", "narration", "voice"],
		build: (ctx) =>
			withStream("Updated the narration text.", {
				id: rand(),
				tier: 1 as const,
				target: {
					kind: "slide" as const,
					slideId: ctx.activeSlideId ?? "slide-0",
				},
				patch: [
					{
						op: "replace" as const,
						path: "/voiceover/text",
						value: "Discover the Eco Bottle — sustainability meets design.",
					},
				],
				rationale: "More engaging opening hook.",
			}),
	},
];

function rand(): string {
	return `prop-${Math.random().toString(36).slice(2, 8)}`;
}

function withStream(
	preamble: string,
	proposal: import("@/shared/ai/types").EditProposal,
): AIStreamEvent[] {
	const events: AIStreamEvent[] = [];
	const tokens = preamble.split(/(\s+)/);
	for (const t of tokens) {
		events.push({ type: "token", text: t });
	}
	events.push({ type: "proposal", edit: proposal });
	events.push({ type: "done" });
	return events;
}

function findScenario(userText: string): Scenario | null {
	const lower = userText.toLowerCase();
	let best: Scenario | null = null;
	let bestScore = 0;
	for (const s of SCENARIOS) {
		const score = s.keywords.filter((k) => lower.includes(k)).length;
		if (score > bestScore) {
			bestScore = score;
			best = s;
		}
	}
	return best;
}

export const EchoProvider: AIProvider = {
	id: "echo" as ProviderId,
	label: "Echo (mock)",
	async *stream(_messages, ctx) {
		const lastUser = [..._messages].reverse().find((m) => m.role === "user");
		const userText = lastUser?.content ?? "";

		const scenario = findScenario(userText);
		if (!scenario) {
			yield {
				type: "token",
				text: "I didn't catch that. Try keywords like 'change title', 'rewrite html', or 'add slide'.",
			};
			yield { type: "done" };
			return;
		}

		for (const evt of scenario.build(ctx)) {
			if (evt.type === "token") {
				await new Promise((r) => setTimeout(r, 30));
			}
			yield evt;
		}
	},
};
