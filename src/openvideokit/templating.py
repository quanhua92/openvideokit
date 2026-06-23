"""Template schema loading, slot stamping, and HTML page generation.

This module is deterministic — no LLM, no network. It reads template.json
schemas, applies user values via Jinja2, and produces HTML strings for the
editor form, preview wrapper, and job status pages.
"""

from __future__ import annotations

import contextlib
import json
import mimetypes
import time
from html import escape as html_escape
from pathlib import Path

from jinja2 import Environment, select_autoescape

from .config import SESSIONS_DIR, TEMPLATES_DIR

_jinja = Environment(autoescape=select_autoescape(["html", "xml"]))


# ─── schema ────────────────────────────────────────────────────────────────
def guess_mime(path: Path) -> str:
    mt, _ = mimetypes.guess_type(path.name)
    return mt or "application/octet-stream"


def load_template_meta(template_id: str) -> dict:
    """Read templates/<id>/template.json. Raises FileNotFoundError if missing."""
    meta_path = TEMPLATES_DIR / template_id / "template.json"
    if not meta_path.is_file():
        raise FileNotFoundError(f"template '{template_id}' not found")
    return json.loads(meta_path.read_text(encoding="utf-8"))


def list_templates() -> list[dict]:
    """List all template metadata dicts, sorted by priority (desc) then name."""
    out = []
    if not TEMPLATES_DIR.is_dir():
        return out
    for d in sorted(TEMPLATES_DIR.iterdir()):
        if (d / "template.json").is_file():
            out.append(load_template_meta(d.name))
    out.sort(key=lambda m: (-(m.get("priority", 0)), m.get("name", m.get("id", ""))))
    return out


def list_recent_sessions(limit: int = 12) -> list[dict]:
    """Scan SESSIONS_DIR for the most recent session dirs, enriched with template metadata."""
    sessions: list[dict] = []
    if not SESSIONS_DIR.is_dir():
        return sessions
    for d in SESSIONS_DIR.iterdir():
        if not d.is_dir() or d.name.startswith("."):
            continue
        meta_path = d / "template.json"
        meta: dict = {}
        if meta_path.is_file():
            with contextlib.suppress(json.JSONDecodeError, OSError):
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
        sessions.append({
            "id": d.name,
            "name": meta.get("name", "Preview"),
            "template_id": meta.get("id", "?"),
            "created_at": d.stat().st_mtime,
        })
    sessions.sort(key=lambda s: s["created_at"], reverse=True)
    return sessions[:limit]


def relative_time(ts: float) -> str:
    """Human-readable relative time: 'just now', '5m ago', '3h ago', '2d ago'."""
    delta = time.time() - ts
    if delta < 60:
        return "just now"
    if delta < 3600:
        return f"{int(delta / 60)}m ago"
    if delta < 86400:
        return f"{int(delta / 3600)}h ago"
    return f"{int(delta / 86400)}d ago"


# ─── slot stamping ─────────────────────────────────────────────────────────
def stamp_session(
    session_dir: Path,
    meta: dict,
    form_values: dict[str, str],
    uploads: dict[str, bytes],
    upload_meta: dict[str, dict] | None = None,
) -> None:
    """Apply user values to a session copy of the template.

    - Text slots: re-render any file listed in `applies_to` with Jinja2.
    - Image slots: write uploaded bytes to the slot's `path` (with the
      uploaded file's real extension). If `src_var` is declared, inject the
      resolved path as a Jinja2 variable so ``<img src="{{ src_var }}">`` works.
    - Voiceover slots: run the edge-tts pipeline on the user's script to
      generate ``assets/voiceover.mp3`` + ``assets/voiceover_timings.json``,
      then inject caption HTML and GSAP karaoke JS into ``applies_to``.
    """
    upload_meta = upload_meta or {}
    render_targets: dict[Path, dict[str, str]] = {}

    for slot in meta["slots"]:
        sid = slot["id"]
        if slot["type"] == "text":
            applies_to = slot.get("applies_to")
            if not applies_to:
                continue
            target = session_dir / applies_to
            render_targets.setdefault(target, {})[sid] = (
                form_values.get(sid) or slot.get("default", "")
            )
        elif slot["type"] == "image":
            upload_bytes = uploads.get(sid)
            src_var = slot.get("src_var")
            applies_to = slot.get("applies_to")
            base_path = slot.get("path", f"assets/{sid}")

            if upload_bytes:
                # Detect extension from the uploaded filename, fall back to .img
                fname = upload_meta.get(sid, {}).get("filename", "")
                ext = Path(fname).suffix or ".img"
                base_no_ext = str(Path(base_path).with_suffix(""))
                rel_dest = f"{base_no_ext}{ext}"
                dest = session_dir / rel_dest
                dest.parent.mkdir(parents=True, exist_ok=True)
                dest.write_bytes(upload_bytes)

                # Also remove the old default file so it doesn't linger
                default_file = session_dir / slot.get("default", "")
                if default_file != dest and default_file.is_file():
                    default_file.unlink(missing_ok=True)
            else:
                rel_dest = slot.get("default", base_path)

            if src_var and applies_to:
                target = session_dir / applies_to
                render_targets.setdefault(target, {})[src_var] = rel_dest

        elif slot["type"] == "voiceover":
            pass  # handled in batch below

    # Batch all voiceover slots: collect scripts, run ONE TTS pipeline with smart timing
    voiceover_slots = [s for s in meta["slots"] if s["type"] == "voiceover"]
    if voiceover_slots:
        _stamp_voiceover_batch(session_dir, voiceover_slots, form_values, meta)

    for target, variables in render_targets.items():
        if not target.is_file():
            continue
        tmpl = _jinja.from_string(target.read_text(encoding="utf-8"))
        target.write_text(tmpl.render(**variables), encoding="utf-8")


def _stamp_voiceover_batch(
    session_dir: Path,
    voiceover_slots: list[dict],
    form_values: dict[str, str],
    meta: dict,
) -> None:
    """Run ONE TTS pipeline for all voiceover slots with smart auto-timing.

    Each voiceover slot is one slide's narration. The pipeline:
      1. Collects scripts from all voiceover slots (form value or default)
      2. TTS each sentence, measures actual duration
      3. Auto-calculates start times (slide N starts after N-1 ends + gap)
      4. Generates voiceover.mp3 + voiceover_timings.json
      5. Injects caption HTML + caption GSAP + scene transition GSAP into applies_to

    Slot schema (per voiceover slot):
      - voice:     edge-tts voice ID (default: vi-VN-HoaiMyNeural)
      - applies_to: HTML file to inject into (from first voiceover slot)
      - gap_between_slides: pause between slides (default: 0.8s)
      - start_offset: first slide start (default: 0.5s)
      - emphasis_map: {slide_index: [word_indices]} for keyword highlight
    """
    text_parts: list[str] = []
    for slot in voiceover_slots:
        raw = form_values.get(slot["id"], "") or slot.get("default", "")
        if not raw.strip():
            continue
        lines = [line.strip() for line in raw.strip().split("\n") if line.strip()]
        text_parts.extend(lines) if len(lines) > 1 else text_parts.append(raw.strip())

    if not text_parts:
        return

    first_slot = voiceover_slots[0]
    voice = first_slot.get("voice", "vi-VN-HoaiMyNeural")
    applies_to = first_slot.get("applies_to", "index.html")
    start_offset = float(first_slot.get("start_offset", 0.5))
    gap_between_slides = float(first_slot.get("gap_between_slides", 0.8))
    emphasis_map = first_slot.get("emphasis_map", {})
    slide_prefix = first_slot.get("slide_prefix", "slide")

    from .voiceover import generate_voiceover_smart

    assets_dir = session_dir / "assets"
    timings = generate_voiceover_smart(
        text_parts,
        assets_dir,
        voice=voice,
        start_offset=start_offset,
        gap_between_slides=gap_between_slides,
    )

    # Update template duration to match actual voiceover length
    meta["duration"] = timings["total_duration"]

    from .captions import (
        build_caption_html,
        build_caption_timeline_js,
        build_scene_transitions_js,
    )

    caption_html = build_caption_html(timings, emphasis_map)
    caption_js = build_caption_timeline_js(timings, indent="        ")
    scene_js = build_scene_transitions_js(timings, slide_prefix=slide_prefix, indent="        ")

    target_file = session_dir / applies_to
    if target_file.is_file():
        content = target_file.read_text(encoding="utf-8")

        # Inject caption HTML
        if "<!-- CAPTION_LAYER -->" in content:
            content = content.replace("<!-- CAPTION_LAYER -->", caption_html)

        # Inject caption karaoke timeline
        if "// CAPTION_TIMELINE" in content:
            content = content.replace("// CAPTION_TIMELINE", caption_js)

        # Inject scene transitions (slide show/hide driven by TTS timings)
        if "// SCENE_TRANSITIONS" in content:
            content = content.replace("// SCENE_TRANSITIONS", scene_js)

        # Update total duration in data-duration attribute
        import re

        content = re.sub(
            r'data-duration="[\d.]+"',
            f'data-duration="{timings["total_duration"]:.1f}"',
            content,
        )
        # Update DUR variable in JS
        content = re.sub(
            r"var DUR\s*=\s*[\d.]+;",
            f'var DUR = {timings["total_duration"]:.1f};',
            content,
        )

        target_file.write_text(content, encoding="utf-8")


# ─── HTML page generators ──────────────────────────────────────────────────
_TAILWIND_HEAD = """<script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
    <style type="text/tailwindcss">
      @theme {
        --color-brand: #ff5a3c;
        --color-ink: #0a0a0a;
      }
    </style>"""


def render_home_page(templates: list[dict], sessions: list[dict] | None = None,
                     jobs: list[dict] | None = None) -> str:
    """Landing page at / — template cards + recent sessions + recent renders."""
    # Template cards
    if not templates:
        cards = '<p class="text-zinc-600 text-center py-8 col-span-full">No templates installed. Drop one in <code class="bg-zinc-900 px-1.5 py-0.5 rounded text-brand">templates/</code>.</p>'
    else:
        cards = "\n".join(_template_card(t) for t in templates)

    # Recent sessions
    sessions = sessions or []
    if sessions:
        session_items = "\n".join(_session_row(s) for s in sessions)
    else:
        session_items = '<p class="text-zinc-700 text-sm py-6 px-4">No sessions yet. Pick a template above to start.</p>'

    # Recent jobs
    jobs = jobs or []
    if jobs:
        job_items = "\n".join(_job_row(j) for j in jobs)
    else:
        job_items = '<p class="text-zinc-700 text-sm py-6 px-4">No renders yet.</p>'

    return f"""<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OpenVideoKit</title>
  {_TAILWIND_HEAD}
</head>
<body class="bg-ink text-zinc-100 min-h-screen flex flex-col items-center px-6 py-12">
  <header class="text-center mb-10">
    <h1 class="text-4xl font-bold tracking-tight mb-2">
      Open<span class="text-brand">Video</span>Kit
    </h1>
    <p class="text-zinc-500 text-base max-w-lg">
      Deterministic video templating. Fill a form, get a customized composition — preview live, render on demand.
    </p>
  </header>
  <main class="w-full max-w-5xl space-y-10">
    <section>
      <h2 class="text-xs font-semibold uppercase tracking-widest text-zinc-600 mb-4">Templates</h2>
      <div class="grid gap-4 grid-cols-[repeat(auto-fill,minmax(260px,1fr))]">
        {cards}
      </div>
    </section>
    <section>
      <h2 class="text-xs font-semibold uppercase tracking-widest text-zinc-600 mb-4">Recent Sessions</h2>
      <div class="bg-zinc-900/50 rounded-lg border border-zinc-800 divide-y divide-zinc-800/50">
        {session_items}
      </div>
    </section>
    <section>
      <h2 class="text-xs font-semibold uppercase tracking-widest text-zinc-600 mb-4">Recent Renders</h2>
      <div class="bg-zinc-900/50 rounded-lg border border-zinc-800 divide-y divide-zinc-800/50">
        {job_items}
      </div>
    </section>
  </main>
  <footer class="mt-12 text-xs text-zinc-700 flex gap-4">
    <a href="/api" class="hover:text-zinc-400">JSON API</a>
    <a href="https://hyperframes.heygen.com" class="hover:text-zinc-400">HyperFrames docs</a>
  </footer>
</body></html>"""


def _session_row(s: dict) -> str:
    """One row in the Recent Sessions list."""
    return f"""<div class="flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/30">
      <div class="flex-1 min-w-0">
        <div class="text-sm font-medium text-zinc-300 truncate">{s['name']}</div>
        <div class="text-xs text-zinc-600 font-mono">{s['id']}</div>
      </div>
      <span class="text-xs text-zinc-600">{relative_time(s['created_at'])}</span>
      <a href="/preview/{s['id']}" class="text-xs text-brand hover:text-brand/80 px-2 py-1 rounded
                 bg-brand/10 hover:bg-brand/20 transition-colors">open →</a>
    </div>"""


def _job_row(j: dict) -> str:
    """One row in the Recent Renders list."""
    from .rendering import format_size as _fmt
    status = j["status"]
    badge_cls = {
        "done": "bg-green-900/50 text-green-400",
        "running": "bg-yellow-900/50 text-yellow-400",
        "failed": "bg-red-900/50 text-red-400",
    }.get(status, "bg-zinc-800 text-zinc-400")
    return f"""<div class="flex items-center gap-3 px-4 py-3 hover:bg-zinc-800/30">
      <span class="text-xs font-mono px-2 py-0.5 rounded {badge_cls}">{status}</span>
      <div class="flex-1 min-w-0">
        <div class="text-sm text-zinc-400 font-mono">{j['id']}</div>
        <div class="text-xs text-zinc-600">session {j['session_id']} · {_fmt(j['size'])}</div>
      </div>
      <span class="text-xs text-zinc-600">{relative_time(j['started_at'])}</span>
      <a href="/job/{j['id']}/log" class="text-xs text-zinc-500 hover:text-zinc-300 px-2 py-1">log</a>
      {"<a href=\"/download/" + j['id'] + "\" class=\"text-xs text-brand hover:text-brand/80 px-2 py-1 rounded bg-brand/10 hover:bg-brand/20 transition-colors\">↓ mp4</a>" if status == "done" else ""}
    </div>"""


def _template_card(meta: dict) -> str:
    """One template card on the home page."""
    tid = meta.get("id", "")
    name = meta.get("name", tid)
    desc = meta.get("description", "") or "No description."
    duration = meta.get("duration", "?")
    n_slots = len(meta.get("slots", []))
    slot_word = "slot" if n_slots == 1 else "slots"
    return f"""<a href="/editor/{tid}"
      class="block bg-zinc-900 border border-zinc-800 rounded-lg p-5 no-underline text-inherit
             hover:border-zinc-600 hover:-translate-y-0.5 transition-all flex flex-col gap-2">
      <div class="text-lg font-semibold text-white">{name}</div>
      <div class="text-sm text-zinc-400 leading-relaxed flex-1">{desc}</div>
      <div class="text-xs text-zinc-600 flex gap-3 mt-2 items-center">
        <span class="text-brand">→</span><span>editor</span>
        <span>·</span><span>{n_slots} {slot_word}</span>
        <span>·</span><span>{duration}s</span>
      </div>
    </a>"""


def render_editor_page(meta: dict, template_id: str) -> str:
    """Auto-generate an HTML form from a template's slot schema."""
    slots_html = []
    seen_groups: set[str] = set()
    for slot in meta.get("slots", []):
        sid = slot["id"]
        label = slot.get("label", sid)
        default = slot.get("default", "")
        maxlen = slot.get("max_length", "")

        # Render group header when entering a new group
        group = slot.get("group")
        if group and group not in seen_groups:
            seen_groups.add(group)
            slots_html.append(f"""
            <div class="border-t border-zinc-300 pt-4 mt-6 first:border-t-0 first:mt-0 first:pt-0">
              <h2 class="text-sm font-bold text-zinc-700 uppercase tracking-wide mb-3">{group}</h2>
            </div>""")

        if slot["type"] == "text":
            rows = 2 if len(str(default)) < 80 else 3
            slots_html.append(f"""
            <div>
              <label for="f-{sid}" class="block font-semibold text-sm mb-1.5">{label}</label>
              <textarea id="f-{sid}" name="{sid}" rows="{rows}" maxlength="{maxlen}"
                class="w-full px-3 py-2 border border-zinc-300 rounded-md bg-white
                       focus:outline-none focus:ring-2 focus:ring-brand focus:border-brand
                       font-inherit resize-y">{default}</textarea>
            </div>""")
        elif slot["type"] == "image":
            slots_html.append(f"""
            <div>
              <label for="f-{sid}" class="block font-semibold text-sm mb-1.5">{label}</label>
              <input id="f-{sid}" name="{sid}" type="file"
                accept="image/svg+xml,image/png,image/jpeg"
                class="w-full px-3 py-2 border border-zinc-300 rounded-md bg-white
                       file:mr-3 file:px-3 file:py-1 file:rounded file:border-0
                       file:bg-zinc-900 file:text-white file:font-medium file:cursor-pointer">
              <p class="text-xs text-zinc-500 mt-1">Default: {default}</p>
            </div>""")
        elif slot["type"] == "voiceover":
            voice = slot.get("voice", "vi-VN-HoaiMyNeural")
            slots_html.append(f"""
            <div>
              <label for="f-{sid}" class="block font-semibold text-sm mb-1.5">{label}</label>
              <textarea id="f-{sid}" name="{sid}" rows="2"
                class="w-full px-3 py-2 border border-zinc-300 rounded-md bg-amber-50
                       focus:outline-none focus:ring-2 focus:ring-amber-400 focus:border-amber-400
                       font-inherit resize-y">{default}</textarea>
              <p class="text-xs text-amber-700 mt-1">🔊 TTS · {voice}</p>
            </div>""")
    name = meta.get("name", template_id)
    description = meta.get("description", "")
    slots = "\n".join(slots_html)
    return f"""<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OpenVideoKit — {name}</title>
  {_TAILWIND_HEAD}
</head>
<body class="bg-stone-100 text-zinc-900 min-h-screen p-8">
  <div class="max-w-2xl mx-auto">
    <a href="/" class="text-sm text-zinc-500 hover:text-zinc-700">← templates</a>
    <h1 class="text-2xl font-bold mt-4 mb-1">
      <span class="text-brand">OpenVideoKit</span> · {name}
    </h1>
    <p class="text-zinc-600 mb-8">{description}</p>
    <form action="/preview/{template_id}" method="post" enctype="multipart/form-data"
          class="space-y-5">
      {slots}
      <div class="pt-2">
        <button type="submit"
          class="px-5 py-2.5 bg-zinc-900 text-white rounded-md font-medium hover:bg-zinc-700
                 transition-colors">
          Preview →
        </button>
      </div>
    </form>
  </div>
</body></html>"""


def render_player_page(src: str, title: str, session_id: str) -> str:
    """Wrapper HTML with <hyperframes-player> pointed at a session."""
    voiceover_path = SESSIONS_DIR / session_id / "assets" / "voiceover.mp3"
    if voiceover_path.is_file():
        _voiceover_audio = (
            f'    <audio id="ext-voiceover" src="/session/{session_id}/assets/voiceover.mp3" '
            f'preload="auto" hidden></audio>'
        )
        _voiceover_js = """
    const _vo = document.getElementById('ext-voiceover');
    _vo.volume = 1.0;
    _player.addEventListener('play', () => {
      _vo.currentTime = _player.currentTime || 0;
      _vo.play().catch(() => {});
    });
    _player.addEventListener('pause', () => { _vo.pause(); });
    _player.addEventListener('ended', () => { _vo.pause(); _vo.currentTime = 0; });
    _player.addEventListener('timeupdate', (e) => {
      const t = (e.detail && e.detail.currentTime) || _player.currentTime || 0;
      if (Math.abs(_vo.currentTime - t) > 0.3) _vo.currentTime = t;
    });"""
    else:
        _voiceover_audio = ""
        _voiceover_js = ""

    return f"""<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OpenVideoKit — {title}</title>
  {_TAILWIND_HEAD}
  <style type="text/tailwindcss">
    hyperframes-player:fullscreen {{ width: 100vw; height: 100vh; aspect-ratio: unset; border-radius: 0; }}
    hyperframes-player:-webkit-full-screen {{ width: 100vw; height: 100vh; aspect-ratio: unset; border-radius: 0; }}
    #fs-wrapper:fullscreen {{ background: #000; }}
    #fs-wrapper:fullscreen hyperframes-player {{ width: 100vw; height: 100vh; aspect-ratio: unset; border-radius: 0; }}
    #fs-wrapper:-webkit-full-screen {{ background: #000; }}
    #fs-wrapper:-webkit-full-screen hyperframes-player {{ width: 100vw; height: 100vh; aspect-ratio: unset; border-radius: 0; }}
  </style>
  <script type="module" src="https://cdn.jsdelivr.net/npm/@hyperframes/player"></script>
</head>
<body class="bg-ink text-zinc-100 min-h-screen p-4">
  <div class="max-w-6xl mx-auto">
    <div class="flex items-center gap-3 mb-3">
      <a href="/" class="text-sm text-zinc-500 hover:text-zinc-300">← home</a>
      <span class="text-zinc-700">/</span>
      <h1 class="text-sm font-medium text-zinc-400">
        <span class="text-brand font-bold">OpenVideoKit</span> · {title}
      </h1>
      <span class="text-xs text-zinc-700 font-mono ml-auto">{session_id}</span>
    </div>

    <div id="fs-wrapper" class="relative">
      <hyperframes-player
        src="{src}" controls muted="false"
        class="block w-full aspect-video bg-black rounded-lg overflow-hidden"
      ></hyperframes-player>

      <!-- Exit-fullscreen button (only visible when wrapper is fullscreen) -->
      <button id="exit-fullscreen-btn"
        style="display:none"
        class="absolute top-4 right-4 z-[9999] flex items-center gap-2 px-4 py-2.5
               bg-black/70 backdrop-blur text-white rounded-full text-sm font-medium
               hover:bg-black/90 transition-colors border border-white/20 shadow-lg">
        ✕ Exit
      </button>
    </div>

    <!-- External audio synced to player (bypasses HF player's internal muting) -->
    <audio id="ext-music" src="/session/{session_id}/assets/music-bed.mp3" preload="auto" hidden></audio>
{_voiceover_audio}

    <div class="flex gap-3 mt-3 items-center">
      <form method="post" action="/render/{session_id}">
        <button type="submit"
          class="px-4 py-2 bg-zinc-900 text-white rounded-md text-sm font-medium hover:bg-zinc-700 transition-colors border border-zinc-700">
          ▶ Render MP4
        </button>
      </form>
      <button id="fullscreen-btn"
        class="px-4 py-2 bg-zinc-800 text-white rounded-md text-sm font-medium hover:bg-zinc-700 transition-colors border border-zinc-600">
        ⛶ Fullscreen
      </button>
      <a href="/"
         class="px-4 py-2 text-zinc-500 hover:text-zinc-300 text-sm transition-colors">
        ← back
      </a>
    </div>
  </div>

  <script>
    const _player = document.querySelector('hyperframes-player');
    const _music = document.getElementById('ext-music');
    const _fsBtn = document.getElementById('fullscreen-btn');
    const _exitFsBtn = document.getElementById('exit-fullscreen-btn');
    _music.volume = 0.08;
    _music.loop = true;

    // Sync music-bed to player playback (bypasses HF player's internal muting).
    _player.addEventListener('play', () => {{
      _music.currentTime = _player.currentTime || 0;
      _music.play().catch(() => {{}});
    }});
    _player.addEventListener('pause', () => {{ _music.pause(); }});
    _player.addEventListener('ended', () => {{ _music.pause(); _music.currentTime = 0; }});
    _player.addEventListener('timeupdate', (e) => {{
      const t = (e.detail && e.detail.currentTime) || _player.currentTime || 0;
      if (Math.abs(_music.currentTime - t) > 0.3) _music.currentTime = t;
    }});
{_voiceover_js}

    // Fullscreen the wrapper (contains both player + exit button)
    const _fsWrapper = document.getElementById('fs-wrapper');
    function _isFullscreen() {{
      return !!(document.fullscreenElement || document.webkitFullscreenElement);
    }}
    function _onFsChange() {{
      _exitFsBtn.style.display = _isFullscreen() ? 'flex' : 'none';
    }}
    document.addEventListener('fullscreenchange', _onFsChange);
    document.addEventListener('webkitfullscreenchange', _onFsChange);

    _fsBtn.addEventListener('click', () => {{
      if (!_isFullscreen()) {{
        _fsWrapper.requestFullscreen().catch(() => {{
          if (_fsWrapper.webkitRequestFullscreen) _fsWrapper.webkitRequestFullscreen();
        }});
      }} else {{
        document.exitFullscreen().catch(() => {{
          if (document.webkitExitFullscreen) document.webkitExitFullscreen();
        }});
      }}
    }});
    _exitFsBtn.addEventListener('click', () => {{
      document.exitFullscreen().catch(() => {{
        if (document.webkitExitFullscreen) document.webkitExitFullscreen();
      }});
    }});
  </script>
</body></html>"""


def render_job_page(job: dict, job_id: str, elapsed: int) -> str:
    """Auto-refreshing job status page — Tailwind-styled."""
    status = job["status"]
    badge_cls = {
        "done": "bg-green-900/50 text-green-400 border-green-700/50",
        "running": "bg-yellow-900/50 text-yellow-400 border-yellow-700/50",
        "failed": "bg-red-900/50 text-red-400 border-red-700/50",
    }.get(status, "bg-zinc-800 text-zinc-400 border-zinc-700")
    refresh = '<meta http-equiv="refresh" content="3">' if status == "running" else ""
    download_btn = (
        f'<a href="/download/{job_id}" '
        'class="px-5 py-2.5 bg-brand text-white rounded-md text-sm font-semibold '
        'hover:bg-brand/80 transition-colors">↓ Download MP4</a>'
        if status == "done" else ""
    )
    render_btn = (
        f'<a href="/preview/{job["session_id"]}" '
        'class="px-5 py-2.5 bg-zinc-900 text-zinc-300 rounded-md text-sm font-medium '
        'hover:bg-zinc-700 transition-colors border border-zinc-700">↻ Re-render</a>'
        if job.get("session_id") and not job.get("reconstructed") else ""
    )
    session_id = job.get("session_id", "?")
    return f"""<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OpenVideoKit · Job {job_id}</title>
  {refresh}
  {_TAILWIND_HEAD}
</head>
<body class="bg-ink text-zinc-100 min-h-screen flex flex-col items-center px-6 py-12">

  <div class="w-full max-w-2xl">

    <!-- Breadcrumb -->
    <div class="flex items-center gap-3 mb-6 text-sm">
      <a href="/" class="text-zinc-500 hover:text-zinc-300">← home</a>
      <span class="text-zinc-700">/</span>
      <span class="text-zinc-600">job</span>
    </div>

    <!-- Status hero -->
    <div class="bg-zinc-900/50 rounded-xl border border-zinc-800 p-8 mb-6">
      <div class="flex items-center gap-3 mb-4">
        <span class="text-xs font-mono px-2.5 py-1 rounded border {badge_cls}">
          {status}
        </span>
        <span class="text-xs text-zinc-600 font-mono">{job_id}</span>
      </div>

      <h1 class="text-2xl font-bold text-white mb-4">
        {'✓ Render complete' if status == 'done' else ''}
        {'⟳ Rendering…' if status == 'running' else ''}
        {'✗ Render failed' if status == 'failed' else ''}
      </h1>

      <div class="grid grid-cols-2 gap-4 text-sm">
        <div>
          <div class="text-zinc-600 text-xs uppercase tracking-wider mb-1">Elapsed</div>
          <div class="text-zinc-300 font-mono">{elapsed}s</div>
        </div>
        <div>
          <div class="text-zinc-600 text-xs uppercase tracking-wider mb-1">Session</div>
          <div class="text-zinc-300 font-mono text-xs">{session_id}</div>
        </div>
      </div>
    </div>

    <!-- Actions -->
    <div class="flex gap-3 mb-6">
      {download_btn}
      {render_btn}
      <a href="/job/{job_id}/log"
         class="px-5 py-2.5 bg-zinc-900 text-zinc-300 rounded-md text-sm font-medium
                hover:bg-zinc-700 transition-colors border border-zinc-700">
        📋 View log
      </a>
    </div>

  </div>
</body></html>"""


def render_log_page(job: dict, job_id: str, log_text: str) -> str:
    """Terminal-styled render log page."""
    safe_log = html_escape(log_text)
    return f"""<!doctype html>
<html lang="en"><head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>OpenVideoKit · Log {job_id}</title>
  <script src="https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4"></script>
  <style type="text/tailwindcss">
    @theme {{
      --color-brand: #ff5a3c;
      --color-ink: #0a0a0a;
    }}
  </style>
</head>
<body class="bg-ink text-zinc-300 min-h-screen flex flex-col">

  <!-- Header bar -->
  <header class="border-b border-zinc-800 px-6 py-4 flex items-center gap-4">
    <a href="/job/{job_id}" class="text-zinc-500 hover:text-zinc-300 text-sm">← job</a>
    <span class="text-zinc-600">/</span>
    <h1 class="text-sm font-mono text-zinc-400">
      <span class="text-brand">Log</span> · {job_id}
    </h1>
    <span class="ml-auto text-xs font-mono px-2 py-1 rounded
                 {'bg-green-900/50 text-green-400' if job['status'] == 'done' else ''}
                 {'bg-yellow-900/50 text-yellow-400' if job['status'] == 'running' else ''}
                 {'bg-red-900/50 text-red-400' if job['status'] == 'failed' else ''}">
      {job['status']}
    </span>
  </header>

  <!-- Terminal -->
  <main class="flex-1 overflow-auto p-6">
    <div class="max-w-5xl mx-auto bg-black/50 rounded-lg border border-zinc-800
                shadow-2xl overflow-hidden">
      <!-- Terminal title bar -->
      <div class="flex items-center gap-2 px-4 py-2.5 border-b border-zinc-800
                  bg-zinc-900/50">
        <span class="w-3 h-3 rounded-full bg-red-500/70"></span>
        <span class="w-3 h-3 rounded-full bg-yellow-500/70"></span>
        <span class="w-3 h-3 rounded-full bg-green-500/70"></span>
        <span class="ml-3 text-xs text-zinc-600 font-mono">hyperframes render — stdout/stderr</span>
      </div>
      <!-- Log content -->
      <pre class="p-4 text-[12px] leading-relaxed font-mono text-zinc-400
                 whitespace-pre-wrap break-all overflow-x-auto">{safe_log}</pre>
    </div>
  </main>

  <footer class="px-6 py-3 text-xs text-zinc-700 border-t border-zinc-800">
    Session: <code class="text-zinc-500">{job['session_id']}</code>
  </footer>

</body></html>"""
