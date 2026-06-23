"""Render job management — spawns `hyperframes render` per session.

Each job runs in its own subprocess (Chrome + FFmpeg under the hood) and is
tracked in the in-memory JOBS registry. Swap for a real queue (Celery/RQ)
when you need persistence or multi-process workers.
"""

from __future__ import annotations

import re
import subprocess
import threading
import time
import uuid
from pathlib import Path
from typing import Any

from .config import JOBS, JOBS_DIR, RENDER_WORKERS, SESSIONS_DIR

# ANSI CSI sequences: \x1b[...X (colors, cursor moves, line clears)
_ANSI_CSI = re.compile(r"\x1b\[[0-9;?]*[a-zA-Z]")
# Bare escape character (without bracket) — rare but shows up in some terminal output
_ANSI_ESC = re.compile(r"\x1b.")
# Carriage returns used by progress bars to overwrite the same line
_CR = re.compile(r"\r+")


def strip_ansi(text: str) -> str:
    """Remove ANSI escape sequences, cursor control codes, and bare CRs.

    The HF render subprocess emits colored progress bars and cursor-hide/show
    sequences that look like garbage in a browser. This collapses them.
    """
    text = _ANSI_CSI.sub("", text)
    text = _ANSI_ESC.sub("", text)
    text = _CR.sub("", text)
    return text


def start_render(session_id: str) -> str:
    """Spawn a hyperframes render for a session. Returns job_id."""
    session_dir = SESSIONS_DIR / session_id
    if not session_dir.is_dir():
        raise FileNotFoundError(f"session '{session_id}' not found")

    job_id = uuid.uuid4().hex[:12]
    output_path = JOBS_DIR / f"{job_id}.mp4"
    log_path = JOBS_DIR / f"{job_id}.log"
    JOBS[job_id] = {
        "session_id": session_id,
        "status": "running",
        "output": str(output_path),
        "log": str(log_path),
        "started_at": time.time(),
    }

    cmd = [
        "npx", "--yes", "hyperframes", "render",
        str(session_dir),
        "--workers", str(RENDER_WORKERS),
        "--output", str(output_path),
    ]
    log_file = open(log_path, "w")  # noqa: SIM115 — lifetime tied to subprocess
    proc = subprocess.Popen(
        cmd, stdout=log_file, stderr=subprocess.STDOUT, cwd=session_dir
    )
    JOBS[job_id]["pid"] = proc.pid

    def _wait() -> None:
        rc = proc.wait()
        log_file.close()
        job = JOBS[job_id]
        job["ended_at"] = time.time()
        job["status"] = "done" if rc == 0 and output_path.is_file() else "failed"
        job["exit_code"] = rc

    threading.Thread(target=_wait, daemon=True).start()
    return job_id


def get_job(job_id: str) -> dict[str, Any] | None:
    """Look up a job. Falls back to filesystem reconstruction for historical jobs."""
    if job_id in JOBS:
        return JOBS[job_id]
    # Filesystem fallback: reconstruct from jobs/ dir (survives restarts)
    mp4 = JOBS_DIR / f"{job_id}.mp4"
    log = JOBS_DIR / f"{job_id}.log"
    if not mp4.is_file() and not log.is_file():
        return None
    done = mp4.is_file()
    mtime = (mp4 if done else log).stat().st_mtime
    return {
        "session_id": "(unknown — pre-restart)",
        "status": "done" if done else "failed",
        "output": str(mp4),
        "log": str(log),
        "started_at": mtime,
        "ended_at": mtime,
        "reconstructed": True,
    }


def job_elapsed_seconds(job: dict) -> int:
    return int(job.get("ended_at", time.time()) - job["started_at"])


def read_job_log(job_id: str) -> str:
    """Raw (ANSI-stripped) log text for a job."""
    job = get_job(job_id)
    if not job:
        return "(unknown job)"
    log_path = Path(job["log"])
    if not log_path.is_file():
        return "(no log yet)"
    return strip_ansi(log_path.read_text(errors="replace"))


def list_recent_jobs(limit: int = 12) -> list[dict]:
    """Recent jobs from the in-memory registry + filesystem (for historical persistence)."""
    jobs: list[dict] = []
    seen: set[str] = set()

    # In-memory (currently running or recently completed this session)
    for job_id, job in JOBS.items():
        output = Path(job["output"])
        jobs.append({
            "id": job_id,
            "session_id": job.get("session_id", "?"),
            "status": job["status"],
            "started_at": job["started_at"],
            "size": output.stat().st_size if output.is_file() else None,
        })
        seen.add(job_id)

    # Filesystem (historical renders that survived a restart)
    if JOBS_DIR.is_dir():
        for mp4 in JOBS_DIR.glob("*.mp4"):
            jid = mp4.stem
            if jid in seen:
                continue
            jobs.append({
                "id": jid,
                "session_id": "?",
                "status": "done",
                "started_at": mp4.stat().st_mtime,
                "size": mp4.stat().st_size,
            })
            seen.add(jid)

    jobs.sort(key=lambda j: j["started_at"], reverse=True)
    return jobs[:limit]


def format_size(n: int | None) -> str:
    if n is None:
        return "—"
    for unit in ("B", "KB", "MB", "GB"):
        if n < 1024:
            return f"{n:.0f} {unit}"
        n /= 1024
    return f"{n:.1f} TB"
