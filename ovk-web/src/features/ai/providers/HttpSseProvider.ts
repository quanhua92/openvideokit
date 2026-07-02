/**
 * HttpSseProvider — the real AI provider. POSTs the chat to the backend
 * ``/api/projects/:id/ai/chat`` SSE endpoint (the LangGraph agent in
 * src/openvideokit/ai/) and parses the stream into AIStreamEvents.
 *
 * Mirrors the old EchoProvider's ``stream()`` signature so the AIDock consumes
 * it identically. No LLM, no key, no inference in the browser — that all
 * happens server-side.
 */

import type { AIProvider, AIStreamEvent, ProviderId } from "@/shared/ai/types";
import { apiBaseUrl } from "@/shared/config";

async function* parseSse(
  reader: ReadableStreamDefaultReader<Uint8Array>,
): AsyncIterable<AIStreamEvent> {
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    // SSE events are separated by a blank line.
    let idx = buffer.indexOf("\n\n");
    while (idx !== -1) {
      const block = buffer.slice(0, idx);
      buffer = buffer.slice(idx + 2);
      const ev = parseBlock(block);
      if (ev) yield ev;
      idx = buffer.indexOf("\n\n");
    }
  }
  // Flush any trailing partial block.
  if (buffer.trim()) {
    const ev = parseBlock(buffer);
    if (ev) yield ev;
  }
}

function parseBlock(block: string): AIStreamEvent | null {
  // Each line is either "data: <json>", a ": keepalive" comment, or empty.
  const dataLines = block
    .split("\n")
    .filter((l) => l.startsWith("data:"))
    .map((l) => l.slice(5).trim());
  if (dataLines.length === 0) return null;
  const payload = dataLines.join("\n");
  if (!payload) return null;
  try {
    return JSON.parse(payload) as AIStreamEvent;
  } catch {
    return null;
  }
}

export const HttpSseProvider: AIProvider = {
  id: "http" as ProviderId,
  label: "AI (server)",
  async *stream(messages, ctx) {
    const body = {
      messages: messages.map((m) => ({ role: m.role, content: m.content })),
      activeSlideId: ctx.activeSlideId,
      pins: ctx.pins,
    };
    const res = await fetch(
      `${apiBaseUrl}/projects/${encodeURIComponent(ctx.projectId)}/ai/chat`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream",
        },
        body: JSON.stringify(body),
      },
    );
    if (!res.ok || !res.body) {
      yield {
        type: "error",
        message: `AI request failed: ${res.status} ${res.statusText}`,
      };
      return;
    }
    yield* parseSse(res.body.getReader());
  },
};
