# AGENTS.md

> Guide for AI agents working on OpenVideoKit.

## What is this repo?

OpenVideoKit is a deterministic video templating pipeline built on top of [HyperFrames](https://hyperframes.heygen.com). Users fill a web form → Jinja2 stamps values into HTML templates → live preview in browser → render MP4 via `npx hyperframes render`. No LLM in the hot path.

**Tech stack:** Python 3.13, FastAPI, Jinja2, uv, edge-tts, HyperFrames (Node CLI), GSAP, FFmpeg.

## Quick start

```bash
uv sync --extra dev          # install all deps
uv run openvideokit          # serve on http://0.0.0.0:8765
```

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

## Module responsibilities

| Module | Owns | Key functions |
|---|---|---|
| `config.py` | Paths, env vars, `JOBS` registry | `ensure_data_dirs()` |
| `app.py` | FastAPI routes (thin) | `create_preview()`, `session_file()` |
| `templating.py` | Schema I/O, Jinja2 stamping, HTML page generators | `stamp_session()`, `render_editor_page()`, `render_player_page()` |
| `voiceover.py` | edge-tts pipeline: TTS + silence + concat + timings | `generate_voiceover()`, `generate_voiceover_smart()` |
| `captions.py` | Word-level karaoke captions + scene transitions | `build_captions()`, `build_caption_timeline_js()`, `build_scene_transitions_js()` |
| `rendering.py` | `npx hyperframes render` subprocess + job tracking | `start_render()`, `get_job()` |

## Slot types

Template schemas (`template.json`) support these slot types:

| Type | Form control | What happens on submit |
|---|---|---|
| `text` | `<textarea>` | Jinja2 `{{ slot_id }}` substitution in `applies_to` file |
| `image` | `<input type="file">` | Byte swap to `path`, optional `src_var` injection |
| `voiceover` | `<textarea>` (amber styled) | **Batch TTS pipeline** — see below |

### Slot extras

- **`group`**: Groups slots under a section header in the editor form (e.g. `"Slide 1 — Intro"`).
- **`priority`**: Template-level field in `template.json`. Higher number = higher on home page (default 0, sorted alphabetically after prioritized ones).

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

## Template authoring

### Minimum viable template

```
templates/my-template/
├── template.json       ← slot schema
├── index.html          ← HyperFrames composition
└── assets/             ← images, audio, fonts
```

### Template JSON schema

```json
{
  "id": "my-template",
  "name": "Display Name",
  "description": "Shown on home page + editor.",
  "duration": 30.0,
  "priority": 50,
  "slots": [
    {
      "group": "Slide 1 — Intro",
      "id": "s1_title",
      "type": "text",
      "label": "Title",
      "default": "Hello World",
      "max_length": 40,
      "applies_to": "index.html"
    }
  ]
}
```

### Required markers for voiceover templates

Place these comments in `index.html` — `stamp_session()` replaces them:

```html
<!-- CAPTION_LAYER -->
<!-- End caption layer -->
```

```javascript
// SCENE_TRANSITIONS
// End scene transitions

// CAPTION_TIMELINE
// End caption timeline
```

### HyperFrames composition format

```html
<div data-composition-id="my-template"
     data-start="0"
     data-width="1920"
     data-height="1080"
     data-duration="30">
  <!-- visual content -->
  <audio src="assets/music-bed.mp3" data-start="0" data-duration="30"
         data-volume="0.08" data-track-index="0" loop preload="auto"></audio>
  <script>
    window.__timelines = window.__timelines || {};
    (function () {
      var tl = gsap.timeline({ paused: true });
      var DUR = 30.0;
      // ... GSAP animations ...
      tl.to({}, { duration: DUR }, 0);  // pad to full duration
      window.__timelines['my-template'] = tl;
    })();
  </script>
</div>
```

Key rules:
- `data-composition-id` MUST match the key in `window.__timelines[]`
- Timeline must be `paused: true` — HyperFrames drives play/pause/seek
- Always pad: `tl.to({}, { duration: DUR }, 0)`
- Audio `data-track-index="0"` = music, `"1"` = voiceover

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
5. **SVG validation**: Always validate SVGs as XML before committing. Broken SVGs (duplicate attributes, unclosed tags) silently fail to render in Chrome. Run: `python3 -c "import xml.etree.ElementTree as ET; ET.parse('file.svg')"`.
6. **Jinja2 autoescape is ON**: User text with `<`, `>`, `&` gets HTML-escaped. Use `|safe` filter ONLY for trusted generated content (like caption HTML).
