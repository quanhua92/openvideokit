# Concurrency & Sync — optimistic locking + SSE push

## Problem

The project can be mutated by multiple sources:

- The frontend editor (user typing, dragging, AI accept)
- A server-side AI agent editing `project.json` on disk
- An external process editing the project file directly

All are handled. Without coordination, writes race and updates are lost.

## Solution: content-hash rev + flock + file watcher + SSE

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
the hash won't match — **the user's edits are never lost**:

```
  │  PUT /projects/proj-1         │
  │  body.rev = "abc123"          │  hash(store) == "xyz789"? ✗
  │ <─────────────────────────────│  409 {current: {rev: "xyz789", ...}}
  │                               │
  │  3-way merge:                 │
  │    base (last server state)   │
  │    local (user's edits)       │
  │    server (conflict winner)   │
  │                               │
  │  Re-apply user's changed      │
  │  fields onto server version   │
  │  → retry PUT rev="xyz789"     │
  │ ─────────────────────────────>│  hash(store) == "xyz789"? ✓
  │ <─────────────────────────────│  200 {rev: "def456", ...}
```

If the retry also 409s (extremely rare double-conflict), the server version
wins and a long-duration toast tells the user to re-apply manually.

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
  - Debounced 800ms after each local edit → `client.saveProject()` → on 200: update cache + bump version; on 409: **3-way merge** (see below) + retry
- `reapplyLocalEdits(base, local, server)` — pure function in `reapply.ts`, tested with 11 cases
- `useCompositionVersion` — Zustand store; StageCanvas appends `?v=N` to the HF player `src`
- **Only the HF player's iframe reloads — not the page.** When `compositionVersion` bumps, the `src` attribute on `<hyperframes-player>` changes, triggering the player's `attributeChangedCallback("src")` which sets `iframe.src` internally. The React SPA, all panels, the timeline, edit state, and undo/redo stacks stay mounted and intact. Only the 1920×1080 preview iframe inside the player's Shadow DOM refreshes to fetch the re-stamped composition.

## 3-way merge on 409 conflict

When a PUT returns 409, the user's edits are **rebased** onto the server's
version instead of being discarded. This prevents data loss — a user typing
a long paragraph never loses it to a concurrent edit.

```
base   = last known server state (captured at GET / PUT-success / SSE refetch)
local  = user's edited version (in TanStack cache, including unsaved edits)
server = server's current version (from the 409 response body)
```

`reapplyLocalEdits(base, local, server)` works at the **field level**:

| What changed locally | How it's re-applied |
|---|---|
| Slide field (`title`, `body`, …) | If `base[field] !== local[field]`, overwrite `server[field]` |
| Slide HTML | If `base.html[id] !== local.html[id]`, overwrite `server.html[id]` |
| Duration / voiceover / assets / transition | Same per-field diff |
| Slide add | Copy entire slide into server version |
| Slide remove | Delete from server version + root.slides |
| Slide reorder | Overwrite `server.root.slides` with local ordering |
| Theme / audio / transition_default | Deep-compare base vs local, overwrite if different |

When both sides edit the **same field**, the user's version wins
(last-write-wins on the retry PUT).

## Why not WebSocket?

SSE is unidirectional (server → client), which is all we need for push
notifications. It's simpler, works through proxies, and auto-reconnects.
The client → server path uses normal HTTP PUT.

## Disk + file watcher

The store is disk-backed (`project.json` on disk + write-through cache).
A `watchdog` file watcher monitors `OVK_DATA_DIR` — when an external
process (AI agent, manual edit) modifies `project.json`, the watcher
reloads it into the cache and broadcasts SSE. Clients see the change
in real time without polling.

Writes are coordinated with `fcntl.flock` (advisory exclusive lock on
`project.lock`) so two processes can't interleave a read-rev-check with
a write. See [api.md](./api.md) § Disk-backed store for details.
