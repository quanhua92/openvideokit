# Stamp-Token Convention (`__OVK_*__`)

The binding mechanism between slide **data** and slide **HTML**. This is the
durable contract; the editor, the renderer, the lint gate, and the AI all
operate against it.

> Companion doc: [`ssr.md`](./ssr.md) — why stamping (not data-attributes) is
> the binding mechanism under both the local-first and the server-SSR models.

---

## 1. The rule

Each field id uppercases into a stamp token wrapped in the `__OVK_` namespace:

```
field id  ──uppercase + envelope──▶  __OVK_<UPPERCASE_ID>__
title                                   __OVK_TITLE__
product_image                           __OVK_PRODUCT_IMAGE__
```

- **Generator**: `placeholderFor(id)` → `` `__OVK_${id.toUpperCase()}__` ``.
- **Extractor**: `extractPlaceholders(src)` — regex
  `/__[A-Z0-9_]*[A-Z0-9][A-Z0-9_]*__/g`. It is **namespace-agnostic**: it
  matches `__OVK_TITLE__`, `__OVK_CUSTOM_FOO__`, and legacy `__TITLE__`
  alike, so adopting the namespace required no regex change.
- **Stamping**: `replaceAll` with the **function form** (frontend
  `stampSafe`) so replacement patterns in the value (`$$`, `$&`) are inserted
  literally; backend uses Python `str.replace` + `html_escape`. Never the
  naive string form — `stampNaive` is kept only as a pinned negative test.

The token lives wherever the value should appear — in a text node, an
attribute, a CSS value, or a JS string:

```html
<h1>__OVK_TITLE__</h1>
<img src="__OVK_IMAGE__" />
<div data-composition-id="__OVK_SLIDE_ID__">…</div>
<style>… { background: __OVK_BG_COLOR__; } …</style>
```

---

## 2. Why namespaced

| Concern | How `__OVK_*__` helps |
|---|---|
| **Collision resistance** | `__OVK_TITLE__` is ~1000× less likely to appear in user/agent content than `__TITLE__`. Closes the cross-field contamination edge case (a field value containing another field's placeholder). |
| **Agent-legible** | An LLM reading a layout file sees `__OVK_TITLE__` and immediately grasps it is a named substitution point. |
| **Stable envelope** | Keeps the `__…__` family, so `extractPlaceholders` and every existing matcher work unchanged. |

---

## 3. The dedicated `schema.json` (source of truth)

Field metadata (label / type / default) lives in **one** versioned file — the
canonical vocabulary that R5 validates against and the Properties panel reads.
Shape:

```jsonc
{
  "title":      { "label": "Title",            "type": "text",  "default": "New slide" },
  "body":       { "label": "Body",             "type": "text",  "default": "" },
  "caption":    { "label": "Caption",          "type": "text",  "default": "" },
  "quote":      { "label": "Quote",            "type": "text",  "default": "" },
  "name":       { "label": "Name",             "type": "text",  "default": "" },
  "step":       { "label": "Step",             "type": "text",  "default": "" },
  "image":      { "label": "Image",            "type": "image" },
  "bg_image":   { "label": "Background image", "type": "image" },
  "logo":       { "label": "Logo",             "type": "image" },
  "avatar":     { "label": "Avatar",           "type": "image" },
  "video":      { "label": "Video",            "type": "video" },
  "audio":      { "label": "Audio",            "type": "audio" },
  "url":        { "label": "URL",              "type": "text",  "default": "" },
  "cta":        { "label": "Call to action",   "type": "text",  "default": "" },
  "bg_color":   { "label": "Background color", "type": "color", "default": "#0a0a14" },
  "accent":     { "label": "Accent",           "type": "color", "default": "#4ade80" }
}
```

This is a **closed-by-default** vocabulary: layouts and slides compose from
this set rather than inventing per-template keys. It is generous on purpose
(16 fields across text / identity / sequence / media / link / color) so a
template author rarely needs to escape it.

---

## 4. Common vocabulary (the 16 fields)

| Role | id | type | Notes |
|---|---|---|---|
| **Text** | `title` | text | primary headline (every archetype) |
| | `body` | text | main paragraph / supporting text |
| | `caption` | text | small label / image caption |
| | `quote` | text | quoted / testimonial text |
| **Identity** | `name` | text | brand / product / person / model name |
| **Sequence** | `step` | text | step number / label |
| **Media** | `image` | image | primary content image (SHA ref) |
| | `bg_image` | image | full-bleed background image (SHA ref) |
| | `logo` | image | brand mark (SHA ref) |
| | `avatar` | image | person / character image (SHA ref) |
| | `video` | video | a video clip rendered inside the slide (SHA ref) |
| | `audio` | audio | a pre-recorded audio asset for the slide (SHA ref) |
| **Link** | `url` | text | a URL |
| | `cta` | text | call-to-action label |
| **Color** | `bg_color` | color | slide background color (hex) |
| | `accent` | color | brand / accent color (hex) |

Media fields (`image`, `bg_image`, `logo`, `avatar`, `video`, `audio`)
resolve from `slide.assets` (SHA-256 refs); all others resolve from
`slide.fields`. Both stamp through the same `__OVK_*__` rule.

---

## 5. Do not conflate: three different "audio" concepts

| Concept | Lives at | What it is | Mechanism |
|---|---|---|---|
| `voiceover` | `slide.voiceover` | TTS narration **generated from text** | edge-tts pipeline — **not** a stamp field |
| `audio` | `slide.assets.audio` | a **pre-recorded** audio asset for one slide | SHA ref → `__OVK_AUDIO__` stamp |
| `music` | `root.audio.music` | project-wide background music bed | root-level, not per-slide |

And `video` (per-slide clip asset) is distinct from the project's **exported
MP4** (the whole rendered output). The docs and lint should never blur these.

---

## 6. Custom escape hatch (`__OVK_CUSTOM_*__`)

For genuinely template-specific fields the common set doesn't cover (e.g. a
CLI tutorial's `command` / `output`):

- Namespace: **`__OVK_CUSTOM_<NAME>__`** — same `__OVK_` family, so
  `extractPlaceholders` and R5 treat it uniformly.
- R5 **allows** any `__OVK_CUSTOM_*__` token; it **rejects** truly unknown
  tokens (anything outside `schema.json` ∪ the custom namespace).
- The Properties panel renders custom fields with **generic treatment** — the
  raw key name as label, `text` type, no default. Intentionally slightly
  degraded, so the common vocabulary stays the recommended path.

Use it sparingly. If a "custom" key recurs across templates, promote it into
`schema.json`.

---

## 7. The structural token: `__OVK_SLIDE_ID__`

Injected per-slide (not a user field). It appears in `data-composition-id`,
CSS selectors, GSAP selectors, and the `window.__timelines[...]` key. Stamped
from the slide's id before render.

---

## 8. The binding chain (source of truth)

Schema-first. One direction of authority, validated at the lint gate:

```
schema.json  ──declares──▶  which fields may exist (id / label / type / default)
      │
      ▼  must agree (R5)
layout HTML  ──contains──▶  __OVK_*__ tokens  (the subset this layout uses)
      │
      ▼  copied per slide at creation
slide index.html  ──owns──▶ its own HTML (tokens self-declare the field set)
      │
      ▼  carries values for those tokens
slide index.json  ──holds──▶ fields{} + assets{}  (values only)
```

- **schema.json** is the source of truth for *what fields exist* + metadata.
- The slide's **HTML tokens** self-declare which subset applies (R5 checks
  they're all in the schema ∪ custom namespace).
- The slide's **index.json** carries *values only* — never schema, never labels.
- **SSR** stamps `index.json` values into the slide's own `index.html` tokens.

Per-slide HTML is **copied** from a layout archetype at slide creation, so
every slide is self-contained (see [`ssr.md`](./ssr.md) §6). The "override /
fork" concept dissolves: every slide already owns its HTML; "edit HTML" is
just editing `slide-N/index.html`.

---

## 9. Do-not-conflate: the OTHER marker family

The root `index.html` uses **comment-based structural markers** for
composition assembly. These are a *different* mechanism from field stamps and
are **not** namespaced:

| Marker | Where |
|---|---|
| `<!-- SLIDES_HERE -->` | root HTML — replaced by assembled slide host divs |
| `<!-- CAPTION_LAYER -->` | root HTML — replaced by caption HTML |
| `/* CAPTION_CSS */` | root CSS — replaced by caption style |
| `// SCENE_TRANSITIONS` | root JS — replaced by GSAP slide show/hide |
| `// CAPTION_TIMELINE` | root JS — replaced by GSAP word-highlight timeline |

Low collision risk (comment syntax), root-level only. Leave as-is.

---

## 10. Not-a-token callouts

Things that look like `__…__` but are **not** stamp tokens — do not migrate:

- `window.__timelines[...]` — HyperFrames runtime JS object (lowercase;
  pre-existing HF convention). Not matched by `extractPlaceholders`.
- React's `dangerouslySetInnerHTML={{ __html: … }}` — React reserved prop.
- The prose stand-ins `__FIELD__`, `__PLACEHOLDER__`, `__FIELD_ID__` —
  conceptual placeholders used **only in documentation**; never literal in
  code or templates.

---

## 11. Lint enforcement

`lintHtml` (R1–R4 today) gates every slide HTML override — human and AI alike:

| Rule | Checks |
|---|---|
| R1 | exactly one `<template>` |
| R2 | no `<html>`/`<head>`/`<body>` outside `<template>` |
| R3 | extracted content has `data-composition-id` |
| R4 | no Tailwind |
| **R5** *(planned)* | **binding coverage**: every `__OVK_*__` token in the HTML is a member of `schema.json` ∪ the `__OVK_CUSTOM_*__` namespace |

R5 is the real defense against "AI forgot/duplicated a binding" — it is
mechanism-neutral (it would catch a missing `data-ovk-field` just as well as a
missing `__OVK_TITLE__`), which is why the binding survives AI Tier-2 rewrites
regardless of token syntax.

---

## 12. Status & coupling

- **Durable**: the token convention, the `schema.json` vocabulary, and the
  binding chain are the long-term contract.
- **MVP caveat**: the FastAPI Python backend (`src/openvideokit/`) and the
  `templates/*/layouts/*.html` files are MVP and **subject to rewrite**. Code
  locations referenced here are illustrative, not stable. The backend adopts
  this standard when rewritten; it is not migrated in place.
- **Migration status**: `ovk-web/` is being migrated to `__OVK_*__` +
  schema-driven rendering. Legacy tokens (`__TITLE__`, `__SLIDE_ID__`, …) in
  the Python backend and the `templates/` dir remain on the old form until the
  rewrite.

---

## 13. References

- [`ssr.md`](./ssr.md) — schema-first binding decision record (why stamping,
  why schema-first, the SSR flow).
- [RFC 0001 §5.6 / §10](../rfc/0001-product-architecture.md) — data binding &
  export pipeline.
- [`AGENTS.md`](../../AGENTS.md) — the layout-file contract, caption rules,
  `__PLACEHOLDER__` history.
