# Authoring templates

A template is a folder under `templates/` containing a HyperFrames composition plus a `template.json` schema. This doc walks through the schema and the Jinja2 markers that turn a fixed composition into a customizable one.

## Minimum viable template

```
templates/
└── my-template/
    ├── template.json       ← slot schema (form is generated from this)
    ├── index.html          ← HyperFrames root composition
    ├── compositions/       ← sub-composition HTML files
    └── assets/             ← images, audio, video, fonts
```

That's it. If `template.json` declares zero slots, you still get the editor page (empty form) and the live preview.

## The `template.json` schema

```json
{
  "id": "my-template",
  "name": "My Template",
  "description": "One-line description shown on the editor page.",
  "duration": 38.0,
  "slots": [
    {
      "id": "headline",
      "type": "text",
      "label": "Headline text",
      "default": "Ship faster",
      "max_length": 40,
      "applies_to": "compositions/hero.html"
    },
    {
      "id": "logo",
      "type": "image",
      "label": "Logo (SVG recommended)",
      "path": "assets/logo.svg",
      "default": "assets/logo.svg",
      "applies_to": "compositions/brand.html"
    }
  ]
}
```

### Required fields per slot

| Field | Description |
|---|---|
| `id` | Slot identifier. Becomes the form input `name` and the Jinja2 variable name. Must be a valid Python identifier (`[a-z_][a-z0-9_]*`). |
| `type` | `"text"` or `"image"`. (`"number"`, `"color"`, `"timing"` are planned — open an issue if you need them.) |
| `label` | Human-readable label shown in the editor form. |

### Text slot extras

| Field | Description |
|---|---|
| `default` | Pre-filled value if the user submits an empty field. |
| `max_length` | Hard cap on character count. Enforced in the textarea's `maxlength` attr. |
| `applies_to` | Path (relative to template root) of an HTML file containing `{{ id }}` markers. The server Jinja2-renders that file with the user value. |

### Image slot extras

| Field | Description |
|---|---|
| `path` | Destination path (relative to template root) where the uploaded bytes are written. |
| `default` | Path to ship as the default if no upload. Usually same as `path`. |
| `applies_to` | Reserved for future per-image validation. Currently informational. |

## Jinja2 markers for text slots

Inside any HTML file referenced by `applies_to`, write `{{ slot_id }}` where you want the user value inserted. The server loads the file, runs Jinja2 substitution, and writes it back to the session directory.

```html
<!-- compositions/hero.html -->
<template>
  <div data-composition-id="hero">
    <h1>{{ headline }}</h1>
    <p>Default caption that never changes.</p>
  </div>
</template>
```

### Autoescape

Jinja2 is configured with `autoescape=select_autoescape(["html", "xml"])`. That means **user values are HTML-escaped automatically** — `<script>` becomes `&lt;script&gt;`. Safe to drop user text anywhere in HTML body or attributes.

If you need raw HTML (e.g., user-supplied SVG),”` slot type `"image"` and have them upload a file instead.

### Conflicts with existing JS

The Jinja2 delimiter is `{{ ... }}`. Existing JavaScript in composition files may use:

- `${ expr }` — JS template literals. **Safe** — different delimiters, no conflict.
- `}}` — common at end of object/arrow expressions like `onUpdate(){...}}`. **Safe** — Jinja2 only treats `}}` as expression-end if a `{{` opened one. Standalone `}}` is preserved verbatim.
- `{{` anywhere in existing JS/CSS — **would conflict**, but is extremely rare. If you hit this, wrap the literal in `{% raw %}...{% endraw %}`.

Always run `scripts/test-e2e.py` after editing a template — it will catch any substitution breakage.

## Image slot mechanics

Image slots are pure byte swaps. The server:

1. Receives the uploaded file via multipart form.
2. Writes the bytes to `<session-dir>/<slot.path>`.
3. The composition's existing `<img src="assets/logo.svg">` keeps working — it just loads the replaced bytes.

**No HTML editing happens** for image slots. This means you can swap any binary asset: PNG, JPG, SVG, WebM, MP3, MP4. The schema `type: "image"` is conventional, but the file content is your responsibility.

### Validation

Currently no server-side validation of dimensions, aspect ratio, file size, or MIME type. Add this in `templating.py:stamp_session()` if you need it:

```python
from PIL import Image
import io
img = Image.open(io.BytesIO(upload))
if img.size != (256, 256):
    raise ValueError("logo must be 256×256")
```

## Multi-slot example

A template with text + image + asset-swap together:

```json
{
  "id": "product-demo",
  "name": "Product Demo",
  "duration": 25.0,
  "slots": [
    {"id": "product_name",  "type": "text",  "default": "Acme",
     "max_length": 20, "applies_to": "compositions/intro.html"},
    {"id": "tagline",       "type": "text",  "default": "Build anything",
     "max_length": 60, "applies_to": "compositions/intro.html"},
    {"id": "logo",          "type": "image", "path": "assets/logo.svg",
     "default": "assets/logo.svg"},
    {"id": "bgm",           "type": "image", "path": "assets/bgm.mp3",
     "default": "assets/bgm.mp3", "label": "Background music (MP3)"}
  ]
}
```

The `bgm` slot reuses `type: "image"` to swap an MP3 — the form renders a file input either way. Document this in the slot `label` so users know what to upload.

## Authoring workflow

```bash
# 1. Scaffold a HyperFrames composition
cd templates
npx hyperframes init my-template --example warm-grain
cd my-template

# 2. Iterate on the composition with the HyperFrames studio
npx hyperframes preview .

# 3. Add a template.json schema (start with one text slot)
cat > template.json <<'EOF'
{
  "id": "my-template",
  "name": "My Template",
  "description": "Customizable test template",
  "duration": 10.0,
  "slots": [
    {"id": "title", "type": "text", "label": "Title",
     "default": "Hello", "max_length": 40,
     "applies_to": "compositions/intro.html"}
  ]
}
EOF

# 4. Edit compositions/intro.html to use {{ title }} somewhere

# 5. Open the OpenVideoKit editor for this template
cd ../..
uv run openvideokit &
open http://localhost:8765/editor/my-template
```

## Slot type roadmap

The schema is intentionally minimal. Planned additions:

- `"number"` — numeric input, optional min/max
- `"color"` — color picker, value is a CSS hex string
- `"select"` — dropdown of preset options
- `"timing"` — start/end pair, patches `data-start`/`data-duration` attrs

If you need these today, you can either fork `templating.py:stamp_session()` to handle your custom logic, or pre-process the form in a custom `/preview-extended/{template_id}` route.
