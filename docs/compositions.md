# Compositions

How HyperFrames sub-compositions work in OpenVideoKit.

## Architecture: sub-composition model

ALL templates use `"mode": "slide-editor"` with HF's `data-composition-src`. There is one rendering model — no flat/inline alternative.

```
templates/my-template/
├── template.json          ← slide-editor config (layouts + default_slides)
├── index.html             ← root shell: audio + slide host divs + timeline markers
├── layouts/               ← sub-composition layout templates
│   └── my-layout.html     ← bare <template> with __PLACEHOLDER__ markers
└── assets/                ← images, audio, fonts
```

At stamp time, `_stamp_slides()`:
1. Copies the chosen layout → `compositions/slide-N.html` per slide (with unique IDs + values stamped)
2. Generates host divs with `data-composition-src` + z-index in `index.html`
3. Runs voiceover TTS pipeline (if voice fields present)
4. Generates scene transitions + captions from timings

## Layout file format (CRITICAL)

Each layout file MUST be bare `<template>`:

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
    </style>
    <script>
      var tl = gsap.timeline({ paused: true });
      tl.from('[data-composition-id="__SLIDE_ID__"] .content > *', { opacity: 0, y: 40, duration: 0.4 });
      window.__timelines['__SLIDE_ID__'] = tl;
    </script>
  </div>
</template>
```

### Critical rules

| Rule | Why |
|---|---|
| Bare `<template>` only — NO `<html>` wrapper | HF won't extract content from `<html>`-wrapped templates |
| NO `data-variable-values` / `getVariables()` | Returns empty `{}` in HF v0.7.3 |
| Values via `__PLACEHOLDER__` string replacement | Reliable, simple, no HF variable system needed |
| `text-align: center` + `padding-top: XXvh` | Flex/absolute centering doesn't work in HF's sub-comp context |
| CSS via `[data-composition-id="__SLIDE_ID__"]` selectors | Scoped per slide, avoids leakage |
| GSAP animates children (`.content > *`), NOT container | Avoids transform conflicts |
| Opaque `background` on layout root | Later slides cover earlier ones (z-index stacking) |

## How values flow

```
User fills form in slide editor
  ↓
Form intercepts submit, reads ALL textareas via data-field attributes
  ↓
Submit as slides_json = [{"layout":"...","title":"...","voice":"..."}]
  ↓
_stamp_slides():
  For each slide:
    1. Copy layouts/{layout}.html → compositions/slide-N.html
       Replace __SLIDE_ID__ → slide-N
       Replace __TITLE__ → user text, __BODY__ → user text, etc.
    2. Generate host div:
       <div data-composition-src="compositions/slide-N.html"
            class="clip" style="position:absolute;inset:0;z-index:N;">
  ↓
HF runtime loads each sub-comp, mounts <template> content, runs scripts
```

## Root composition (index.html shell)

```html
<div data-composition-id="my-template" data-start="0"
     data-width="1920" data-height="1080" data-duration="30">
  <!-- SLIDES_HERE -->
  <!-- CAPTION_LAYER -->
  /* CAPTION_CSS */
  // SCENE_TRANSITIONS
  // CAPTION_TIMELINE

  <audio src="assets/music-bed.mp3" data-start="0" data-duration="30"
         data-volume="0.08" data-track-index="0" loop></audio>
  <audio src="assets/voiceover.mp3" data-start="0" data-duration="30"
         data-volume="1.0" data-track-index="1"></audio>
</div>
```

Audio MUST stay in root `index.html`, NOT inside sub-composition files.

## Caption styles

Set via `caption_style` in `template.json`:

| Style | Active word | Emphasis word |
|---|---|---|
| `highlight` (default) | Yellow `#ffea00` | Purple `#c084fc` |
| `neon` | Cyan `#22d3ee` + glow | Cyan |
| `editorial` | White `#ffffff` + bold | Amber italic |
| `eco-green` | Yellow `#ffea00` | Green `#4ade80` |

## Available templates

| Template | Layout(s) | Voiceover | Slides |
|---|---|---|---|
| custom-video | product-split, feature-center, cta-big, stat-big, timeline-step, quote | Yes | Dynamic |
| eco-bottle | eco-product | Yes | 8 (product showcase) |
| voiceover-animation | study-feature | Yes | 6 (educational) |
| kinetic-typography | beat | No | 4 (text beats) |
| instant-noodles | noodle-step | No | 6 (cooking steps) |
| capability-reel | reel-clip | No | 3 (clip montage) |
| cli-tutorial | terminal-step | No | 3 (terminal demo) |
| logo-reveal | logo-card | No | 1 (brand reveal) |
| agent-chat | chat-window | No | 1 (chat demo) |

## Debugging

```bash
npx hyperframes inspect sessions/<id> --at 2     # layout issues
npx hyperframes snapshot sessions/<id> --at 2,5  # visual frames
```
