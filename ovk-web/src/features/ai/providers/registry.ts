/**
 * Provider registry — maps ProviderId to factory functions.
 *
 * The EchoProvider mock was retired (docs/ai.md §10) once the real server-side
 * agent landed. The only provider is now HttpSseProvider, which talks to the
 * Python LangGraph agent at /api/projects/:id/ai/chat.
 */
import type { AIProvider, ProviderId } from "@/shared/ai/types";

import { HttpSseProvider } from "./HttpSseProvider";

export function createRegistry(): Map<ProviderId, () => AIProvider> {
  return new Map<ProviderId, () => AIProvider>([
    ["http", () => HttpSseProvider],
  ]);
}

export const PROVIDER_LABELS: Record<ProviderId, string> = {
  http: "AI (server)",
};
