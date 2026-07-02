# Chat Persistence — Implementation Spec

| | |
|---|---|
| **Status** | Implementation contract for chat persistence on the `ai` branch |
| **Scope** | JSONL chat storage, `/chats` endpoints, AIDock reload-on-F5, "New chat" |
| **Related** | [`docs/ai.md`](./ai.md) (the agent), `ovk-web/src/features/ai/AIDock.tsx` |

---

## 1. Why

Today the AIDock's thread lives in an in-memory zustand store (`useAIStore`) with
**no persistence** — F5 resets it to a canned welcome message and the whole
conversation is lost. Worse, **proposal accept/reject outcomes evaporate**, so
the agent gets zero feedback: it can't tell that the user rejected its last
`setField` and may re-propose the same edit.

This spec adds server-side JSONL persistence so:
- a chat survives F5 / reload (the AIDock always shows the newest chat);
- the user can start a fresh chat ("New chat");
- proposal accept/reject is **remembered and fed back to the model** on the next
  turn, so it learns from rejections.

---

## 2. Storage model

```
data/{project_id}/chats/{chat_id}.jsonl
```

One JSON object per line. Three record types, discriminated by `type`:

```json
{"type":"meta","id":"<uuid>","created_at":"2026-07-02T15:30:00Z"}
{"type":"message","id":"u-1700000000","role":"user","content":"change slide-0 title","created_at":"…"}
{"type":"message","id":"a-1700000001","role":"assistant","content":"Sure.","thinking":"…","toolCalls":[…],"proposals":[{"proposal":{…},"state":"pending"}],"created_at":"…"}
{"type":"resolution","proposalId":"prop-xx","state":"rejected","at":"…"}
```

- **`meta`** — exactly one, the first line. `id` is the chat's uuid; `created_at`
  is server time at creation. `list_chats` reads this line for ordering.
- **`message`** — a chat bubble. `role` is `user` | `assistant` | `system`.
  Full richness: `content` (text), optional `thinking` (reasoning trace),
  optional `toolCalls` (activity log), optional `proposals` (array of
  `{proposal, state}`). `state` starts `pending` and is reconciled from
  resolution records on read.
- **`resolution`** — not a bubble. Records that a proposal was accepted or
  rejected. Tiny and pure-append; never rewrites a message line.

The file is **append-only**. No record is ever mutated or resent.

---

## 3. Endpoints (all per-project)

| Method | Path | Body / Returns |
|---|---|---|
| `GET` | `/api/projects/{id}/chats` | `[{id, created_at}]` newest-first |
| `POST` | `/api/projects/{id}/chats` | _(empty)_ → `{id, created_at}` |
| `GET` | `/api/projects/{id}/chats/{chat_id}` | `{id, created_at, messages:[…]}` (proposal states reconciled) |
| `POST` | `/api/projects/{id}/chats/{chat_id}/messages` | one record (`message` or `resolution`) → `{ok:true}` |

Unknown project / chat → 404. Malformed JSONL lines are skipped on read (never
crash the GET).

---

## 4. Write pattern (Model A — per-message append)

A turn produces exactly **2 messages** (the streaming events — tokens, thinking,
tool_calls, proposals — all fold into ONE assistant message object). The
frontend appends each message once, at finalization; it never resends, never
uploads the whole thread.

```
user types + sends
  → POST /messages  {type:message, role:user, content}      (durable immediately)
  → POST /ai/chat   (stream; events accumulate in-memory into one assistant msg)
  → on stream done:
     POST /messages  {type:message, role:assistant, content, thinking, toolCalls, proposals}
user clicks Accept/Reject on a proposal
  → POST /messages  {type:resolution, proposalId, state}    (tiny; pure append)
```

The user message is persisted **before** the slow LLM stream, so it survives a
crash / closed tab mid-stream.

### 4.1 Interrupted streams — no partial persistence

If the SSE stream is interrupted (connection drop, mobile tab freeze,
page discarded by the OS), the assistant message is **discarded
entirely**. It is never POSTed to `/messages`.

Rationale:
- A partial text answer is useless — the user can't act on "Sure, I'll
  change the title t…".
- Even proposals from an interrupted turn may be incomplete (the agent
  may have been about to emit more).
- Re-sending gives a complete, coherent turn.

What survives:
- The **user** message is persisted before the stream (§4), so on reload
  the user sees their question with no answer.
- On reload, an orphaned user message (user msg with no following
  assistant msg) is a signal that the previous turn failed.

Future: a "retry" affordance next to orphaned user messages.

### 4.2 AIDock mount lifecycle

AIDock is **kept mounted** across panel switches (CSS `hidden`, not
conditional render) in both `StudioMobile` and `StudioDesktop`. This
prevents the SSE stream from being killed when the user switches panels
in the editor. An unmount only occurs on route navigation (leaving
`/editor`).

---

## 5. Proposal outcomes as context (Option B)

A proposal's accept/reject is meaningful and must reach the model next turn. We
do **not** use a mid-stream `system` message for this — that's provider-fragile
(some OpenAI-compatible endpoints ignore a `system` message that isn't first).

Instead the outcome is **folded into the assistant message's `content` at
`/ai/chat` history-build time**:

- The `resolution` record persists the proposal's `state` (source of truth).
- On load (`GET /chats/{id}`), the backend reconciles each assistant proposal's
  `state` from the resolution records.
- When the frontend builds the messages array for `/ai/chat`, for any assistant
  message with a **resolved** proposal it appends a short outcome line to that
  message's content:

  ```
  Sure.

  [outcome: proposal prop-xx (setField slide-0.title='Hello') was REJECTED.]
  ```

So the model sees its own prior turn annotated with what happened to its
proposal — no new message type, no mid-stream system, works on every provider.
`Acceptance` is symmetric (`… was ACCEPTED and applied.`).

---

## 6. Sent vs. stored vs. display-only

| Data | Persisted in JSONL | Sent to `/ai/chat` next turn |
|---|---|---|
| user / assistant **text** | yes | yes |
| **proposal outcome** (folded into assistant content) | yes (resolution record) | yes |
| `thinking` | yes (full richness) | **no** — bulk + stale + some providers reject round-tripped reasoning |
| `toolCalls` | yes (full richness) | **no** — display-only |
| human-edit **pings** (EditBus `system` role) | **no** (ephemeral overlay) | no |

Reasoning/tool-call traces are kept for faithful F5 restore of the collapsible
"Thinking ▸" / tool chips, but they are **not** replayed to the model: the
answer text + folded outcomes already carry the decision, and replaying them
would inflate tokens and risk provider rejection.

---

## 7. Reload flow (F5)

```
AIDock mounts
  → GET /api/projects/{id}/chats                       (newest-first list)
  → empty? POST /chats (create one) : pick items[0]
  → GET /api/projects/{id}/chats/{id}                  (reconciled messages)
  → hydrate the store; proposal cards show their resolved state
```

"AIDock always shows the last chat" = the chat with the max `created_at`. No
client-side pointer / localStorage; works across tabs and devices.

---

## 8. "New chat"

A "New chat" button lives in the AIDock composer's `+` popover (above the quick
prompts). Click → `POST /chats` → switch the active chat id → clear the thread
(the welcome placeholder returns). The previous chats remain on disk and in the
`/chats` list; for v1 the AIDock always shows the newest, so creating one makes
it the shown one.

---

## 9. Ephemeral vs. persisted

The AIDock subscribes to `EditBus` and shows human edits as dimmed system pings.
These are **ephemeral UI** — they live in an in-memory overlay tagged
`{ephemeral:true}`, are **never POSTed**, and are **excluded** from the
`/ai/chat` history. Only `user` / `assistant` messages and `resolution` records
persist and travel to the model. (They could be filtered out, but for v1 they're
simply not written.)

---

## 10. Execution

1. This doc.
2. Backend `src/openvideokit/chats.py` + 4 routes + `tests/test_chats.py`.
3. Frontend `features/ai/hooks/useChat.ts` + `AIDock.tsx` refactor + "New chat"
   button + `useChat.test.ts`.
4. Verify: `uv run ruff check --fix`, `uv run pytest tests/`, `pnpm exec tsc
   --noEmit`, `pnpm exec biome check --write`, `pnpm test`; smoke (F5 restores;
   accept/reject folded into the next turn's context).
5. Finalize this doc against shipped code.
