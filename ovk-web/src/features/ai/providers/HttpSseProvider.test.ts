/**
 * HttpSseProvider tests — feeds a synthetic SSE byte stream and asserts the
 * provider yields the right AIStreamEvent sequence.
 */
import { describe, expect, it } from "vitest";

import type { AIContext, AIMessage } from "@/shared/ai/types";
import { HttpSseProvider } from "./HttpSseProvider";

function syntheticSse(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
}

const ctx: AIContext = {
  projectId: "proj-1",
  activeSlideId: "slide-0",
  pins: [],
  project: { rootSlides: ["slide-0"], slides: {} },
};

const messages: AIMessage[] = [{ id: "u1", role: "user", content: "hi" }];

describe("HttpSseProvider", () => {
  it("parses token → proposal → done", async () => {
    const sseBody = [
      'data: {"type":"open"}\n\n',
      'data: {"type":"token","text":"Hello"}\n\n',
      'data: {"type":"token","text":" world"}\n\n',
      'data: {"type":"proposal","edit":{"id":"p1","ops":[{"kind":"setField","slideId":"slide-0","fieldId":"title","value":"Hi"}],"rationale":"r","slideId":"slide-0"}}\n\n',
      'data: {"type":"done"}\n\n',
    ].join("");

    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(syntheticSse([sseBody]), {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      })) as typeof fetch;

    try {
      const events = [];
      for await (const ev of HttpSseProvider.stream(messages, ctx)) {
        events.push(ev);
      }
      const types = events.map((e) => e.type);
      expect(types).toEqual(["open", "token", "token", "proposal", "done"]);
      const prop = events.find((e) => e.type === "proposal");
      expect(prop && "edit" in prop && prop.edit.ops[0].kind).toBe("setField");
    } finally {
      globalThis.fetch = original;
    }
  });

  it("handles chunked frames split across reads", async () => {
    // One event split across two chunks + a keepalive comment
    const chunks = [
      'data: {"type":"tok',
      'en","text":"Hi"}\n\n: keepalive\n\n',
      'data: {"type":"done"}\n\n',
    ];
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response(syntheticSse(chunks), {
        status: 200,
        headers: { "content-type": "text/event-stream" },
      })) as typeof fetch;

    try {
      const events = [];
      for await (const ev of HttpSseProvider.stream(messages, ctx)) {
        events.push(ev);
      }
      const types = events.map((e) => e.type);
      expect(types).toEqual(["token", "done"]);
    } finally {
      globalThis.fetch = original;
    }
  });

  it("yields error on non-200", async () => {
    const original = globalThis.fetch;
    globalThis.fetch = (async () =>
      new Response("nope", {
        status: 500,
        statusText: "Internal",
      })) as typeof fetch;

    try {
      const events = [];
      for await (const ev of HttpSseProvider.stream(messages, ctx)) {
        events.push(ev);
      }
      expect(events[0].type).toBe("error");
      expect(events[0].type === "error" && events[0].message).toContain("500");
    } finally {
      globalThis.fetch = original;
    }
  });
});
