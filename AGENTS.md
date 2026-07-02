# AGENTS.md

> Guide for AI agents working on OpenVideoKit.

## What is this repo?

OpenVideoKit is a deterministic video templating pipeline built on top of [HyperFrames](https://hyperframes.heygen.com). Users fill a web form → Jinja2 stamps values into HTML templates → live preview in browser → render MP4 via `npx hyperframes render`. No LLM in the hot path.

**Tech stack:** Python 3.13, FastAPI, Jinja2, uv, edge-tts, HyperFrames (Node CLI), GSAP, FFmpeg.

## Quick start

```bash
uv sync --extra dev          # install all deps
cp .env.example .env         # then edit .env (set OPENAI_API_KEY for AI)
uv run openvideokit          # serve on http://0.0.0.0:8765
```

## Environment variables

All runtime config is env-driven. A root `.env` (gitignored) is **auto-loaded**
by `src/openvideokit/config.py` via `python-dotenv` at import time —
`load_dotenv()` is a silent no-op if `.env` is absent, so the server boots fine
either way; real env vars always override `.env`. See `.env.example` for the
full documented list. Groups:

| Group | Vars | Where |
|---|---|---|
| Server | `OVK_HOST`, `OVK_PORT`, `OVK_DATA_DIR`, `OVK_JOBS_DIR`, `OVK_MAX_CONCURRENT_RENDERS`, `OVK_RENDER_HF_WORKERS` | `config.py` |
| AI (LangGraph agent) | `OPENAI_BASE_URL`, `OPENAI_API_KEY` (required for AI), `OVK_AI_MODEL` (default `gpt-5.4-nano`), `OVK_AI_TIER2_MODEL`, `OVK_AI_TEMPERATURE`, `OVK_AI_MAX_STEPS` | `ai/config.py` (see `docs/ai.md`) |
| Frontend (Vite) | `VITE_API_BASE_URL` | `ovk-web/src/shared/config.ts` |

`OPENAI_BASE_URL`/`OPENAI_API_KEY` accept any OpenAI-compatible endpoint
(OpenAI, OpenRouter `https://openrouter.ai/api/v1`, Ollama
`http://localhost:11434/v1`, vLLM, LM Studio).

## Commands

| Task | Command |
|---|---|
| Run server | `uv run openvideokit` |
| Lint | `uv run ruff check src scripts` |
| Lint + fix | `uv run ruff check --fix src scripts` |
| E2E smoke test | `uv run --extra dev python scripts/test-e2e.py` |
| Full pipeline test | `uv run --extra dev python scripts/test-e2e.py --render` |
| Standalone voiceover gen | `uv run python scripts/generate_voiceover.py --template eco-bottle --bake` |
| Render a template | `npx hyperframes render templates/eco-bottle --output out.mp4` |
| Validate a template | `npx hyperframes lint templates/eco-bottle` |

## Code style (indentation — critical)

**Always use spaces, never tabs, in every file in this repo.**

| Area | Indent | Enforced by |
|---|---|---|
| Python (`src/`, `scripts/`) | **4 spaces** | `ruff format` (`W191` rejects tabs; mixed tabs/spaces → `SyntaxError`) |
| ovk-web (TS/TSX) | **2 spaces** | Biome (`indentStyle: "space"`, `indentWidth: 2`) |

Tabs in Python break the build immediately (`W191` / `unindent does not match any outer indentation level`). When creating or editing a file, write every indented line with the correct number of spaces. Run the formatter before committing (`uv run ruff format` / `pnpm exec biome format --write`).

### File writes — ALWAYS atomic

**Never use `Path.write_text()` or `open().write()` directly for data files.** Use `store._atomic_write(path, data)` instead:

```python
from .store import _atomic_write

# CORRECT — temp file + rename, crash-safe
_atomic_write(path, json.dumps(data))

# WRONG — half-written file on crash
path.write_text(data)
```

`_atomic_write` writes to a `.tmp` file first, then `rename()`s it over the target. On POSIX, `rename` is atomic — readers either see the old or new file, never a partial write. This prevents corruption when the server crashes mid-write or when the file watcher reads a half-written file.

## Module responsibilities

| Module | Owns | Key functions |
|---|---|---|
| `config.py` | Paths, env vars, `JOBS` registry | `ensure_data_dirs()` |
| `app.py` | FastAPI routes (thin) | `create_preview()`, `session_file()` |
| `templating.py` | Schema I/O, Jinja2 stamping, HTML page generators | `stamp_session()`, `render_editor_page()`, `render_player_page()` |
| `voiceover.py` | edge-tts pipeline: TTS + silence + concat + timings | `generate_voiceover()`, `generate_voiceover_smart()` |
| `captions.py` | Word-level karaoke captions + scene transitions | `build_captions()`, `build_caption_timeline_js()`, `build_scene_transitions_js()` |
| `rendering.py` | `npx hyperframes render` subprocess + job tracking | `start_render()`, `get_job()` |

## Layout field types

Layout `fields` in `template.json` support these types:

| Type | Form control | What happens on submit |
|---|---|---|
| `text` | `<textarea>` | `__FIELD_ID__` placeholder replacement in layout HTML |
| `image` | `<input type="file">` | Byte swap to `assets/`, `__FIELD_ID__` path replacement |
| `voiceover` | `<textarea>` (amber styled) | **Batch TTS pipeline** — see below |

### Slot extras

- **`priority`**: Template-level field in `template.json`. Higher number = higher on home page (default 0, sorted alphabetically after prioritized ones).
- **`caption_style`**: Template-level field. Controls caption CSS: `highlight`, `neon`, `editorial`, `eco-green`.
- **`default_slides`**: Pre-fills the editor with slides and their default content.

## Voiceover pipeline

When a template has `voiceover` slots, `stamp_session()` batches ALL of them into one TTS run:

```
Collect all voiceover slot texts
  ↓
generate_voiceover_smart():
  1. edge-tts each sentence → temp_sentence_N.mp3
  2. ffprobe each → measure actual duration
  3. Auto-compute target_starts (slide N starts after N-1 ends + gap_between_slides)
  4. ffmpeg anullsrc silence padding
  5. ffmpeg concat → assets/voiceover.mp3
  6. Write assets/voiceover_timings.json
  ↓
captions.build_captions():
  1. Split each sentence into words
  2. Estimate per-word timing by char ratio
  3. Generate caption HTML (phrase + word spans)
  4. Generate GSAP color tween JS (word-by-word highlight)
  ↓
captions.build_scene_transitions_js():
  1. For each slide: show at timings.start, hide at timings.end
  ↓
Inject into index.html via markers:
  <!-- CAPTION_LAYER -->     → caption HTML
  // CAPTION_TIMELINE        → GSAP word highlight JS
  // SCENE_TRANSITIONS       → GSAP slide show/hide JS
  ↓
Auto-update data-duration + DUR var to match actual voiceover length
```

### Key design decisions

- **`asyncio.run()` inside a thread**: FastAPI runs an async event loop. `tts_sentence_sync()` spawns a dedicated thread per TTS call to avoid `RuntimeError: asyncio.run() cannot be called from a running event loop`.
- **Smart timing**: No manual `target_starts` needed. TTS durations are measured first, then start times are computed as `prev_end + gap_between_slides` (default 0.8s).
- **Batch processing**: All voiceover slots are collected and processed in ONE pipeline, producing ONE `voiceover.mp3`. Individual per-slide audio files are NOT used.

## Caption styling — CRITICAL RULES

**Never use `transform`, `scale()`, `font-size`, or `text-shadow` changes on `.word--active`.** These cause visual layout shifts ("jumping") that look broken.

### The correct caption pattern

Caption highlighting uses **GSAP direct color tween** (not CSS class toggling):

```javascript
// CORRECT — smooth color tween, zero layout shift
tl.to(wordSelector, { color: '#ffea00', duration: 0.15, ease: 'power2.out' }, wordStart);
tl.to(wordSelector, { color: 'rgba(255,255,255,0.4)', duration: 0.15, ease: 'power2.in' }, wordEnd);
```

```css
/* CORRECT — base word style */
.caption-phrase .word {
  display: inline-block;
  font-size: 48px; font-weight: 800;
  color: rgba(255, 255, 255, 0.4);   /* dim white default */
  margin: 0 0.1em;
  text-shadow: 0 4px 20px rgba(0, 0, 0, 0.8);
  transition: color 0.2s ease;        /* smooth fallback */
}

/* CORRECT — emphasis (keyword highlight, static, no animation) */
.caption-phrase .word--emphasis { color: #4ade80; }

/* CORRECT — active state is ONLY a color change */
.caption-phrase .word--active { color: #ffea00; }
```

### What NOT to do

```css
/* WRONG — causes layout shift / size jumping */
.caption-phrase .word--active {
  transform: scale(1.15);                          /* ← BANNED */
  font-size: 56px;                                 /* ← BANNED */
  text-shadow: 0 0 30px rgba(255,234,0,0.6);      /* ← BANNED (causes repaint jumps) */
}

/* WRONG — GSAP className toggle snaps instantly, doesn't animate */
tl.to(word, { className: '+=word--active', duration: 0.05 }, start);
```

### Why `className` toggle is banned

GSAP's `className` plugin reads computed styles before/after the class change and tweens the diff. This sounds smooth but in practice:
- It can pick up unintended CSS property changes and animate them
- The `duration: 0.05` is too short to be visible, making it an instant snap
- It conflicts with CSS `transition` on the same element

**Always use direct property tweens** (`color`, `opacity`) for word highlighting.

## Sub-composition model (ALL templates)

ALL templates use `"mode": "slide-editor"` with HF's `data-composition-src` to embed slides as separate files. There is no flat model.

### Template structure

```
templates/my-template/
├── template.json          ← slide-editor config (mode, layouts, default_slides)
├── index.html             ← root shell (audio + slide host divs + timeline markers)
├── layouts/               ← sub-composition layout files
│   └── my-layout.html     ← bare <template> with __PLACEHOLDER__ markers
└── assets/                ← images, audio, fonts
```

### Layout file format — CRITICAL

Layout files MUST be bare `<template>` — **no `<html>` wrapper, no `<body>`, no `data-composition-variables`**.

```html
<template>
  <div data-composition-id="__SLIDE_ID__" data-width="1920" data-height="1080">
    <div class="content">
      <h1>__TITLE__</h1>
      <p>__BODY__</p>
    </div>
    <style>
      [data-composition-id="__SLIDE_ID__"] { background: #0a0a14; }
      [data-composition-id="__SLIDE_ID__"] .content {
        text-align: center;
        padding-top: 38vh;
      }
      [data-composition-id="__SLIDE_ID__"] h1 { font-size: 120px; ... }
    </style>
    <script>
      var tl = gsap.timeline({ paused: true });
      tl.from('[data-composition-id="__SLIDE_ID__"] .content > *', { opacity: 0, y: 40, duration: 0.4, stagger: 0.1 });
      window.__timelines['__SLIDE_ID__'] = tl;
    </script>
  </div>
</template>
```

### Why bare `<template>` (no `<html>` wrapper)

HF's runtime extracts `<template>` content and mounts it. An `<html>` wrapper around `<template>` causes HF to NOT extract the content — the sub-comp renders blank. Verified in HF v0.7.3.

### Why NOT `data-variable-values` / `getVariables()`

HF's `getVariables()` returns empty `{}` in v0.7.3 sub-compositions. Values are stamped directly into the HTML via `__PLACEHOLDER__` string replacement at stamp time.

### Why NOT flex/absolute centering

HF's sub-comp mounting context doesn't reliably support `display:flex; align-items:center` or `position:absolute; transform:translate(-50%,-50%)`. Use the official HF pattern: `text-align: center` + `padding-top: XXvh` for vertical positioning. The `vh` unit is viewport-relative and works for any video size.

### Placeholder convention

- `__SLIDE_ID__` → replaced with `slide-0`, `slide-1`, etc.
- `__TITLE__` → replaced with user's title text
- `__BODY__` → replaced with user's body text
- `__IMAGE__` → replaced with image path (if layout has image field)
- `__STEP__` → replaced with step number (timeline-step layout)

Each field ID is uppercased: field `title` → `__TITLE__`, field `body` → `__BODY__`.

### Host div format

```html
<div data-composition-id="slide-0"
     data-composition-src="compositions/slide-0.html"
     data-start="0.5" data-duration="5.0"
     class="clip" style="position:absolute;inset:0;z-index:100;"></div>
```

Key rules:
- `position:absolute;inset:0;` is REQUIRED on the host div — without it, sub-comp content collapses to zero size
- `z-index:100-idx` initially — first slide on top, root timeline swaps z-index at each slide start
- `class="clip"` for HF's visibility management

### Template JSON schema

```json
{
  "id": "my-template",
  "name": "Display Name",
  "description": "Shown on home page + editor.",
  "duration": 30.0,
  "priority": 50,
  "mode": "slide-editor",
  "caption_style": "highlight",
  "layouts": [
    {
      "id": "my-layout",
      "name": "Layout Name",
      "fields": [
        {"id": "title", "type": "text", "label": "Title", "default": "Hello"},
        {"id": "body", "type": "text", "label": "Body", "default": "World"},
        {"id": "voice", "type": "voiceover", "label": "Voiceover", "default": ""}
      ]
    }
  ],
  "default_slides": [
    {"layout": "my-layout", "title": "Slide 1", "body": "Content", "voice": "Narration text."}
  ],
  "slots": []
}
```

### Root index.html markers

Place these in `index.html` — `_stamp_slides()` replaces them:

```html
<!-- SLIDES_HERE -->     → host divs with data-composition-src
<!-- CAPTION_LAYER -->   → caption HTML (word spans)
/* CAPTION_CSS */        → caption CSS (style determined by caption_style)
// SCENE_TRANSITIONS     → GSAP z-index swap JS
// CAPTION_TIMELINE      → GSAP word-by-word highlight JS
```

### Debugging with HF tools

```bash
# Check for layout issues (text occlusion, overlap, positioning)
npx hyperframes inspect sessions/<session_id> --at 2

# Capture visual frames for verification
npx hyperframes snapshot sessions/<session_id> --at 2,5,8 --output snapshots/
```

## Preview audio

The preview page (`render_player_page()`) uses external `<audio>` elements synced to the HyperFrames player via event listeners. This bypasses the player's internal muting.

- `ext-music`: music-bed, looped, volume 0.08
- `ext-voiceover`: voiceover track (if `assets/voiceover.mp3` exists), volume 1.0, not looped

Both sync to `_player.currentTime` via `timeupdate` events.

## Common pitfalls

1. **edge-tts voice IDs need `Neural` suffix**: Use `vi-VN-HoaiMyNeural`, NOT `vi-VN-HoaiMy`.
2. **asyncio.run() in FastAPI**: Must use thread-based wrapper (`tts_sentence_sync` in `voiceover.py`). Calling `asyncio.run()` directly inside a FastAPI route crashes with `RuntimeError`.
3. **Google Fonts lint error**: All templates trigger `google_fonts_import` error from HF lint. Pre-existing issue, non-blocking. Use `--strict` only if you've switched to local `@font-face`.
4. **`shutil.copytree` duplicates everything**: Every form submission copies the entire template dir. Keep templates small or add a session janitor.
5. **Stamping: never use the string form of `replaceAll`/`replace`**: JavaScript's `String.prototype.replaceAll(token, replacement)` with a **string** replacement interprets `$&` (the matched substring), `$$`, `` $` ``, and `$'` — so a field/slide value containing any of those silently corrupts the stamped output. Always use the **function form** `replaceAll(token, () => value)`, which inserts the value literally. In `ovk-web` this is `stampSafe` (`shared/lib/placeholders.ts`); `stampNaive` (the string form) is kept only as a pinned negative test. Python's `str.replace` is literal (no `$` interpretation) and safe, but always `html_escape` values first.
6. **SVG validation**: Always validate SVGs as XML before committing. Broken SVGs (duplicate attributes, unclosed tags) silently fail to render in Chrome. Run: `python3 -c "import xml.etree.ElementTree as ET; ET.parse('file.svg')"`.
7. **Form submit sync**: The slide editor intercepts form submit and reads all textarea values from the DOM via `data-field` attributes. The `syncFromDOM()` function must run before any re-render (add/remove/reorder) to avoid losing typed values.
