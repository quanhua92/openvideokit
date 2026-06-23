# OpenVideoKit

> Deterministic video templating pipeline — form-driven, minimal LLM, HyperFrames underneath.

OpenVideoKit turns a folder of HTML/JS video compositions into a self-serve web app: users fill a form, you stamp their values into a template with Jinja2, they preview live in the browser, and you render an MP4 on demand. No LLM in the hot path.

```
 ┌────────────┐    ┌─────────────┐    ┌──────────────┐    ┌────────────┐
 │  /editor   │ →  │  /preview   │ →  │   /render    │ →  │ /download  │
 │ form from  │    │ <hf-player> │    │ npx hf render│    │ MP4 bytes  │
 │ schema     │    │ live HTML   │    │  (background)│    │            │
 └────────────┘    └─────────────┘    └──────────────┘    └────────────┘
     mutate          load iframe           subprocess        stream file
    session dir      + postMessage         + Chrome +FFmpeg
```

## Quickstart

```bash
git clone <this-repo>
cd openvideokit
uv sync --extra dev             # install runtime + dev deps
uv run openvideokit             # serve on http://0.0.0.0:8765
```

Open `http://localhost:8765/editor/cloud-render` in a browser, edit the form, click **Preview →**.

## What it does

1. **Templates** live in `templates/<id>/`. Each one is a HyperFrames composition plus a `template.json` schema describing what users can customize (text, images, timing).
2. **Editor** is auto-generated from the schema — no per-template UI code.
3. **Preview** stamps the user's values into a copy of the template via Jinja2, then loads it inside the official `<hyperframes-player>` web component (real HTML, real GSAP timelines, live scrubbing).
4. **Render** spawns `npx hyperframes render` on the stamped session and tracks the job to completion. The MP4 is stored and streamed back.

## Project layout

```
openvideokit/
├── src/openvideokit/          # the Python package
│   ├── app.py                 # FastAPI routes
│   ├── config.py              # paths + env-var overrides
│   ├── templating.py          # schema loading + Jinja2 slot stamping + HTML
│   ├── rendering.py           # hf render subprocess + job tracking
│   ├── __main__.py            # `python -m openvideokit` entry
│   └── __init__.py
├── scripts/
│   └── test-e2e.py            # user-simulation smoke test
├── templates/                 # template projects (data, read-only at runtime)
│   └── cloud-render/          # example: HyperFrames cloud-render launch
├── githooks/
│   └── pre-commit             # runs `ruff check`
├── docs/                      # longer-form documentation
├── pyproject.toml
└── uv.lock
```

`sessions/` and `jobs/` are runtime data dirs — created on demand, gitignored.

## Documentation

| Topic | File |
|---|---|
| System architecture & module responsibilities | [docs/architecture.md](docs/architecture.md) |
| Authoring a new template (slot schema, Jinja2 markers) | [docs/templates.md](docs/templates.md) |
| HTTP endpoint reference | [docs/api.md](docs/api.md) |
| Env vars, Docker, production deployment | [docs/deployment.md](docs/deployment.md) |
| Local dev workflow, e2e test, githooks | [docs/development.md](docs/development.md) |

## Development

```bash
# One-time: enable the pre-commit hook (runs `ruff check` before each commit)
git config core.hooksPath githooks

# Run the e2e test against a running server
uv run openvideokit &
uv run --extra dev python scripts/test-e2e.py
uv run --extra dev python scripts/test-e2e.py --render   # full pipeline (~45s)

# Lint manually
uv run --extra dev ruff check src scripts
uv run --extra dev ruff check --fix src scripts   # auto-fix safe issues
```

## Configuration

All runtime paths are overridable via env vars (defaults shown):

```bash
OVK_BASE_DIR=.                         # project root
OVK_TEMPLATES_DIR=$OVK_BASE_DIR/templates
OVK_SESSIONS_DIR=$OVK_BASE_DIR/sessions
OVK_JOBS_DIR=$OVK_BASE_DIR/jobs
OVK_PORT=8765
OVK_RENDER_WORKERS=3                   # parallel Chrome processes per render
```

See [docs/deployment.md](docs/deployment.md) for Docker, reverse-proxy, and auth patterns.

## Where LLM fits (optional)

The default pipeline is **100% deterministic** — Jinja2 substitution + asset swap. LLM is opt-in for these edge cases only:

- **Template authoring** (one-time per template, paid once)
- **Text shortening** if user input exceeds `max_length`
- **Smart image cropping** to fit slot aspect ratio
- **Natural language → slot values** ("make me a video about coffee")

Each hook is independent and gated behind a feature flag.

## License

MIT
