# AI Subsystem — Implementation Spec

| | |
|---|---|
| **Status** | Implementation contract for the `ai` branch |
| **Scope** | What ships in `src/openvideokit/ai/` + the minimal ovk-web wiring |
| **Related** | [RFC 0002 — AI Subsystem](./rfc/0002-ai-subsystem.md) (product north-star, amended alongside this doc) |
| **Workflow** | This doc was written **first** (Phase 1); Phase 2 implements; Phase 3 reconciles drift. |

---

## 1. Architectural Principle

> **The backend LangGraph agent is a read-only explorer + EditOp-proposal emitter. It never writes the project document. Every mutation it wants becomes an `EditOp` — the exact same shape as `ovk-web/src/shared/edit/ops.ts` — streamed as a `proposal` over SSE. The frontend `AIDock` reuses its existing `handleAccept` path (`ovk-web/src/features/ai/AIDock.tsx:190`) and dispatches through `EditBus` on Accept.**

### Why this shape

- **Undo/redo lives in the frontend.** `EditBus` + `inverseOp` + `useUndoRedo` are the undo mechanism. The backend `store.update_project` has *no* undo — only rev-based optimistic locking. A backend that writes the document directly would bypass EditBus and break undo. Routing AI through the same `EditOp`s the frontend already dispatches preserves undo, the `lintHtml` gates, and SSE sync with **zero** changes to the existing mutation pipeline.
- **"AI flow ≈ human flow" becomes literally true.** Both are `EditOp` producers consumed by the same `EditBus`. The `AIDock` already does this with `EchoProvider` today (`AIDock.tsx:132` → `dispatch(op, "ai:echo")` at `:199`). We swap the keyword mock for a real agent behind the identical stream contract.
- **This is why we drop generic `write_file`/`edit_file`.** Raw writes are a backdoor around EditBus and would corrupt the undo stack. The agent gets *read-only* filesystem tools to understand the project, plus *semantic* OVK tools that emit `EditOp`s.

### Relationship to RFC 0002

RFC 0002 §1/§2.1 say "runs entirely on the client (browser, OS keychain)". This implementation runs inference in the **local Python server** — still local, still BYO key, still $0 to any cloud, no control-plane proxying (and §7's own diagram already says *"AI client (Python, in the local app)"*). Spirit-compatible; the RFC wording is amended in Phase 1 to match.

---

## 2. Module Layout

```
src/openvideokit/ai/
├── __init__.py
├── config.py              # env: OPENAI_BASE_URL, OPENAI_API_KEY, OVK_AI_MODEL, OVK_AI_TIER2_MODEL, temp, max-steps
├── llm.py                 # ChatOpenAI(base_url=..., api_key=...) factories — tier1 + tier2 (OpenAI-compatible)
├── ops.py                 # EditOp types + creators — faithful Python mirror of ovk-web ops.ts/EditBus.ts
├── events.py              # AIStreamEvent (token/proposal/tool_start/tool_end/done/error) + SSE line serialization
├── context.py             # OVKContext: project_id, project snapshot, active_slide_id, pins
├── graph.py               # create_react_agent(model, build_tools(ctx)) + state wiring
├── server.py              # run_agent(messages, ctx) -> AsyncIterator[AIStreamEvent]
│
├── prompts/
│   ├── __init__.py        # build_system_prompt(ctx) -> str ; assembles sections in fixed order
│   ├── role.py            # SECTION: identity, capabilities, tone
│   ├── model.py           # SECTION: the document model (root/slides/fields/voiceover/captions/assets)
│   ├── tools.py           # render(ctx): auto-generated from the tool registry (name + docstring) — zero drift
│   ├── caption_rules.py   # SECTION: CRITICAL caption rules
│   ├── html_contract.py   # SECTION: bare-<template> R1–R4 contract
│   ├── voice_rules.py     # SECTION: Neural voice ids + TTS-at-proposal-time coupling
│   ├── safety.py          # SECTION: prompt-injection data-wrapping, always-propose-never-apply
│   └── project_context.py # render(ctx): DYNAMIC — current snapshot (slide list, fields, active slide, pins)
│
└── tools/
    ├── __init__.py        # build_tools(ctx) -> list[BaseTool]; assembles read + OVK tools with ctx bound
    ├── _registry.py       # OvkTool base class; tool metadata (name/doc/kind) consumed by prompts/tools.py
    ├── _lint.py           # bare-<template> HTML lint — port of ovk-web lintHtml.ts R1–R4
    ├── _voicelist.py      # known Neural voice ids
    │
    │  ── read-only filesystem tools (agent explores; never mutate) ──
    ├── read_file.py       # read slide index.json / index.html / audio.json / project.json
    ├── list_slides.py     # slide ids + durations + field keys + has-voiceover flag
    ├── list_files.py      # ls a slide folder / assets dir
    ├── grep_slides.py     # regex search across slide files
    │
    │  ── OVK EditOp emitters (mirror PropertiesPanel / CaptionLayer / ops.ts) ──
    ├── set_field.py            # → setField
    ├── set_voiceover.py        # → setVoiceover + setDuration (runs TTS server-side; see §6)
    ├── set_duration.py         # → setDuration
    ├── add_slide.py            # → addSlide (+ optional html, lint-gated)
    ├── remove_slide.py         # → removeSlide
    ├── duplicate_slide.py      # → duplicateSlide
    ├── reorder_slides.py       # → reorderSlides ("organize slides")
    ├── set_slide_html.py       # → setSlideHtml (Tier-2; runs _lint)
    ├── set_caption_style.py    # → setCaptionStyle
    └── set_caption_settings.py # → setCaptionSettings (CaptionLayer parity)
```

Wiring (small additions to existing files):
- `routes.py`: `POST /api/projects/{project_id}/ai/chat` → SSE stream.
- `app.py` lifespan: nothing new (agent is stateless per-request; no new threads/executors).
- `pyproject.toml`: add `langchain`, `langchain-core`, `langchain-openai`, `langgraph`.

---

## 3. Tool Catalog

### 3.1 Read-only filesystem tools (4)

| Tool | Args | Returns | Notes |
|---|---|---|---|
| `read_file` | `path` (e.g. `"slide-0/index.json"`, `"project.json"`, `"slide-1/index.html"`, `"slide-0/audio.json"`) | file contents | Sandbox: reject paths escaping the project dir (`..`, absolute). |
| `list_slides` | — | `[{id, duration, fields:[...], has_voiceover, has_html}]` | Derived from the project snapshot. |
| `list_files` | `slide_id?` | file list | `slide_id` omitted → project root; else the slide folder. |
| `grep_slides` | `pattern`, `slide_id?` | `[{file, line, match}]` | Regex over slide `.json`/`.html` files. |

### 3.2 OVK EditOp-emitter tools (10)

Each returns a typed `EditOpResult`. The graph's tool execution wrapper appends the op to the streamed proposals. The op JSON mirrors the frontend `EditOp` union exactly. Safety gates run **inside** the tool (before emitting), so a failed gate returns a tool error the agent sees — no proposal is emitted.

| Tool | Args | EditOp emitted | Safety gate |
|---|---|---|---|
| `set_field` | `slide_id`, `field_id`, `value` | `setField` | slide_id exists; field_id non-empty. |
| `set_voiceover` | `slide_id`, `text`, `voice?`, `rate?`, `pitch?`, `volume?` | `setVoiceover` + `setDuration` | voice ends in `Neural`; **runs TTS** (§6). |
| `set_duration` | `slide_id`, `duration` | `setDuration` | duration > 0. |
| `add_slide` | `after_id?`, `layout_id`, `html?`, `fields?` | `addSlide` (+ `setSlideHtml` if html) | if html → `_lint` must pass. |
| `remove_slide` | `slide_id` | `removeSlide` | slide exists; refuse if it's the last slide. |
| `duplicate_slide` | `slide_id` | `duplicateSlide` | slide exists. |
| `reorder_slides` | `order: [slide_id]` | `reorderSlides` | must be a permutation of current ids. |
| `set_slide_html` | `slide_id`, `html` | `setSlideHtml` | `_lint` R1–R4 must pass (Tier-2). |
| `set_caption_style` | `style` | `setCaptionStyle` | style in known set (`highlight`/`neon`/`editorial`/`eco-green`). |
| `set_caption_settings` | `settings` (partial) | `setCaptionSettings` | reject banned keys (`transform`/`scale`/`font-size`/`text-shadow` on active). |

`OVK_AI_TIER2_MODEL` is reserved for future per-tool model routing (a coding model for `set_slide_html`). In v1 with `create_react_agent` + a single model, the same model handles routing + Tier-2 authoring. (Recorded as v1 limitation in §15.)

---

## 4. Prompts Package

Modular `.py` (chosen over monolithic `system.py` and over RFC §8's markdown files for v1). Each module exports `SECTION: str` (static) or `render(ctx: OVKContext) -> str` (dynamic). `prompts/__init__.py` composes them in a fixed order. Each concern is isolated and independently testable; `tools.py` is **generated from the registry** so the prompt never drifts from the actual tool set.

Order: `role → model → tools(→auto) → caption_rules → html_contract → voice_rules → safety → project_context(→dynamic)`.

RFC §8's "editable markdown workspace files" is **deferred** — v1 uses `.py` prompt modules. RFC §8 is amended in Phase 1 to record this decision + the future migration path.

---

## 5. langgraph Graph

`langchain.agents.create_agent` (the non-deprecated successor to
`langgraph.prebuilt.create_react_agent`) + a custom `build_tools(ctx)` factory.
> *Deviation note:* the original plan named `create_react_agent`; that factory
> is now deprecated by langgraph v1 in favor of `create_agent`, which is what
> shipped. Same ReAct loop, supported upstream.

- **Model**: `ChatOpenAI(base_url=OPENAI_BASE_URL, api_key=OPENAI_API_KEY, model=OVK_AI_MODEL, temperature=OVK_AI_TEMPERATURE, streaming=True)` from `llm.py`. OpenAI-compatible → works with OpenAI, OpenRouter, Ollama, vLLM, LM Studio by changing `OPENAI_BASE_URL`. This single surface covers RFC §7's two-path topology.
- **Default model**: `gpt-5.4-nano` (configurable via `OVK_AI_MODEL`).
- **Tools**: `build_tools(ctx)` returns the 14 tools (4 read + 10 OVK), each with `ctx` bound via closure so they can read the snapshot / run TTS without global state.
- **State**: the default ReAct state (`messages`). Tool results carry an `_ovk_ops` marker when they want to emit a proposal; `server.py`'s `_maybe_proposal` decodes it. No custom `StateGraph` channel needed in v1.
- **Streaming**: `server.py` uses langgraph's `astream_events(version="v2")` to capture (a) LLM token deltas → `token` events, (b) tool starts/ends → `tool_start`/`tool_end` events, (c) EditOp-returning tool results → `proposal` events. Loop bounded by `OVK_AI_MAX_STEPS`.

---

## 6. Voiceover–TTS Coupling

Decision: *"set text and TTS at the same time, because human can't save without generating anyway. But must approve."*

`set_voiceover(slide_id, text, voice?, ...)`:
1. Validate `voice` ends in `Neural` (mirrors the zod rule in ovk-web).
2. Call `voiceover.generate_audio(project_id, [{id, text, voice, ...}])` — the existing backend pipeline (`src/openvideokit/voiceover.py:136`). This writes content-addressed cache files (`audio-{hash}.mp3`, `audio-{hash}.json`) to the slide folder. These are **rev-neutral**: `compute_rev` (`store.py:159`) explicitly strips voiceover, and audio files are side-effect cache exactly like the human `/tts` flow (`routes.py:108`).
3. Emit a proposal carrying **two** ops: `setVoiceover` (new text/voice) + `setDuration` (measured audio length).
4. On **Accept** → frontend dispatches both through `EditBus`; on **Reject** → the orphan audio stays cached (content-addressed, reused harmlessly if the same text is ever approved later). Undo restores old text + old duration.

True AI = human parity: a human editing `CaptionTextEditor` triggers the debounced `useVoiceover` hook → `/tts` → duration update → `setVoiceover`/`setDuration` dispatch. The AI proposes the **same** ops.

TTS is slow (edge-tts network call + ffprobe) and blocks the agent step — acceptable per the explicit design decision.

---

## 7. SSE Contract

New route in `routes.py`:

```
POST /api/projects/{project_id}/ai/chat
Body: { messages: [{role, content}], activeSlideId: string|null, pins: ContextPin[] }
Response: text/event-stream
```

`AIStreamEvent` types (defined in `ai/events.py`, serialized as SSE `data:` lines):
- `{type:"token", text}` — LLM token delta.
- `{type:"tool_start", tool, args}` — tool invocation begins.
- `{type:"tool_end", tool, result}` — tool returned.
- `{type:"proposal", edit}` — a proposed edit. **`edit = {id, ops: EditOp[], rationale, slideId?}`** where each `op` is the exact camelCase JSON of the frontend `EditOp` union (`ovk-web/src/shared/edit/EditBus.ts`). The frontend dispatches each op through `EditBus` on Accept — identical to a human edit. This supersedes the old 3-tier `EditProposal` shape (which only fit field/voiceover patches + addSlide + HTML swap). Since `EchoProvider` (the only tier consumer) is removed in this work, the tier code path is retired.
- `{type:"done"}` — turn complete.
- `{type:"error", message}` — fatal error.

A single tool call may emit multiple ops in one proposal (e.g. `set_voiceover` emits `setVoiceover` + `setDuration`). The frontend `handleAccept` loops over `proposal.edit.ops` and dispatches each.

The agent runs **stateless per request** — the frontend sends full message history each turn (matches `EchoProvider.stream(messages, ctx)` signature).

---

## 8. Safety Gates (RFC §9)

| Gate | Where | Behavior |
|---|---|---|
| **Tier-2 HTML lint** | `set_slide_html` / `add_slide(html)` | Port of `lintHtml.ts` R1–R4 to `tools/_lint.py`: must be bare `<template>`, no `<html>/<body>`, contain `__OVK_SLIDE_ID__`, etc. Fail → tool error, no proposal. |
| **Voice validation** | `set_voiceover` | Voice id must end in `Neural`. |
| **Caption-settings validation** | `set_caption_settings` | Reject `transform`/`scale`/`font-size`/`text-shadow` on active (AGENTS.md CRITICAL RULES). |
| **Reorder permutation** | `reorder_slides` | Must be a permutation of current ids. |
| **Read sandbox** | `read_file`/`list_files` | Reject paths escaping the project dir. |
| **Prompt-injection** | `prompts/safety.py` | User content enters the prompt as *data* (delimited), not as instructions. |
| **Human review** | every proposal | "Always require Accept" = RFC §9 review gate. |
| **Schema validation + bounded retry** | *(deferred — §15)* | RFC §9 lists this; v1 relies on tool-arg validation + agent error feedback. |

---

## 9. Config (env)

All env vars are read from the process environment **and** from a root `.env`
file, which is auto-loaded at import time by `config.py` via `python-dotenv`
(`load_dotenv()` is a silent no-op if `.env` is absent — the server boots fine
either way; real env vars always win). See `/.env.example` for the full,
documented list; copy it to `/.env` (gitignored) and fill in `OPENAI_API_KEY`.

`ai/config.py`:

```python
OPENAI_BASE_URL    = os.environ.get("OPENAI_BASE_URL", "https://api.openai.com/v1")
OPENAI_API_KEY     = os.environ.get("OPENAI_API_KEY", "")        # required to use AI
OVK_AI_MODEL       = os.environ.get("OVK_AI_MODEL", "gpt-5.4-nano")
OVK_AI_TIER2_MODEL = os.environ.get("OVK_AI_TIER2_MODEL", OVK_AI_MODEL)
OVK_AI_TEMPERATURE = float(os.environ.get("OVK_AI_TEMPERATURE", "0.3"))
OVK_AI_MAX_STEPS   = int(os.environ.get("OVK_AI_MAX_STEPS", "8"))
```

Standard env names (`OPENAI_BASE_URL`/`OPENAI_API_KEY`) so any OpenAI-compatible endpoint works without custom config — OpenRouter, Ollama, vLLM, LM Studio.

---

## 10. Frontend Changes (minimal)

1. **New `HttpSseProvider`** in `ovk-web/src/features/ai/providers/HttpSseProvider.ts` — implements the `AIProvider` interface (`shared/ai/types.ts:39`); `stream()` POSTs to `/api/projects/{id}/ai/chat` and parses the SSE stream into `AIStreamEvent`s. Same signature as the old `EchoProvider.stream`.
2. **Simplify `AIDock.tsx` accept path.** Replace the hardcoded EchoProvider import + the tier-1/2/3 `handleAccept` branches with: provider yields `{type:"proposal", edit:{ops, rationale}}` → `handleAccept` loops `edit.ops` and dispatches each via `dispatch(op, "ai:langgraph")`. The `applyPatch`/tier code is retired alongside EchoProvider. `ProposalCard`/`DiffDigest` show an op-list digest (`kind` + target) instead of tier badges.
3. **Remove `echo`** (audit confirmed no test depends on it):
   - Delete `providers/EchoProvider.ts`.
   - Drop `"echo"` from `ProviderId` (`types.ts:12`), `createRegistry()` (`registry.ts:27`), `PROVIDER_LABELS` (`registry.ts:35`), settings picker (`settings.tsx:169`).
   - Default provider → `"http"`.
   - `inverseOp.test.ts:169` uses `"ai:echo"` only as sample actor *string data* (not an import) — renamed to `"ai:langgraph"`.
4. No changes to `EditBus`, `ops.ts`, `inverseOp` — all reused. The dead tier/mock code (`applyPatch.ts`, `applyPatch.test.ts`, `scenarios.ts`) was **removed** outright (not kept) — the 3-tier proposal contract it served is retired, so keeping it would be unmaintained dead weight. `inverseOp.test.ts`'s `"ai:echo"` actor string was renamed to `"ai:langgraph"`.

### Echo audit (verified)

- `grep EchoProvider *.test.*` → **0 imports**. No test exercises it.
- `applyPatch.test.ts` tests the pure `translatePatch` function.
- `inverseOp.test.ts:169` uses `"ai:echo"` only as a string literal for `actor`.
- Only runtime references: `AIDock.tsx:132` (hardcoded import), `registry.ts`, `AIProviderContext.tsx` (fallback), `settings.tsx` (picker).

---

## 11. Explicitly Dropped

| Dropped | Reason |
|---|---|
| Generic `write_file` / `edit_file` tools | Backdoor around EditBus → breaks undo. |
| Backend undo log | Would duplicate frontend `inverseOp` and desync the frontend history stack. |
| New EditProposal tiers | Reuse the 3 the frontend already handles. |
| AI in render hot path | RFC non-goal. |
| RFC §8 markdown prompt files (v1) | Deferred; `.py` prompt modules chosen instead. |

---

## 12. Dependencies

`pyproject.toml [project].dependencies` additions:
- `langchain>=0.3`
- `langchain-core>=0.3`
- `langchain-openai>=0.3` (provides `ChatOpenAI` with `base_url`)
- `langgraph>=0.4` (provides `create_react_agent`)

No new frontend deps — `fetch` + `ReadableStream` cover SSE.

---

## 13. Testing

Tests live in `tests/ai/` (pytest; mirrors the existing `tests/test_*.py` convention). The guiding rule: **pure logic is tested without an LLM and without network**. The only places that touch an LLM or edge-tts are isolated and mocked.

### 13.1 Test files

| File | Scope | LLM? | TTS? |
|---|---|---|---|
| `test_ops.py` | Every `EditOp` creator returns the exact JSON shape the frontend `ops.ts`/`EditBus.ts` union expects; parity asserts against the TS source. | no | no |
| `test_events.py` | `AIStreamEvent` → SSE `data:` line serialization + round-trip parse; tier-1/2/3 proposal payloads survive the wire. | no | no |
| `test_lint.py` | Port of `ovk-web/src/shared/lib/lintHtml.test.ts` (R1–R5): zero/two templates, `<html>`/`<body>` wrapper, missing `data-composition-id`, Tailwind CDN/`@apply`, unknown `__OVK_*__` tokens, the `__OVK_CUSTOM_*__` escape hatch. | no | no |
| `test_voicelist.py` | Voice id validation: `Neural` suffix required; known ids accepted; legacy ids (`vi-VN-HoaiMy`) rejected. | no | no |
| `test_prompts.py` | Each section module renders a non-empty string; `build_system_prompt(ctx)` contains all 8 section markers; `tools.py` section is generated from the registry (add a dummy tool → it appears in the prompt); dynamic `project_context` includes the active slide. | no | no |
| `test_tools_read.py` | Read-only tools against a `tmp_path` fixture project: `read_file` happy path + sandbox escape rejection (`../x`, absolute paths); `list_slides` field keys + has-voiceover flag; `list_files` root vs slide; `grep_slides` returns `file:line:match`. | no | no |
| `test_tools_ovk.py` | Each of the 9 non-voiceover OVK tools: gate **rejects** bad input (unknown slide, non-permutation reorder, banned caption key, duration ≤ 0, last-slide removal) and **emits** the correct `EditOp` JSON on good input. `set_slide_html` rejects lint-failing HTML. No LLM, no TTS. | no | no |
| `test_tools_voiceover.py` | `set_voiceover` with `voiceover.generate_audio` **monkeypatched** to a fake that writes a stub mp3 + returns a fixed duration: validates `Neural` voice, emits BOTH `setVoiceover` + `setDuration`, leaves a rev-neutral cache file. | no | mocked |
| `test_graph.py` | `build_tools(ctx)` returns 14 tools; the compiled graph builds without calling the API; tool names/docstrings match the registry. | no | no |
| `test_server.py` | End-to-end agent run with a **FakeListChatModel** (langchain) scripted to emit one tool call (`set_field slide-0 title Hello`); assert the streamed events are `tool_start` → `tool_end` → `proposal(setField)` → `done`, in order, no real API call. A second case scripts a multi-step run (read → propose). | fake | no |
| `test_route.py` | FastAPI `TestClient` against the `/api/projects/{id}/ai/chat` route with the agent monkeypatched to a fake async generator: asserts `text/event-stream` content-type, SSE framing, and that a missing `OPENAI_API_KEY` yields a graceful `error` event (not a crash). | fake | no |

### 13.2 Frontend tests

- `features/ai/providers/HttpSseProvider.test.ts` — feeds a synthetic `ReadableStream` of SSE bytes and asserts the provider yields the right `AIStreamEvent` sequence (`token` → `proposal` → `done`).
- Existing `applyPatch.test.ts`, `inverseOp.test.ts` (after the `"ai:echo"` → `"ai:http"` rename), `lintHtml.test.ts` remain green.

### 13.3 Verification commands

| Layer | Command |
|---|---|
| Python tests | `uv run pytest tests/ai -v` |
| Python lint | `uv run ruff check --fix src tests` |
| Frontend tests | `pnpm test` (in `ovk-web/`) |
| Frontend lint | `pnpm exec biome check --write` (in `ovk-web/`) |
| Smoke (backend) | start server, `curl -N -X POST /api/projects/proj-1/ai/chat -d '{"messages":[{"role":"user","content":"change slide-0 title to Hello"}],"activeSlideId":"slide-0","pins":[]}'` → expect `token` + `proposal` (setField) + `done`. |
| Smoke (e2e) | In AIDock: "change the title to be punchier" → ProposalCard → Accept → title updates → ⌘Z reverts. |

### 13.4 Conventions

- pytest classes `Test*` + methods `test_*` (matches `tests/test_store.py`).
- `tmp_path` + `monkeypatch` for filesystem/network isolation (matches `fresh_store` fixture).
- No test ever calls a real LLM or real edge-tts. `monkeypatch.setattr(voiceover, "generate_audio", fake)` for the TTS path; `FakeListChatModel` for the agent loop.
- Op-shape parity with the frontend is asserted by literal dict comparison against the `EditOp` union in `ovk-web/src/shared/edit/EditBus.ts` — drift is a test failure.

---

## 14. Phased Execution

### Phase 1 — Documentation
1. Write this doc (`docs/ai.md`).
2. Amend `docs/rfc/0002-ai-subsystem.md` (§1/§2.1/§7/§8/§15).

### Phase 2 — Implement
1. `pyproject.toml` deps; `uv sync`.
2. `ai/config.py`, `ops.py`, `events.py`, `context.py`, `llm.py`.
3. `ai/prompts/*.py` (8 section modules + assembler).
4. `ai/tools/` (registry + lint + voicelist + 4 read + 10 OVK tools).
5. `ai/graph.py` + `ai/server.py`.
6. `routes.py`: `POST /api/projects/{id}/ai/chat`.
7. ovk-web: `HttpSseProvider`, repoint `AIDock`, remove `echo`.
8. Tests (§13) written alongside each module — pure modules get unit tests immediately; the agent loop gets `test_server.py` with `FakeListChatModel`.
9. Verify (§13.3).

### Phase 3 — Review
Reconcile this doc against shipped code; record deviations.

---

## 15. Open Items (not v1)

- Schema-validation + bounded retry (RFC §9) — v1 relies on tool-arg validation + agent error feedback.
- Per-tool model routing (tier-2 model only for `set_slide_html`) — `OVK_AI_TIER2_MODEL` reserved.
- RFC §8 markdown prompt files migration.
- "Auto-apply" session mode (currently always-Approve).
- A standalone `regenerate_audio` tool (currently TTS only fires via `set_voiceover`).
