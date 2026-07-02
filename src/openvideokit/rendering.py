"""Render job management — bounded worker pool + in-memory JOBS registry.

Each export enqueues a job to a ``ThreadPoolExecutor(max_workers=N)``. The
worker materialises a self-contained render directory (composition HTML +
concatenated voiceover track), then spawns ``npx hyperframes render`` as a
subprocess and waits for it **on the worker thread** — never blocking the
asyncio event loop.

Concurrency is capped by ``OVK_MAX_CONCURRENT_RENDERS`` (default 1). Extra
enquires land in the executor's internal queue with status ``queued``. Job
state lives in the in-memory ``_JOBS`` dict (lost on restart — same trade-off
as the legacy MVP).

Audio: per-slide ``audio-{hash}.mp3`` files (produced by the TTS endpoint)
are concatenated with silence padding into a single ``voiceover.mp3`` aligned
to each slide's start time, then injected as an ``<audio>`` element synced to
the GSAP root timeline. If no slide has audio, the render is video-only.
"""

from __future__ import annotations

import contextlib
import copy
import json
import logging
import re
import subprocess
import tempfile
import threading
import time
import uuid
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from typing import Any

from .composition import build_root_composition

log = logging.getLogger(__name__)

# ── Status constants ─────────────────────────────────────────────────────

QUEUED = "queued"
RUNNING = "running"
DONE = "done"
FAILED = "failed"
CANCELLED = "cancelled"

_TERMINAL = frozenset({DONE, FAILED, CANCELLED})

# ── Module state ─────────────────────────────────────────────────────────

_JOBS: dict[str, dict[str, Any]] = {}
_executor: ThreadPoolExecutor | None = None
_lock = threading.Lock()  # guards _JOBS mutations


# ── Executor lifecycle ───────────────────────────────────────────────────


def init_executor(max_workers: int) -> None:
    global _executor
    _executor = ThreadPoolExecutor(
        max_workers=max_workers,
        thread_name_prefix="ovk-render",
    )
    log.info("render executor started (max_workers=%d)", max_workers)


def shutdown_executor() -> None:
    global _executor
    if _executor is not None:
        _executor.shutdown(wait=False, cancel_futures=True)
        _executor = None


# ── Paths ────────────────────────────────────────────────────────────────


def _jobs_dir() -> Path:
    from .config import JOBS_DIR

    p = Path(JOBS_DIR)
    p.mkdir(parents=True, exist_ok=True)
    return p


def _job_dir(job_id: str) -> Path:
    return _jobs_dir() / job_id


def _jobs_meta_path(project_id: str) -> Path:
    """Path to the per-project jobs.json sidecar."""
    from .config import DATA_DIR
    return Path(DATA_DIR) / project_id / "jobs.json"


def _persist_job(job: dict[str, Any]) -> None:
    """Upsert a job into the project's jobs.json (atomic write, locked)."""
    from .store import _atomic_write

    project_id = job.get("project_id", "")
    if not project_id:
        return

    pub = _public(job)
    # Add file size for done jobs
    if pub.get("status") == DONE and pub.get("output"):
        opath = Path(pub["output"])
        if opath.is_file():
            pub["size"] = opath.stat().st_size

    path = _jobs_meta_path(project_id)
    with _lock:
        try:
            existing: list[dict] = []
            if path.is_file():
                raw = json.loads(path.read_text(encoding="utf-8"))
                if isinstance(raw, list):
                    existing = raw
            # Upsert by id
            found = False
            for i, e in enumerate(existing):
                if e.get("id") == pub["id"]:
                    existing[i] = pub
                    found = True
                    break
            if not found:
                existing.append(pub)
            existing.sort(key=lambda j: j.get("started_at", 0), reverse=True)
            # Keep last 50
            existing = existing[:50]
            _atomic_write(path, json.dumps(existing, ensure_ascii=False, indent=2))
        except Exception:
            log.warning("failed to persist job %s to disk", pub.get("id"), exc_info=True)


def _load_disk_jobs(project_id: str) -> list[dict[str, Any]]:
    """Load historical jobs from the project's jobs.json (locked).

    Reconciles stale ``queued``/``running`` states: if the server crashed
    mid-render, the in-memory ``_JOBS`` dict is gone and the disk entry
    is stuck. We check the output file: if ``output.mp4`` exists → ``done``,
    otherwise → ``failed``.
    """
    path = _jobs_meta_path(project_id)
    with _lock:
        if not path.is_file():
            return []
        try:
            raw = json.loads(path.read_text(encoding="utf-8"))
            if not isinstance(raw, list):
                return []
        except Exception:
            return []

        # Reconcile stale active states (server crashed/restarted mid-render)
        changed = False
        for job in raw:
            if job.get("status") in (QUEUED, RUNNING):
                output_path = Path(job.get("output", ""))
                if output_path.is_file():
                    job["status"] = DONE
                else:
                    job["status"] = FAILED
                    job["error"] = job.get("error") or "Interrupted (server restarted)"
                if "ended_at" not in job or job["ended_at"] is None:
                    job["ended_at"] = output_path.stat().st_mtime if output_path.is_file() else time.time()
                changed = True

        # Persist reconciled statuses back to disk
        if changed:
            from .store import _atomic_write

            with contextlib.suppress(Exception):
                _atomic_write(path, json.dumps(raw, ensure_ascii=False, indent=2))

        return raw


# ── Enqueue ──────────────────────────────────────────────────────────────


def enqueue_render(project: dict, project_id: str) -> str:
    """Create a queued job and submit to executor immediately.

    The heavy materialization (composition build + voiceover ffmpeg) runs
    INSIDE the worker, not in this function — so POST /export returns
    instantly with 202.
    """
    job_id = uuid.uuid4().hex[:12]
    jdir = _job_dir(job_id)
    jdir.mkdir(parents=True, exist_ok=True)

    output_path = jdir / "output.mp4"
    log_path = jdir / "render.log"

    job: dict[str, Any] = {
        "id": job_id,
        "project_id": project_id,
        "status": QUEUED,
        "output": str(output_path),
        "log": str(log_path),
        "started_at": time.time(),
        "ended_at": None,
        "exit_code": None,
        "error": None,
        # internal (stripped from API responses)
        "_proc": None,
        "_cancel_requested": False,
    }
    with _lock:
        _JOBS[job_id] = job

    _persist_job(job)

    if _executor is None:
        raise RuntimeError("render executor not initialised — call init_executor() first")

    # Pass an immutable project snapshot to worker
    _executor.submit(_run_render_job, job_id, copy.deepcopy(project))
    log.info("enqueued render job %s for project %s", job_id, project_id)
    return job_id


# ── Worker ───────────────────────────────────────────────────────────────


def _run_render_job(job_id: str, project: dict) -> None:
    """Worker function — runs on a dedicated thread.

    Phase 1 (queued): materialise composition HTML + voiceover track + audio.
    Phase 2 (running): spawn npx hyperframes render, wait for exit.
    """
    from .config import RENDER_HF_WORKERS

    with _lock:
        job = _JOBS.get(job_id)
    if job is None:
        log.error("render job %s vanished before start", job_id)
        return

    # Honour cancel requested while queued
    with _lock:
        cancel_requested = job["_cancel_requested"]
    if cancel_requested:
        _finish(job_id, CANCELLED)
        return

    jdir = _job_dir(job_id)
    output_path = Path(job["output"])
    log_path = Path(job["log"])
    index_path = jdir / "index.html"

    # ── Phase 1: Materialise ────────────────────────────────────────────
    log.info("render %s materializing composition + voiceover", job_id)
    try:
        html = build_root_composition(project, name=f"export-{job_id}")
        voiceover_path = jdir / "voiceover.mp3"
        has_vo = _build_voiceover_track(project, job["project_id"], voiceover_path)
        if has_vo:
            total = _total_duration(project)
            html = _inject_voiceover_audio(html, total)
        index_path.write_text(html, encoding="utf-8")
    except Exception as exc:
        with contextlib.suppress(Exception):
            log_path.write_text(f"Materialization failed: {exc}\n", encoding="utf-8")
        _finish(job_id, FAILED, error=f"Materialization failed: {exc}")
        return

    # Check cancel after materialization
    with _lock:
        cancel_requested = job["_cancel_requested"]
    if cancel_requested:
        _finish(job_id, CANCELLED)
        return

    # ── Phase 2: Render ─────────────────────────────────────────────────
    _set_status(job_id, RUNNING)

    cmd = [
        "npx", "--yes", "hyperframes", "render",
        str(jdir),
        "--workers", str(RENDER_HF_WORKERS),
        "--output", str(output_path),
    ]
    log.info("render %s starting: %s", job_id, " ".join(cmd))

    log_file = None
    try:
        log_file = open(log_path, "w")  # noqa: SIM115 — lifetime tied to subprocess
        proc = subprocess.Popen(
            cmd,
            stdout=log_file,
            stderr=subprocess.STDOUT,
            cwd=str(jdir),
        )
        with _lock:
            job["_proc"] = proc

        rc = proc.wait()
    except FileNotFoundError as exc:
        _finish(job_id, FAILED, error=f"npx/hyperframes not found: {exc}")
        return
    except Exception as exc:
        _finish(job_id, FAILED, error=str(exc))
        return
    finally:
        if log_file is not None:
            with contextlib.suppress(Exception):
                log_file.close()

    # Honour cancel after subprocess exits
    with _lock:
        cancel_requested = job["_cancel_requested"]
    if cancel_requested:
        _finish(job_id, CANCELLED, exit_code=rc)
        return

    # Dual-condition success (legacy pattern: rc==0 AND output exists)
    if rc == 0 and output_path.is_file():
        _finish(job_id, DONE, exit_code=rc)
    else:
        err = f"exit code {rc}" if rc != 0 else "output file not produced"
        _finish(job_id, FAILED, exit_code=rc, error=err)


# ── Status mutations ─────────────────────────────────────────────────────


def _set_status(job_id: str, status: str) -> None:
    with _lock:
        job = _JOBS.get(job_id)
        if job is not None:
            job["status"] = status


def _finish(
    job_id: str,
    status: str,
    exit_code: int | None = None,
    error: str | None = None,
) -> None:
    with _lock:
        job = _JOBS.get(job_id)
        if job is None:
            return
        job["status"] = status
        job["ended_at"] = time.time()
        job["exit_code"] = exit_code
        job["error"] = error
        job["_proc"] = None
        snapshot = dict(job)
    log.info("render job %s -> %s", job_id, status)
    _persist_job(snapshot)


# ── Public API ───────────────────────────────────────────────────────────


def get_job(job_id: str) -> dict[str, Any] | None:
    """In-memory lookup + filesystem fallback for post-restart reconstruction."""
    with _lock:
        job = _JOBS.get(job_id)
    if job is not None:
        return _public(job)

    # Filesystem fallback
    mp4 = _jobs_dir() / job_id / "output.mp4"
    logf = _jobs_dir() / job_id / "render.log"
    if not mp4.is_file() and not logf.is_file():
        return None
    done = mp4.is_file()
    mtime = (mp4 if done else logf).stat().st_mtime
    return {
        "id": job_id,
        "project_id": "(unknown — pre-restart)",
        "status": DONE if done else FAILED,
        "output": str(mp4),
        "log": str(logf),
        "started_at": mtime,
        "ended_at": mtime,
        "exit_code": None,
        "error": None,
        "reconstructed": True,
    }


def cancel_job(job_id: str) -> dict[str, Any] | None:
    """Request cancellation. SIGTERM the subprocess if running."""
    with _lock:
        job = _JOBS.get(job_id)
        if job is None:
            return None
        job["_cancel_requested"] = True
        proc = job.get("_proc")
        status = job["status"]

    if status in _TERMINAL:
        with _lock:
            return _public(job) if job else None

    if proc is not None and proc.poll() is None:
        log.info("cancelling render %s (SIGTERM pid=%s)", job_id, proc.pid)
        with contextlib.suppress(ProcessLookupError):
            proc.terminate()

    # If still queued, the worker will check _cancel_requested before starting.
    return get_job(job_id)


def list_jobs(project_id: str | None = None, limit: int = 20) -> list[dict[str, Any]]:
    # Load disk jobs first (historical, survives restart)
    disk: list[dict[str, Any]] = []
    if project_id is not None:
        disk = _load_disk_jobs(project_id)

    # Merge with in-memory (memory takes priority for active jobs)
    with _lock:
        mem_jobs = {jid: _public(j) for jid, j in _JOBS.items()
                    if project_id is None or j.get("project_id") == project_id}

    merged: dict[str, dict[str, Any]] = {}
    for d in disk:
        merged[d["id"]] = d
    # In-memory overwrites disk (fresh status for active/recent jobs)
    for j in mem_jobs.values():
        merged[j["id"]] = j

    jobs = list(merged.values())
    jobs.sort(key=lambda j: j.get("started_at", 0), reverse=True)
    return jobs[:limit]


def read_job_log(job_id: str, tail_lines: int = 200) -> str:
    """Tail of the render log (ANSI-stripped)."""
    with _lock:
        job = _JOBS.get(job_id)
    path = Path(job["log"]) if job else None
    if path is None or not path.is_file():
        return ""
    text = path.read_text(encoding="utf-8", errors="replace")
    text = _ANSI_RE.sub("", text)
    lines = text.splitlines()
    if len(lines) > tail_lines:
        lines = lines[-tail_lines:]
    return "\n".join(lines)


# ── Helpers ──────────────────────────────────────────────────────────────

_ANSI_RE = re.compile(r"\x1b\[[0-9;?]*[A-Za-z]|\x1b\][^\x07]*\x07|\x1b.|\r")

_INTERNAL_KEYS = frozenset({"_proc", "_cancel_requested"})


def _public(job: dict[str, Any]) -> dict[str, Any]:
    return {k: v for k, v in job.items() if k not in _INTERNAL_KEYS}


# ── Voiceover track builder ──────────────────────────────────────────────


def _build_voiceover_track(project: dict, project_id: str, output: Path) -> bool:
    """Concatenate per-slide audio into a single voiceover.mp3.

    Each slide gets ``slide.duration`` seconds. If the slide has TTS audio,
    it plays at the start; the remainder is silence. If no slide has audio,
    returns ``False`` and writes nothing.

    Uses ffmpeg for silence generation + concatenation.
    """
    from .store import _slide_dir

    root = project.get("root", {})
    slide_ids: list[str] = root.get("slides", [])
    slides: dict = project.get("slides", {})

    # Collect per-slide audio info
    segments: list[tuple[Path | None, float]] = []  # (audio_file or None, slide_duration)
    any_audio = False

    for sid in slide_ids:
        slide = slides.get(sid, {})
        duration = float(slide.get("duration", 5.0))
        sdir = _slide_dir(project_id, sid)
        meta_path = sdir / "audio.json"

        audio_file: Path | None = None
        if meta_path.is_file():
            with contextlib.suppress(json.JSONDecodeError, OSError):
                meta = json.loads(meta_path.read_text(encoding="utf-8"))
                thash = meta.get("textHash", "")
                if thash:
                    candidate = sdir / f"audio-{thash}.mp3"
                    if candidate.is_file():
                        audio_file = candidate
                        any_audio = True

        segments.append((audio_file, duration))

    if not any_audio:
        return False

    with tempfile.TemporaryDirectory() as tmpdir:
        tmp = Path(tmpdir)
        concat_entries: list[str] = []

        for idx, (audio_file, duration) in enumerate(segments):
            seg = tmp / f"seg_{idx:03d}.mp3"
            if audio_file is not None:
                # Pad/trim audio to the slide duration
                subprocess.run(
                    [
                        "ffmpeg", "-y", "-i", str(audio_file),
                        "-af", f"apad=whole_dur={duration:.3f},atrim=duration={duration:.3f}",
                        "-c:a", "libmp3lame", "-ar", "44100", "-b:a", "128k",
                        str(seg),
                    ],
                    capture_output=True,
                    check=True,
                )
            else:
                # Generate silence for this slide
                subprocess.run(
                    [
                        "ffmpeg", "-y",
                        "-f", "lavfi",
                        "-i", "anullsrc=channel_layout=mono:sample_rate=44100",
                        "-t", f"{duration:.3f}",
                        "-c:a", "libmp3lame", "-ar", "44100", "-b:a", "128k",
                        str(seg),
                    ],
                    capture_output=True,
                    check=True,
                )
            concat_entries.append(str(seg))

        # Concat all segments
        list_file = tmp / "concat.txt"
        list_file.write_text(
            "\n".join(f"file '{f}'" for f in concat_entries),
            encoding="utf-8",
        )
        subprocess.run(
            [
                "ffmpeg", "-y",
                "-f", "concat", "-safe", "0",
                "-i", str(list_file),
                "-c:a", "libmp3lame", "-ar", "44100", "-b:a", "128k",
                str(output),
            ],
            capture_output=True,
            check=True,
        )

    return True


def _total_duration(project: dict) -> float:
    """Sum of all slide durations (matches build_root_composition's total)."""
    root = project.get("root", {})
    slides: dict = project.get("slides", {})
    total = 0.0
    for sid in root.get("slides", []):
        total += float(slides.get(sid, {}).get("duration", 5.0))
    return max(total, 0.1)


def _inject_voiceover_audio(html: str, total_duration: float) -> str:
    """Inject ``<audio>`` with HF-native ``data-start``/``data-duration`` attributes.

    HyperFrames owns media playback when these attributes are present — no
    imperative JS play/pause/seek needed. HF plays the audio at ``data-start``
    and stops at ``data-duration`` during render, keeping preview and render
    deterministic.
    """
    audio_tag = (
        f'  <audio id="voiceover" src="voiceover.mp3" data-start="0"'
        f' data-duration="{total_duration:.1f}" hidden></audio>'
    )
    return html.replace("</body>", f"{audio_tag}\n</body>", 1)
