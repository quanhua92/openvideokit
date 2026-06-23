# Development

Local workflow, tests, lint, githooks.

## Setup

```bash
git clone <repo>
cd openvideokit
uv sync --extra dev      # runtime + dev deps (requests, ruff)
```

The `--extra dev` flag pulls in:
- `requests` — for the e2e smoke test
- `ruff` — for linting (pre-commit + manual)

## Running the server

```bash
uv run openvideokit                        # foreground
uv run openvideokit &                      # background
OVK_PORT=9000 uv run openvideokit          # custom port
OVK_TEMPLATES_DIR=/tmp/t uv run openvideokit   # custom template dir
```

Open `http://localhost:8765/` for the landing page.

## End-to-end smoke test

`scripts/test-e2e.py` simulates a real user: lists templates → opens editor → submits form with text + image → verifies Jinja2 substitution reached disk → (optionally) triggers a render and downloads the MP4.

```bash
# Start the server in one shell
uv run openvideokit &

# Run the test in another
uv run --extra dev python scripts/test-e2e.py

# Full pipeline including render (~45s)
uv run --extra dev python scripts/test-e2e.py --render

# Against a remote host
uv run --extra dev python scripts/test-e2e.py http://192.168.1.18:8765
```

The test is self-contained, exits non-zero on any failure, and prints `✓ E2E PASSED` on success. Use it as a smoke check after any change to the pipeline.

## Linting

```bash
uv run --extra dev ruff check src scripts           # report issues
uv run --extra dev ruff check --fix src scripts     # auto-fix safe issues
```

Ruff config lives in `pyproject.toml` under `[tool.ruff]`. Currently enabled rule sets:

- `E`, `F`, `W` — pycodestyle + pyflakes (the basics)
- `I` — isort (import ordering)
- `B` — flake8-bugbear (common footguns)
- `UP` — pyupgrade (modernize syntax)
- `SIM` — simplify (cleaner patterns)

Max line length is 100. `E501` (line too long) is intentionally ignored — ruff format handles wrapping.

## Pre-commit hook

One-time setup after cloning:

```bash
git config core.hooksPath githooks
```

This tells git to look in `githooks/` instead of `.git/hooks/`. The `pre-commit` script (which runs `ruff check`) will now run automatically before each `git commit`.

Bypass for WIP commits:

```bash
git commit --no-verify
```

The hook is just `githooks/pre-commit` — inspect or edit it directly. It prefers `uv run ruff` (so you're using the project-pinned ruff) and falls back to system `ruff` if `uv` isn't on PATH.

## Project layout reference

```
openvideokit/
├── src/openvideokit/             # the importable package
│   ├── __init__.py
│   ├── __main__.py               # `python -m openvideokit` / `openvideokit` CLI
│   ├── app.py                    # FastAPI routes (thin — delegates to modules)
│   ├── config.py                 # paths + JOBS registry + env vars
│   ├── templating.py             # Jinja2 slot stamping + HTML generators
│   └── rendering.py              # hf render subprocess + job tracking
├── scripts/
│   └── test-e2e.py               # user-simulation smoke test
├── templates/                    # template projects (data)
│   └── cloud-render/
├── githooks/
│   └── pre-commit                # ruff check
├── docs/
│   ├── architecture.md
│   ├── api.md
│   ├── deployment.md
│   ├── development.md
│   └── templates.md
├── sessions/                     # runtime, gitignored
├── jobs/                         # runtime, gitignored
├── pyproject.toml
├── uv.lock
└── README.md
```

## Editing a module — what to touch

| You want to change... | Edit |
|---|---|
| HTTP routes or response shapes | `app.py` |
| Slot substitution logic, new slot types | `templating.py:stamp_session()` |
| Editor form HTML | `templating.py:render_editor_page()` |
| Home / landing page HTML | `templating.py:render_home_page()` |
| Preview / job / download page HTML | `templating.py:render_player_page()` / `render_job_page()` |
| Render command, workers, queue backend | `rendering.py` |
| Paths, ports, env-var names | `config.py` |
| Linting rules | `pyproject.toml [tool.ruff]` |
| Pre-commit behavior | `githooks/pre-commit` |

## Adding a new slot type

1. **Schema**: add `{"type": "color", ...}` to a `template.json`.
2. **Editor form**: extend `render_editor_page()` in `templating.py` to render an `<input type="color">` for the new type.
3. **Form parsing**: extend `create_preview()` in `app.py` to extract the value from the multipart form.
4. **Stamping**: extend `stamp_session()` in `templating.py` to apply the value (Jinja2 var, attribute rewrite, etc.).
5. **E2E test**: extend `scripts/test-e2e.py` to submit the new field type.

Each step is a few lines. The full path from "idea" to "working slot" is usually <30 minutes if the underlying HTML change is straightforward.

## Debugging

**Server logs**: stdout (uvicorn). For background runs, redirect to a file:
```bash
nohup uv run openvideokit > /tmp/ovk.log 2>&1 &
tail -f /tmp/ovk.log
```

**Render logs**: each job's full stdout/stderr is captured at `jobs/<job_id>.log`. Browse via `GET /job/<job_id>/log` or read the file directly.

**Inspect a session**: sessions are plain directories under `sessions/<uuid>/`. Walk one to see exactly what got stamped:
```bash
SESSION=af7d078e6c69
diff -r templates/cloud-render sessions/$SESSION
# or
grep -r "{{.*}}" sessions/$SESSION/compositions/   # unfilled Jinja2 = bug
```

**Why isn't my slot filling?**
1. Check `applies_to` in `template.json` points to the right file
2. Check the file actually contains `{{ slot_id }}` (exact match, including underscores)
3. Run `scripts/test-e2e.py` — it explicitly checks substitution and reports what it found
4. Tail the server log for tracebacks

## Releasing

No release pipeline yet — this is a single-repo app. For a real release flow, consider:

1. Tag commits with `v0.1.0`, `v0.2.0`, ...
2. Build wheel: `uv build` → `dist/openvideokit-*.whl`
3. Publish to PyPI: `uv publish` (configure trusted publishing)
4. Build Docker image, push to registry, tag with the version

The pyproject is already set up for hatchling builds, so `uv build` works today.
