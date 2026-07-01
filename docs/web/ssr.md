# SSR, Stamping, and the Schema-First Binding

A decision record: how slide **data** reaches slide **HTML**, why the binding
is **stamping** (not `data-attributes`), and why **schema-first** governs the
whole chain — under both the local-first model (today) and the server-hosted
SSR + server-agent model (next phase).

> Companion doc: [`templates.md`](./templates.md) — the `__OVK_*__` token
> convention + the canonical `schema.json` vocabulary.

---

## 1. Context

A review proposed replacing `__FIELD__` string stamping with HTML5
data-attributes (`<h1 data-ovk-field="title"></h1>`) + DOM patching, arguing
the string mechanism is fragile under AI Tier-2 HTML rewrites. This doc
records the verdict and the reasoning.

**Verdict:** stamping remains the binding mechanism. Data-attributes earn a
place only as an *optional* browser-side optimistic-update layer — never as
the primary binding. The chain is governed **schema-first**.

---

## 2. The two binding moments

Data must reach HTML at two distinct times, and they have different optimal
answers:

| Moment | Output | Best mechanism |
|---|---|---|
| **Export / render target** | a **static** HTML file consumed by HyperFrames / headless render | stamping — values baked in before the renderer sees the file |
| **Live preview** | the browser stage | stamp once + light DOM patch on edits (no re-mount per keystroke) |

Conflating the two is the root of the review's confusion.

---

## 3. Local-first model (today — RFC 0001 §5.6)

- **Stamp on structural change** (add/remove/reorder slide, layout swap) and
  **at export**.
- **Live preview**: RFC 0001 §5.6 mandates a *"light DOM patch, no full
  re-stamp"* for responsive text editing. (The current `ovk-web` preview
  full-re-stamps on every field change — a known gap against the RFC, not the
  design.)

---

## 4. The server-hosted SSR model (implemented)

The Python backend (`src/openvideokit/`) is now live. It serves self-contained
stamped compositions and accepts PUTs with content-hash optimistic locking.
**Stamping wins** for three reasons:

1. **SSR string-replace is strictly simpler** than server-side attribute
   filling. Stamping is a stateless `str.replace` + `html_escape`; data-attributes
   under SSR would force either an HTML parser server-side, or shipping
   attributes + a data payload to the browser and hydrating client-side (which
   is not SSR — it just relocates the work).
2. **Text tokens survive agent structural rewrites; element-bound attributes
   do not.** `__OVK_TITLE__` is a *text node* — an agent can restructure the
   surrounding HTML freely (change tags, add wrappers, restyle) and the token
   survives anywhere (stamp replaces all occurrences). `data-ovk-field="title"`
   is tied to a *specific element* — the moment the agent rewrites
   `<h1 data-ovk-field="title">` into `<div class="hero"><span>…</span></div>`,
   the attribute is gone and the binding is lost. Content tokens are
   position-independent; attributes are position-coupled.
3. **Stateless preview + multi-writer safe.** With files mutated by both a
   human and an agent, stamping reads json + html, stamps, serves — no
   client-side binding state to reconcile.

The current implementation builds **self-contained compositions**: all slides
are inlined into the root document (no `data-composition-src` sub-loading), and
a single GSAP root timeline drives scene transitions + per-slide entrance
animations. This lets `<hyperframes-player>` use its direct-timeline adapter
(`window.__timelines['root']`) without injecting the HF runtime.

---

## 5. Why not data-attributes as the primary binding

- **Export still needs stamping** — data cannot reach a static file otherwise
  (HF's `getVariables()` returns `{}` in v0.7.3 sub-compositions). Something
  must be stamped; the question is only whether you stamp literal text or a
  JSON payload + runtime JS. Stamping literal text is simpler and deterministic.
- **"AI forgets the binding" is mechanism-neutral.** AI can drop
  `__OVK_TITLE__` just as easily as `data-ovk-field="title"`. The real defense
  is the lint gate (R5, binding coverage), not the marker syntax.

---

## 6. Schema-first binding (the model)

The single source of truth for *which fields exist* is a **dedicated
`schema.json`** — a closed-by-default vocabulary with an escape hatch. The
chain runs one direction of authority:

```
schema.json   ──declares──▶  fields that may exist (id / label / type / default)
     │
     ▼  must agree (R5)
layout HTML   ──contains──▶  __OVK_*__ tokens  (subset this layout uses)
     │
     ▼  copied per slide at creation
slide index.html  ──owns──▶  its own HTML (tokens self-declare the field set)
     │
     ▼  carries values for those tokens
slide index.json  ──holds──▶  fields{} + assets{}  (values only)
```

### Worked example — "Split (text | image)" archetype

**`schema.json` (shared, read-only):**
```jsonc
{ "title": { "label": "Title", "type": "text", "default": "New slide" },
  "body":  { "label": "Body",     "type": "text", "default": "" },
  "bg_color": { "label": "Background color","type": "color","default": "#0a0a14" },
  "image": { "label": "Image",    "type": "image" } }
```

**`layouts/split-text-image.html` (tokens self-declare):**
```html
<template>
  <div data-composition-id="__OVK_SLIDE_ID__" data-width="1920" data-height="1080">
    <div class="split">
      <div class="text"><h1>__OVK_TITLE__</h1><p>__OVK_BODY__</p></div>
      <div class="media"><img src="__OVK_IMAGE__" /></div>
    </div>
    <style>[data-composition-id="__OVK_SLIDE_ID__"] { background: __OVK_BG_COLOR__; }</style>
  </div>
</template>
```

**`slides/slide-0/` (self-contained, copied from the layout at creation):**
```jsonc
// index.json — values only
{ "layoutId": "split-text-image",
  "fields": { "title": "Eco Bottle", "body": "Reusable.", "bg_color": "#0a0a14" },
  "assets": { "image": "sha256:abc123…" } }
```

**SSR (Python) per slide:**
```
schema = load(schema.json)
html   = slide.owns(index.html) ? slide.index.html : catalog[slide.layoutId].html
values = validate(slide.fields, schema)   # drop stale keys, fill defaults
served = stamp(html, values)              # __OVK_TITLE__ → "Eco Bottle", etc.
```

**Properties panel** reads `schema.json` (labels/types) + the slide's tokens
(which fields apply) + `index.json` (values) → renders labeled, typed inputs.

### The two copy rules

| File | Copied into the slide? | When |
|---|---|---|
| `schema.json` | **Never** | global reference; looked up, never duplicated |
| layout HTML | **Always, at slide creation** | every slide owns its own `index.html` (the "override/fork" concept dissolves — editing HTML is just editing `slide-N/index.html`) |
| `slide index.json` | created per slide | values only |

Every project is **self-contained**: it copies its files from the template at
creation and never references back. Templates can evolve without breaking
existing projects.

---

## 7. Terminology

| Term | Meaning |
|---|---|
| **template** | a starter pack = a **set of layouts** + theme + default slides + assets (picked once, at project creation) |
| **layout** | one slide archetype — an HTML file using `__OVK_*__` tokens (the visual positioning: split, centered, image-bg, …) |
| **slide** | one instance in a project — references a layout via `layoutId`, owns its copied `index.html`, carries values in `index.json` |

Layouts are **per-template** (each template ships its archetypes). The
`schema.json` vocabulary is **global** (the universal field set those
archetypes compose from). The two are orthogonal.

---

## 8. Hardening

- **`__OVK_*__` namespace** — collision-resistant, agent-legible, keeps the
  `__…__` envelope. See [`templates.md`](./templates.md) §2.
- **R5 lint (binding coverage)** — every `__OVK_*__` token in a slide/layout
  HTML must be a member of `schema.json` ∪ the `__OVK_CUSTOM_*__` escape
  namespace. Catches dropped/duplicated/typo'd bindings at accept time,
  regardless of marker syntax.
- **Closed-by-default vocabulary + escape hatch** — the 16-field common set
  caps key proliferation; `__OVK_CUSTOM_*__` covers the genuine long tail with
  visibly-degraded (generic) panel treatment.

---

## 9. Coupling note

The **binding mechanism** (stamping), the **schema-first model**, and the
**`__OVK_*__` convention** are durable long-term contracts.

The **FastAPI Python backend** (`src/openvideokit/`) is the current
implementation. It may be rewritten (e.g. to read/write from disk instead of
in-memory), but the stamping mechanism and token convention remain unchanged.

---

## 10. Open item

**Per-slide `layoutId`.** Each slide must carry a `layoutId` so SSR can look
up the right layout HTML + so the panel knows which tokens apply. The current
`SlideIndex` schema lacks it — a data-model prerequisite for the SSR build,
to settle before that phase.

---

## 11. References

- [`templates.md`](./templates.md) — the `__OVK_*__` token convention + canonical vocabulary.
- [RFC 0001 §5.6 / §9 / §10](../rfc/0001-product-architecture.md) — data binding, `SlideRenderer`, export pipeline.
- [`AGENTS.md`](../../AGENTS.md) — layout-file contract, `__PLACEHOLDER__` history, caption rules.
