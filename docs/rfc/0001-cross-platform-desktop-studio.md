# RFC 0001 — OpenVideoKit Cross-Platform Desktop Studio

| | |
|---|---|
| **Status** | Draft — awaiting decision on open questions in §11 |
| **Author** | OpenVideoKit team |
| **Date** | 2026-06-25 |
| **Supersedes** | Current Python/FastAPI web app (`src/openvideokit/`) |
| **Discussion** | `docs/rfc/` |

---

## 1. Summary

OpenVideoKit becomes a **cross-platform, AI-powered desktop motion graphics
studio** built on [Tauri 2](https://tauri.app) + [HyperFrames](https://hyperframes.heygen.com).
A Go cloud control-plane handles identity, project metadata, and asset
vaulting on S3. The desktop client sandboxes each project locally, exposes
two editing surfaces (a no-code **form editor** and an embedded **AI terminal
dock** running coding agents such as Claude Code / OpenCode / Gemini CLI),
and renders deterministic MP4s on-device via `npx hyperframes render`.

This is a **full replacement** of the current local-only web app. The Python
service is retired once feature parity is reached (see §9).

---

## 2. Motivation

The current OpenVideoKit is a single-process FastAPI app served on
`localhost:8765`. It works for local prototyping but cannot support:

- **Multi-user identity and project ownership** — there is no auth, no
  accounts, no per-user state.
- **Large, vaulted asset libraries** — assets live next to templates; there
  is no durable, deduplicated, CDN-backed storage.
- **Power-user editing** — the only surface is a generated HTML form. There
  is no path for an AI agent (or a developer) to edit raw template files in
  a tight feedback loop.
- **Native distribution** — users must `uv sync`, run a server, and open a
  browser tab. There is no signed `.msi` / `.dmg` / `.deb`.

The desktop studio resolves all four, while preserving the project's core
strength: a **deterministic, local render** through HyperFrames + headless
Chromium + FFmpeg. No LLM is in the render hot path; AI is purely an editing
affordance.

---

## 3. Goals & Non-Goals

### Goals

1. Ship signed installers for Windows, macOS (Intel + Apple Silicon), and
   Linux from a single GitHub Actions release pipeline.
2. Cloud-required SaaS identity (OAuth2 / JWT) and project sync.
3. S3-backed asset vault with presigned-URL handshakes; client-side binary
   caching to minimize egress.
4. Two toggleable editing surfaces over the **same** workspace: a form
   editor (no-code) and an embedded AI terminal dock (pro-code).
5. On-device rendering via the existing HyperFrames engine, unchanged in
   semantics.
6. A render progress listener that parses HyperFrames stdout and drives a
   UI progress bar.

### Non-Goals (this RFC)

- Mobile / web client. Desktop only for v1.
- An LLM-based render pipeline. Determinism is non-negotiable.
- Replacing HyperFrames with a custom composition runtime.
- A marketplace / template store. Cloud stores *your* projects and assets,
  not a public catalog.
- Offline mode. Per §4 strategy, login and cloud sync are required.

---

## 4. Product Concept & Strategy

A **Cross-Platform AI-Powered Desktop Motion Graphics Studio** that lets
users orchestrate, refine, and generate high-fidelity videos from dynamic
HTML templates.

### Hybrid compute split

| Layer | Runs where | Why |
|---|---|---|
| Auth, project metadata, asset catalog, presigned URLs | **Cloud (Go)** | Central source of truth; shareable across devices; cheap to scale |
| Frame scrubbing, AI agent file edits, video compilation | **Client (Tauri)** | Latency-sensitive, CPU-heavy, benefits from local GPU/disk; keeps render deterministic and private |
| Composition engine | **HyperFrames (Node, local)** | Unchanged from today; `npx hyperframes render` is the single render entrypoint |

Cloud is **required** (login + sync on every launch), but heavy work stays
on-device. The cloud never sees raw frames.

### Editing surfaces

Both surfaces operate on the **same workspace directory**; toggling is
instant and lossless.

- **Form editor** — schema-driven, generated from the template's
  `template.json` `fields`. Targets non-technical users. Preserves the
  current slide-editor model (`mode: "slide-editor"`, layout
  sub-compositions, `__PLACEHOLDER__` stamping).
- **AI terminal dock** — an `xterm.js` panel backed by a Rust PTY
  (`portable-pty`) that spawns a coding agent (`claude`, `opencode`,
  `gemini`) with its working directory pinned to the workspace. Targets
  power users and developers.

---

## 5. High-Level Architecture

```
                ┌──────────────────────────────────────────┐
                │           GO CONTROL PLANE (cloud)        │
                │  OAuth2/JWT · Project DB · Asset catalog  │
                │  S3 presigned URL issuer · CORS guardrail │
                └────────────────────┬─────────────────────┘
                                     │ HTTPS (JSON + presigned URLs)
                                     ▼
┌────────────────────────────────────────────────────────────────────┐
│                   TAURI 2 DESKTOP CLIENT (Rust)                    │
│                                                                    │
│  ┌──────────────┐   ┌──────────────┐   ┌────────────────────────┐  │
│  │ Workspace    │   │ Binary cache │   │ Render dispatcher       │  │
│  │ sandbox mgr  │   │ (hash-keyed) │   │ std::process::Command   │  │
│  └──────┬───────┘   └──────┬───────┘   └──────────┬─────────────┘  │
│         │                  │                      │                │
│         ▼                  ▼                      ▼                │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │                  Local workspace (per project)              │ │
│  │   index.html · compositions/ · assets/ · template.json      │ │
│  └──────────────────────────────────────────────────────────────┘ │
│         │                                           │              │
│         │ form editor (webview)                     │ AI terminal   │
│         │                                           │ dock (xterm)  │
│         │                                           │  via PTY      │
│         ▼                                           ▼              │
│  ┌────────────────┐                       ┌──────────────────────┐ │
│  │ HyperFrames    │  ◄─── same engine ─── │ coding agent         │ │
│  │ <player>       │                        │ (claude/opencode/…)  │ │
│  │ live preview   │                        │ edits raw files      │ │
│  └────────────────┘                        └──────────────────────┘ │
│         │                                                           │
│         ▼  (user clicks "Compile")                                  │
│  ┌──────────────────────────────────────────────────────────────┐ │
│  │  npx hyperframes render <workspace> --output scene.mp4        │ │
│  │  headless Chromium → frame stream → FFmpeg → byte-identical   │ │
│  │  stdout parsed by Rust sidecar → Tauri event → progress bar   │ │
│  └──────────────────────────────────────────────────────────────┘ │
└────────────────────────────────────────────────────────────────────┘
```

### Request / data flow

1. Launch → Tauri forces login → Go mints a JWT.
2. User opens a project → Go returns a **scene manifest**: a JSON tree of
   composition files plus presigned GET URLs for every asset.
3. Tauri's workspace engine materializes a local directory, consulting the
   binary cache by SHA-256 and downloading only misses.
4. User edits via form **or** AI dock. Both mutate files on disk.
5. User clicks **Compile** → Rust dispatcher runs `npx hyperframes render`
   against the workspace, streaming stdout to the UI.
6. On success, the resulting MP4 is offered for preview and (optionally)
   uploaded to S3 for redownload from other devices.

---

## 6. Component Deep Dive

### 6.1 Cloud control plane (Go)

| Concern | Choice |
|---|---|
| API framework | `net/http` with `chi` router (or `echo`) — small, idiomatic, fast |
| Auth | OAuth2 (Google/GitHub) → JWT access + refresh tokens |
| DB | Postgres (projects, users, asset manifest, render-job metadata) |
| Object storage | Amazon S3; assets keyed `projects/<pid>/assets/<sha256>` |
| Secret handling | Presigned URLs (15-min TTL); raw bucket never exposed |
| CORS | S3 bucket policy permits `GET`, `HEAD` from `*` origins so the local headless-Chromium fetch loop can stream media |

#### Endpoint sketch

```
POST /auth/oauth/{provider}/callback   → { access_jwt, refresh_jwt }
POST /auth/refresh                     → { access_jwt }

GET  /projects                         → list
POST /projects                         → { id, name }
GET  /projects/{id}/manifest           → scene manifest (JSON + presigned URLs)
POST /projects/{id}/assets/presign     → { upload_url }   (PUT from client)

GET  /templates                        → catalog of starter templates
POST /renders                          → { job_id }       (metadata only; render runs client-side)
```

The `/manifest` response is the contract between Go and the Tauri client.
It must be versioned (`manifest_version: 1`).

> **Asset intelligence** — search, semantic/vector retrieval, the ingestion
> pipeline, and Redis (Streams + cache) — are out of scope for this RFC and
> covered in **[RFC 0002 — Asset Intelligence](./0002-asset-intelligence.md)**.
> The Go control-plane's dependency stack stages from `Postgres + S3` (v1,
> metadata-only search) to `Postgres + S3 + Milvus + Redis + Python CLIP
> sidecar` (vision, semantic search at scale).

#### Why Go (decision record)

Firm choice. Go gives a single statically-linked binary, a strong standard
library for HTTP + crypto + S3 SDK (`aws-sdk-go-v2`), first-class
concurrency for fan-out (presigning many assets in parallel), and low
operational overhead vs. running a Python service in production. The
existing FastAPI code is **not** lifted — templating/stamping moves into
the Tauri client (Rust + JS) where it belongs, because stamping now runs
on the user's machine against the local workspace.

### 6.2 Desktop client shell (Tauri 2 / Rust)

| Concern | Choice |
|---|---|
| Shell | Tauri 2 (Rust core, system webview) |
| Workspace root | `AppData/Local/OpenVideoKit/workspaces/` (Win), `~/Library/Caches/OpenVideoKit/workspaces/` (mac), `~/.cache/openvideokit/workspaces/` (linux) |
| Sandbox | One directory per project; treated as disposable; rebuildable from manifest |
| Binary cache | `cache/<sha256>` keyed by asset hash; manifest consults it before download |
| Process exec | `std::process::Command` for `npx hyperframes`; `portable-pty` for the AI dock |
| IPC | Tauri commands + events (e.g. `render://progress`) |

#### Binary cache contract

For every asset in the manifest:

```
if exists(cache/<sha256>)  → hardlink/copy into workspace/assets/
else                       → GET presigned URL → write to cache → link
```

Cache is content-addressed, so the same 4K backdrop shared across N
projects downloads once.

#### Workspace layout (unchanged from current model)

```
workspaces/<project-id>/
├── index.html              ← root shell (audio + slide host divs + markers)
├── template.json           ← slide-editor config
├── compositions/           ← sub-comp HTML files (data-composition-src targets)
├── assets/                 ← images, audio, fonts (some from cache)
└── .ovk/                   ← manifest cache, render history
```

This deliberately matches today's `sessions/<uuid>/` shape so the
`_stamp_slides()` / `<!-- SLIDES_HERE -->` marker contract from
`AGENTS.md` carries over unchanged.

### 6.3 Editing surfaces

#### Form editor (no-code)

- Generated from `template.json` `fields` (types: `text`, `image`,
  `voiceover`) — same schema as today.
- On submit, runs the **stamping pipeline** in-process (Rust or a JS worker
  inside the webview): `__FIELD_ID__` placeholder replacement, image byte
  swap into `assets/`, voiceover slot collection → TTS → concat.
- All caption-styling rules in `AGENTS.md` (no `transform`/`scale`/`font-size`
  on `.word--active`; GSAP direct color tweens; bare `<template>` layouts)
  remain authoritative.

#### AI terminal dock (pro-code)

- UI: `xterm.js` with a theme that matches the editor.
- Backend: Rust spawns a PTY via `portable-pty`, pinned to the workspace
  directory, running one of: `claude`, `opencode`, `gemini` (user-configurable,
  must exist on `PATH`).
- The agent reads the workspace, edits raw `index.html` / CSS / GSAP,
  saves files. The form editor reads back from disk on focus, so the two
  surfaces stay consistent.
- **Security**: the PTY inherits only the workspace cwd; the agent never
  gets credentials (JWTs live in the Rust core's secret store, never on
  `env`).

#### Mode toggle

Single segmented control in the toolbar: **Form | Terminal**. Switching
flushes the inactive surface to disk first. Both surfaces can be torn off
into a split view.

### 6.4 Deterministic render stack (HyperFrames)

Unchanged engine, new orchestration.

```
npx hyperframes render <workspace> --output scene.mp4 [--workers N]
```

- Spawned by the Rust dispatcher as a child process.
- Headless Chromium walks the composition DOM, captures frames, pipes them
  to FFmpeg → byte-identical MP4 (same determinism guarantee as today).
- A **progress sidecar** reads the child's stdout line-by-line, parses
  HyperFrames' progress markers, and emits Tauri events:

  ```rust
  app.emit("render://progress", Progress { frame, total, pct });
  app.emit("render://log", line);
  app.emit("render://done", path);
  ```

  The webview subscribes and renders a progress bar + live log panel.
  (Marker format to be confirmed against HyperFrames' actual stdout — see
  open question Q3.)

### 6.5 CI/CD (GitHub Actions)

`.github/workflows/release.yml` builds all three targets off a tag.

| Runner | Output | Notable steps |
|---|---|---|
| `windows-latest` | `.msi` (WiX) | `choco install ffmpeg` pre-step; bundle Node runtime for `npx` |
| `macos-13` + `macos-14` | `.dmg` (universal) | Apple Developer ID code-sign + notarize; sign & ship both arches |
| `ubuntu-22.04` | `.deb` + `.AppImage` | `apt install libgtk-3-0 libwebkit2gtk-4.1` build deps |

Cross-cutting:

- Secrets via GitHub Actions OIDC → S3 / signing certs (no long-lived keys).
- Tauri's `tauri-action` drives the matrix.
- Smoke test each artifact: launch headless, run a 1-frame render, assert
  exit 0.

---

## 7. End-to-End Compilation Workflow

1. **Authenticate** — Tauri opens the OAuth flow in a system browser; Go
   returns a JWT stored in the OS keychain.
2. **Open project** — Go returns the scene manifest with presigned asset
   URLs.
3. **Initialize workspace** — Tauri resolves the binary cache, downloads
   misses, stamps a fresh `index.html` from the project's template.
4. **Edit** — User toggles to Form or Terminal. AI agent (if used) modifies
   raw files; form editor (if used) re-stamps placeholders.
5. **Preview** — `<hyperframes-player>` live-scrubs the workspace in the
   webview.
6. **Compile** — Rust dispatcher runs `npx hyperframes render`; progress
   streams to the UI; the MP4 lands in
   `workspaces/<project-id>/renders/<job-id>.mp4`.
7. **Publish (optional)** — MP4 uploaded to S3 via a presigned `PUT`,
   registered in Go's render-job table for cross-device redownload.

---

## 8. Data Model (cloud)

```
users(id, email, oauth_subject, created_at)
projects(id, owner_id, name, template_id, created_at, updated_at)
project_assets(id, project_id, sha256, kind, size_bytes, created_at)
render_jobs(id, project_id, sha256_mp4, duration_s, status, created_at)
sessions(id, user_id, refresh_token_hash, expires_at)
```

The scene **manifest** is a derived projection of `projects` +
`project_assets`, not a separate table.

---

## 9. Migration Path

The Python service is retired in three phases.

| Phase | Scope | Exit criterion |
|---|---|---|
| **P0 — Parity shell** | Tauri client boots, logs in, opens a project, renders via HyperFrames. Form editor only. | A user can produce the same MP4 the web app produces today. |
| **P1 — Cloud + cache** | Go control-plane live; S3 vaulting; binary cache; cross-device redownload. | Web app's `/render` + `/download` fully replaced. |
| **P2 — AI dock + dual surface** | PTY bridge, `xterm.js` panel, agent integration, progress listener. | Both surfaces stable; Python repo archived. |

Templates themselves do **not** migrate — they are reused verbatim. The
`templates/<id>/` directory format (bare `<template>` layouts,
`__PLACEHOLDER__` convention, `template.json` schema) is the stable
contract across the rewrite.

---

## 10. Animation Framework (decision)

Recommendation: **GSAP + vanilla CSS**, matching today's templates and the
HyperFrames runtime. Do **not** introduce Tailwind or a motion library into
composition files.

- HyperFrames drives GSAP timelines natively; the caption rules in
  `AGENTS.md` assume GSAP direct tweens.
- Tailwind is fine for the **app UI** (the Tauri webview shell) but
  forbidden inside `templates/<id>/` composition HTML — deterministic,
  reviewable template files should stay framework-light.
- This keeps the AI terminal dock's edits legible: a model that writes
  vanilla CSS + GSAP produces diffs a human can review.

---

## 11. Open Questions

| # | Question | Owner |
|---|---|---|
| Q1 | Go router choice — `chi` vs `echo` vs `std`? | backend |
| Q2 | Should the manifest be JSON or a signed JWT (to allow offline replay within token TTL)? | backend |
| Q3 | Exact HyperFrames stdout progress format — confirm with `npx hyperframes render --verbose` against a sample template before implementing the parser. | client |
| Q4 | macOS notarization identity — do we have an Apple Developer ID? | release |
| Q5 | Should the AI dock support multiple concurrent agents per workspace, or one at a time? | client |
| Q6 | Voiceover pipeline (edge-tts + ffprobe + ffmpeg concat) — port to Rust, or keep a Python sidecar? Today it's Python in `voiceover.py`. | client |
| Q7 | Telemetry / crash reporting vendor? | product |

Q6 is the largest porting decision: `voiceover.py` and `captions.py` are
non-trivial Python. Keeping them as a bundled Python sidecar (via
`pyinstaller`) is the low-risk path; rewriting in Rust is cleaner but
expensive.

---

## 12. Risks & Tradeoffs

| Risk | Mitigation |
|---|---|
| HyperFrames stdout format changes break the progress parser | Pin HyperFrames version; integration-test the parser in CI |
| Agent edits break the deterministic stamp contract | Add a workspace "lint" button that runs `npx hyperframes lint` before compile |
| Presigned URL TTL (15 min) too short for slow links | Make TTL configurable per-asset; cache aggressively |
| S3 egress cost on repeated large asset fetches | Content-addressed binary cache makes egress pay once per asset, ever |
| Code-signing cert complexity on all 3 OSes | Budget for Apple Developer ID + Windows EV cert up front; linux is self-signed via `.deb` repo |
| Cloud-required blocks offline work | **Accepted** tradeoff per strategy; document clearly in install UI |
| Two editing surfaces drift in capability | Both surfaces operate on the same files; surface parity tracked as an explicit test matrix |

---

## 13. Out of Scope (v1)

- Mobile and web clients.
- Real-time collaborative editing (multi-cursor).
- Public template marketplace.
- Server-side rendering farm (all renders stay on-device).
- LLM-driven frame generation.

---

## 14. References

- Current architecture: [`docs/architecture.md`](../architecture.md)
- Template & layout contract: [`AGENTS.md`](../../AGENTS.md) (caption rules,
  bare `<template>` format, `__PLACEHOLDER__` convention)
- HyperFrames CLI: https://hyperframes.heygen.com/packages/cli
- Tauri 2: https://tauri.app
- `portable-pty`: https://docs.rs/portable-pty
- `xterm.js`: https://xtermjs.org
