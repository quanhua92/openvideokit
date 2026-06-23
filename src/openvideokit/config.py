"""Configuration: paths, ports, global registries.

All paths are overridable via environment variables so the same code
runs in dev (project root) and prod (Docker, /data, etc.) without edits.

  OVK_BASE_DIR       — project root (defaults to CWD)
  OVK_TEMPLATES_DIR  — read-only template projects (defaults to <base>/templates)
  OVK_SESSIONS_DIR   — per-edit session copies (defaults to <base>/sessions)
  OVK_JOBS_DIR       — render outputs and logs (defaults to <base>/jobs)
  OVK_PORT           — HTTP port (defaults to 8765)
  OVK_RENDER_WORKERS — parallel Chrome workers per render (defaults to 3)
"""

from __future__ import annotations

import os
from pathlib import Path
from typing import Any

BASE_DIR = Path(os.environ.get("OVK_BASE_DIR", Path.cwd())).resolve()
TEMPLATES_DIR = Path(os.environ.get("OVK_TEMPLATES_DIR", BASE_DIR / "templates")).resolve()
SESSIONS_DIR = Path(os.environ.get("OVK_SESSIONS_DIR", BASE_DIR / "sessions")).resolve()
JOBS_DIR = Path(os.environ.get("OVK_JOBS_DIR", BASE_DIR / "jobs")).resolve()

PORT = int(os.environ.get("OVK_PORT", "8765"))
RENDER_WORKERS = os.environ.get("OVK_RENDER_WORKERS", "3")

# In-memory job tracker. Swap for Redis/DB in multi-process deployments.
JOBS: dict[str, dict[str, Any]] = {}


def ensure_data_dirs() -> None:
    """Create runtime data directories if missing."""
    SESSIONS_DIR.mkdir(parents=True, exist_ok=True)
    JOBS_DIR.mkdir(parents=True, exist_ok=True)
