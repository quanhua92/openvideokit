/**
 * Provider registry — maps ProviderId to factory functions.
 *
 * EchoProvider is implemented; real providers are stubs that throw on
 * stream(). Swap the stubs for real HTTP impls in a later phase — the
 * AIDock UI and op translation layer are unchanged.
 */
import type { AIProvider, ProviderId } from "@/shared/ai/types";

import { EchoProvider } from "./EchoProvider";

function stub(id: ProviderId, label: string): AIProvider {
	return {
		id,
		label,
		async *stream() {
			yield {
				type: "error",
				message: `${label} is not wired yet (post-P6). Echo provider works — switch in Settings.`,
			};
		},
	};
}

export function createRegistry(): Map<ProviderId, () => AIProvider> {
	return new Map<ProviderId, () => AIProvider>([
		["echo", () => EchoProvider],
		["openai", () => stub("openai", "OpenAI")],
		["anthropic", () => stub("anthropic", "Anthropic")],
		["ollama", () => stub("ollama", "Ollama (local)")],
	]);
}

export const PROVIDER_LABELS: Record<ProviderId, string> = {
	echo: "Echo (mock)",
	openai: "OpenAI",
	anthropic: "Anthropic",
	ollama: "Ollama (local)",
};
