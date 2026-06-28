# RFC 0002 — AI Subsystem

| | |
|---|---|
| **Status** | Draft — awaiting decisions on open questions in §15 |
| **Author** | OpenVideoKit team |
| **Date** | 2026-06-28 |
| **Depends on** | [RFC 0001 — Product & Architecture](./0001-product-architecture.md) (document model, workspace, `SlideRenderer`) |
| **Discussion** | `docs/rfc/` |

---

## 1. Summary

OpenVideoKit's AI is a **staged, two-tier assistant that runs entirely on the
client**, behind the user's own API key. It is **free by default** and the
cloud control plane never participates in inference.

- **Tier 1 — Data/content (small model):** fills the project's `index.json`
  data layer over a curated template — storyboard, field values, voiceover
  scripts, caption tags, asset search queries, theme. This is the **cheap
  default path** that already produces a good video, with the slide HTML
  untouched.
- **Tier 2 — HTML/animation authoring (coding model):** optionally authors or
  refines a slide's `index.html` for polish, forking the file. This is where
  AI's *actual* advantage in this stack lives — writing rich GSAP/CSS.

Inference is **OpenRouter by default** (user's own key, preferring free
models), with **system-Ollama as an optional offline fallback**. Prompt
templates live as **files in the workspace** — versioned, editable, and
iterable by the AI itself.

### 1.1 The core design principle

> **JSON is data (Tier 1 fills it). HTML is animation (Tier 2 authors it).**

The two tiers map exactly onto the two file kinds in the document model
([RFC 0001 §5](./0001-product-architecture.md)). A small model is excellent at
structured-JSON data generation; a coding model is needed for HTML/GSAP. The
staged pipeline uses each where it's strong.

---

## 2. Motivation

A single-tier "small model does everything" approach fails in two directions:

- If the small model only fills JSON data, you throw away AI's biggest
  advantage in this stack — authoring rich HTML/CSS/GSAP animations.
- If you force the small model to write HTML/GSAP, it produces broken
  composition files (small models are poor at GSAP/CSS), breaking determinism
  and the [`AGENTS.md`](../../AGENTS.md) contract.

The two-tier staged model resolves both:

- **Curated templates make the small-model-only path produce high quality.**
  A good hand-crafted slide HTML + small-model-filled data is already a great
  video, cheap. This is what keeps the product's marginal cost near zero.
- **HTML authoring is an *optional escalation*, not a default.** The user (or
  AI) escalates a specific slide to Tier 2 only when the template's data slots
  are not enough. This preserves "minimal cost" while still fully unlocking
  AI's HTML advantage.

### 2.1 Why client-side only (decision record)

- **Security:** the user's API key never leaves their device (lives in the OS
  keychain / app config).
- **Cost:** the platform pays **$0** for inference — it proxies nothing.
- **Simplicity:** no AI orchestration service in the cloud control plane; the
  control plane (RFC 0001 §13) stays a content + search + billing backend.
- **OSS promise:** local/BYO-key AI is free forever, matching the stance in
  [RFC 0004](./0004-credits-and-billing.md).

---

## 3. Goals & Non-Goals

### Goals

1. Staged Tier-1-default / Tier-2-optional pipeline over curated templates.
2. BYO OpenRouter key; **prefer free models** so cost stays $0 by default.
3. System-Ollama as an optional offline fallback.
4. Prompt templates as **workspace files** (reviewable, iterable).
5. Safety gates: schema validation, AGENTS.md lint gate on HTML, hallucination
   review, prompt-injection sanitization.
6. **Zero inference in the cloud control plane.**

### Non-Goals

- A cloud-hosted, metered AI generation surface. (Removed from the billing
  model — see [RFC 0004](./0004-credits-and-billing.md).)
- Frontier-model-only "one prompt → whole video" auto-generation as a paid
  product surface (deferred).
- Metering of any local/BYO-key AI. Free forever.
- AI in the *render* hot path. AI produces data + slide HTML; the renderer
  stays deterministic.

---

## 4. The Staged Pipeline

```
1. Slide sourced from a curated template
   (hand-crafted index.html — already excellent)
        │
        │  Tier 1: small model  (~$0.003/video, or $0 via free models)
        ▼
2. Tier 1 fills index.json (fields, voiceover, captions, asset queries, theme)
   → preview stamps the template's HTML with new data
   → already a good video; slide HTML untouched
        │
        │  Tier 2: coding model  (OPTIONAL — only when the user wants more)
        ▼
3. Tier 2 authors/refines the slide's index.html (forks the file)
   → custom animation/layout beyond what the template's data slots allow
```

The two tiers are **sequenced by need**, not parallel. The default "generate a
video" flow runs Tier 1 only. Tier 2 is an explicit per-slide "customize HTML"
action.

---

## 5. Tier 1 — Data / Content (small model)

**Model class:** Gemma 3 9B–12B, Qwen 2.5 7B–14B, or similar small
instruction-tuned model. Prefer free OpenRouter variants (e.g.,
`google/gemma-3-27b-it:free`) so the default cost is $0.

**Operations** — all emit **JSON patches against `index.json` files** (root
and per-slide):

| Operation | Output |
|---|---|
| Storyboard | scene count + per-slide `layout_id` chosen from the template's `layouts` enum |
| Field values | per-slide `fields` (title, body, …) |
| Voiceover script | per-slide `voiceover.text` + `voice` |
| Caption / emphasis tags | per-slide caption metadata (which words highlight) |
| Asset queries | search-query **strings** → hit [RFC 0003](./0003-asset-intelligence.md) `/assets/search` → deterministic picks (the model never invents asset SHAs) |
| Theme selection | root `theme` (caption_style, colors, fonts) |

**Cost:** ~$0.003/video at Gemma 3 12B rates ($0.05/$0.15 per 1M tokens,
~15–30K tokens total). **$0** via free variants.

**Why the model only emits queries, not asset picks:** grounding. The asset
library is deterministic state (SHA-keyed); letting the model invent SHAs
hallucinates broken refs. The model emits *queries*; the library resolves
them. (See [RFC 0003](./0003-asset-intelligence.md).)

---

## 6. Tier 2 — HTML / Animation Authoring (coding model)

**Model class:** Qwen2.5-Coder, DeepSeek-Coder, Claude Haiku, or similar
coding-capable model. Required, because **9–12B models cannot reliably write
GSAP/CSS.** This is the "leverage AI's HTML advantage" surface.

**Operations** — edit a slide's `index.html` (the bare `<template>`
composition):

- Author a new slide HTML from a high-level description.
- Refine within-slide animations (entrance/exit, motion, transitions styling).
- Customize layout beyond the template's data slots.

**Fork, not in-place:** a Tier-2 edit copies the template's slide folder and
edits the copy (`html_override` semantics from
[RFC 0001 §5.5](./0001-product-architecture.md)). The slide's data still
re-injects via `__FIELD__`. Template lineage is preserved; the shared template
stays reusable.

**Cost:** depends on the user's chosen model. The platform pays $0.

---

## 7. Inference Topology

```
                  user config (OpenRouter key in OS keychain)
                              │
              ┌───────────────┴───────────────┐
              ▼                               ▼
       OpenRouter (default)            system Ollama
       prefer free models              (if installed → offline fallback)
              │                               │
              └───────────────┬───────────────┘
                              ▼
                   AI client (Python, in the local app)
                              │
                   Tier 1 → index.json   |   Tier 2 → index.html
```

- **OpenRouter is the default.** The app ships preferring free model variants
  so a brand-new user with a free-tier key pays $0.
- **Ollama is auto-detected** if installed on the system; if present, it is
  offered as an offline fallback. If absent, OpenRouter-only. The app does
  **not** bundle Ollama or model weights (keeps the install light).
- **The cloud control plane is not in this diagram.** It never sees a key,
  never proxies a generation, never runs inference.

### 7.1 First-run experience

A brand-new user must supply an OpenRouter key before AI works. The app
defaults to a **free** model id for Tier 1, so once the key is entered, Tier 1
runs at $0 cost. The user can upgrade/replace models per tier in settings.
(No bundled local model; no zero-config AI.)

---

## 8. Prompt Templates as Workspace Files

Prompts are **files**, not hardcoded constants:

```
project/
└── prompts/
    ├── storyboard.md
    ├── refine-slide.md
    ├── voiceover.md
    └── animate-slide.md
```

- **Versioned with the template** (a template ships its prompt files).
- **Editable** in the HTML editor — power users can tune behavior.
- **Iterable by the AI itself** — Tier 2 can refine a prompt file, then use
  it. Reviewable by diff.
- **Shipped with templates** so prompt improvements don't require an app
  release.

---

## 9. Operations & Safety Gates

| Gate | When | What |
|---|---|---|
| **Schema validation + bounded retry** | after every Tier-1 JSON patch | validate against the `index.json` schema; on failure, retry with the error (cap 2–3×); on repeated failure, fall back to field defaults — **never block the user** |
| **AGENTS.md lint gate** | before accepting any Tier-2 HTML edit | run `npx hyperframes lint` (or equivalent); reject edits that violate the composition contract; never write broken HTML into the workspace |
| **Hallucination review** | before TTS bakes a voiceover | require explicit user review/confirm of generated narration before it's sent to edge-tts (factual claims can be wrong) |
| **Prompt-injection sanitization** | before user text enters any prompt | treat user-supplied content as untrusted data, not instructions |

---

## 10. AI ↔ Editor Integration

- **Streaming responses** — Tier-1 JSON and Tier-2 HTML stream token-by-token;
  the editor live-stamps into the preview as data/HTML arrives.
- **Targeted regeneration** — per-slide / per-field "regenerate" buttons so
  iteration touches one slot, not the whole video (keeps token cost minimal).
- **Generation history** — per-project, in `.ovk/` (the workspace metadata
  dir from [RFC 0001 §12](./0001-product-architecture.md)). If project sync is
  on (P1), the control plane stores these as opaque JSON — it does not
  interpret them.

---

## 11. Model Catalog & Configuration

| Tier | Default (prefer free) | Purpose |
|---|---|---|
| Tier 1 | `google/gemma-3-27b-it:free` (or Gemma 3 12B) | data / content |
| Tier 2 | user-configured coding model (e.g., Qwen2.5-Coder, DeepSeek-Coder, Claude Haiku) | slide HTML / animation |

The app ships sensible defaults; the user overrides per tier in settings.
OpenRouter model ids are configurable so users can pick any model their key
entitles them to.

---

## 12. Cost Economics

| Path | Cost to user | Cost to platform |
|---|---|---|
| Tier 1, free model | **$0** | $0 |
| Tier 1, paid Gemma 3 12B | ~$0.003 / video | $0 |
| Tier 2, coding model | user's choice | $0 |

The platform never proxies inference, so the platform's inference cost is
**always $0**. This is why AI is unbilled (see
[RFC 0004](./0004-credits-and-billing.md)).

---

## 13. Relationship to Other RFCs

- **Consumes [RFC 0001](./0001-product-architecture.md):** the document model
  (`index.json` data, `index.html` animation) is exactly the Tier-1/Tier-2
  split.
- **Consumes [RFC 0003](./0003-asset-intelligence.md):** Tier-1 asset
  suggestion emits search queries → `/assets/search` → deterministic picks.
- **No impact on [RFC 0004](./0004-credits-and-billing.md):** AI is free; the
  removed "Cloud AI" billing surface is a direct consequence of this design.

---

## 14. Risks & Tradeoffs

| Risk | Mitigation |
|---|---|
| Hallucinated factual claims in voiceover | Mandatory human review before TTS (§9) |
| Tier-1 schema drift breaks stamping | Schema validation + bounded retry → fallback defaults (§9) |
| Tier-2 writes broken/invalid HTML | AGENTS.md lint gate before accepting (§9); fork-not-in-place limits blast radius |
| Prompt injection via user content | Sanitize user text before it enters prompts (§9) |
| Ollama absent → no offline fallback | Accepted; OpenRouter-only is the default; Ollama is opt-in |
| Coding-model cost surprises the user | Settings show per-tier model + estimated cost; Tier 2 is explicit per-slide action, never automatic |
| Free-model rate limits / availability on OpenRouter | App degrades gracefully; user can switch to a paid model id |

---

## 15. Open Questions

| # | Question | Owner |
|---|---|---|
| Q1 | Default Tier-2 coding model id to ship — Qwen2.5-Coder vs DeepSeek-Coder vs Claude Haiku? | product |
| Q2 | Should Tier-2 require explicit user confirm before forking a slide's HTML (vs applying immediately with undo)? | product |
| Q3 | Should prompt files live per-project (`prompts/`) or per-template, or both (template ships defaults, project can override)? | client |
| Q4 | JSON-schema-guided decoding — does OpenRouter's `response_format`/tool-use reliably constrain the chosen free models, or do we need a JSON-repair library + retry? | client |
| Q5 | Should Tier-1 ever call Tier-2 automatically (e.g., "this layout needs a custom transition"), or is Tier-2 strictly user-initiated? | product |

---

## 16. Out of Scope

- Cloud-hosted, metered AI generations.
- Auto-generation of an entire video from one frontier-model prompt as a paid
  surface.
- Bundling a local model in the installer (Ollama is detect-only).
- Metering of any local / BYO-key AI (free forever).
- AI in the render hot path.

---

## 17. References

- [RFC 0001 — Product & Architecture](./0001-product-architecture.md)
- [RFC 0003 — Asset Intelligence](./0003-asset-intelligence.md)
- [RFC 0004 — Credits & Billing](./0004-credits-and-billing.md)
- [`AGENTS.md`](../../AGENTS.md) — template/layout contract (the Tier-2 lint
  target)
- OpenRouter: https://openrouter.ai
- OpenRouter free models: https://openrouter.ai/collections/free-models
- Ollama: https://ollama.com
- Gemma 3: https://huggingface.co/google/gemma-3-12b-it
