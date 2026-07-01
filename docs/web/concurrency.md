# Concurrency & Sync — optimistic locking + SSE push

## Problem

The project can be mutated by multiple sources:

- The frontend editor (user typing, dragging, AI accept)
- A server-side AI agent (future)
- An external process editing the project file on disk (future)

Without coordination, writes race and updates are lost.

## Solution: content-hash rev + SSE

Every project bundle carries a `rev` — a SHA-256 hash of its contents
(`root`, `slides`, `slideHtml`). The rev is **derived**, never stored:

```
rev = sha256(canonical_json({root, slides, slideHtml}))[:16]
```

Any byte-level change — by any source — produces a different hash.

### Write flow (PUT)

```
Client                          Server
  │                               │
  │  GET /projects/proj-1         │
  │ ─────────────────────────────>│  rev = "abc123"
  │ <─────────────────────────────│  {rev, root, slides, slideHtml}
  │                               │
  │  (user edits locally)         │
  │                               │
  │  PUT /projects/proj-1         │
  │  body.rev = "abc123"          │
  │ ─────────────────────────────>│  hash(store) == "abc123"? ✓
  │ <─────────────────────────────│  200 {rev: "def456", ...}
  │                               │  broadcast SSE → all subscribers
  │                               │
```

If another agent mutated the store between the client's GET and PUT,
the hash won't match:

```
  │  PUT /projects/proj-1         │
  │  body.rev = "abc123"          │  hash(store) == "xyz789"? ✗
  │ <─────────────────────────────│  409 {current: {rev: "xyz789", ...}}
  │                               │
  │  (refetch, re-apply edit)     │
```

### Read flow (SSE)

```
Client A (editing)              Server               Client B (or AI agent)
  │                               │                       │
  │  GET /projects/p1/events      │                       │
  │ ─────────────────────────────>│  (SSE stream open)    │
  │ <─────────────────────────────│                       │
  │                               │                       │
  │                               │  PUT /projects/p1     │
  │                               │ <─────────────────────│
  │                               │  200 + broadcast      │
  │ <─────────────────────────────│  data: {rev:"xyz789"} │
  │                               │                       │
  │  (invalidate + refetch)       │                       │
```

## API

| Method | Path | Purpose |
|--------|------|---------|
| `GET` | `/api/projects/{id}` | Returns bundle with derived `rev` |
| `PUT` | `/api/projects/{id}` | Replace bundle; body must include `rev`. 200 on match, 409 on stale |
| `GET` | `/api/projects/{id}/events` | SSE stream; pushes `{projectId, rev}` on every mutation |

## Frontend wiring

- `useProjectSync(projectId)` — mounted in `Studio.tsx`
  - Opens `EventSource` on `/events` → on push: invalidate query + bump `compositionVersion`
  - Debounced 800ms after each local edit → `client.saveProject()` → on 200: update cache + bump version; on 409: reload server's bundle + toast
- `useCompositionVersion` — Zustand store; StageCanvas appends `?v=N` to the HF player `src`
- **Only the HF player's iframe reloads — not the page.** When `compositionVersion` bumps, the `src` attribute on `<hyperframes-player>` changes, triggering the player's `attributeChangedCallback("src")` which sets `iframe.src` internally. The React SPA, all panels, the timeline, edit state, and undo/redo stacks stay mounted and intact. Only the 1920×1080 preview iframe inside the player's Shadow DOM refreshes to fetch the re-stamped composition.

## Why not WebSocket?

SSE is unidirectional (server → client), which is all we need for push
notifications. It's simpler, works through proxies, and auto-reconnects.
The client → server path uses normal HTTP PUT.
