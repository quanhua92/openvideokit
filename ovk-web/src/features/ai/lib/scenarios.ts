/**
 * Mock AI scenarios — canned conversation flows for the P2 AIDock.
 *
 * Three scenarios, each producing a user message + assistant typewriter
 * response + an EditProposal carrying the right op shape. Accept/Reject
 * in P2 only shows a toast — no real mutation. P6 wires `Accept` to
 * `editBus.dispatch(proposal.patch)` and `Reject` collapses the proposal.
 */

import type { EditProposal } from "@/shared/ai/types";

export interface ScenarioStep {
	/** User message that "triggered" the proposal (shown in chat). */
	userMessage: string;
	/** Assistant preamble before the proposal (streamed token-by-token). */
	assistantPreamble: string;
	/** Proposal payload. */
	proposal: EditProposal;
}

export type ScenarioId = "changeTitle" | "rewriteHtml" | "addSlide";

export const SCENARIOS: ReadonlyArray<{
	id: ScenarioId;
	label: string;
	description: string;
	build: (ctx: { slideId: string }) => ScenarioStep;
}> = [
	{
		id: "changeTitle",
		label: "Change title",
		description: "Tier-1 JSON patch on slide-1.title",
		build: ({ slideId }) => ({
			userMessage: `Change ${slideId} title to something punchier`,
			assistantPreamble: `Sure — here's a bolder title for ${slideId}.`,
			proposal: {
				id: `prop-${Math.random().toString(36).slice(2, 8)}`,
				tier: 1,
				target: { kind: "slide", slideId },
				patch: [
					{ op: "replace", path: "/fields/title", value: "BOLD: Eco Bottle" },
				],
				rationale: "Stronger verb + brand emphasis.",
			},
		}),
	},
	{
		id: "rewriteHtml",
		label: "Rewrite HTML",
		description: "Tier-2 full slide HTML swap",
		build: ({ slideId }) => ({
			userMessage: `Rewrite ${slideId} with a bolder layout`,
			assistantPreamble: `Try this — same fields, bigger type, tighter spacing.`,
			proposal: {
				id: `prop-${Math.random().toString(36).slice(2, 8)}`,
				tier: 2,
				target: { kind: "slide", slideId },
				html: `<template><div data-composition-id="__SLIDE_ID__" data-width="1920" data-height="1080"><div class="content"><h1>__TITLE__</h1><p>__BODY__</p></div><style>[data-composition-id="__SLIDE_ID__"] { background: #0a0a14; color: white; } [data-composition-id="__SLIDE_ID__"] .content { text-align: center; padding-top: 30vh; } [data-composition-id="__SLIDE_ID__"] h1 { font-size: 300px; font-weight: 800; margin-bottom: 24px; letter-spacing: -0.04em; } [data-composition-id="__SLIDE_ID__"] p { font-size: 60px; font-weight: 400; opacity: 0.9; }</style></div></template>`,
				rationale: "Bumped h1 to 300px, removed extra padding.",
			},
		}),
	},
	{
		id: "addSlide",
		label: "Add slide",
		description: "Insert a new pricing slide",
		build: ({ slideId }) => ({
			userMessage: `Add a pricing slide after ${slideId}`,
			assistantPreamble: `Here's a pricing card layout for the new slide.`,
			proposal: {
				id: `prop-${Math.random().toString(36).slice(2, 8)}`,
				tier: 3,
				target: { kind: "root" },
				op: "addSlide",
				afterId: slideId,
				newId: `slide-${Math.random().toString(36).slice(2, 8)}`,
				html: `<template><div data-composition-id="__SLIDE_ID__" data-width="1920" data-height="1080"><div class="content"><h1>Pricing Plans</h1><p>__BODY__</p></div><style>[data-composition-id="__SLIDE_ID__"] { background: #1a1a2e; color: white; } [data-composition-id="__SLIDE_ID__"] .content { text-align: center; padding-top: 30vh; } [data-composition-id="__SLIDE_ID__"] h1 { font-size: 140px; font-weight: 800; color: #4ade80; } [data-composition-id="__SLIDE_ID__"] p { font-size: 70px; font-weight: 600; }</style></div></template>`,
				rationale:
					"Standard 3-tier pricing layout, ties into existing field shape.",
			},
		}),
	},
];
