"""Runtime configuration for the ovk server.

All values are overridable via env vars so the same code runs in dev and prod.
A root ``.env`` is auto-loaded (via python-dotenv) at import time, so values
defined there behave exactly like real environment variables.
"""

from __future__ import annotations

import os
from pathlib import Path

# Load .env from the project root before any env var is read. Must run first.
from dotenv import load_dotenv

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

HOST = os.environ.get("OVK_HOST", "127.0.0.1")
PORT = int(os.environ.get("OVK_PORT", "8000"))

# Where generated audio + assets are written.
DATA_DIR = os.environ.get("OVK_DATA_DIR", "data")

# ── Render/export pipeline ───────────────────────────────────────────────
# Where render job dirs + output MP4s are written.
JOBS_DIR = os.environ.get("OVK_JOBS_DIR", str(Path(DATA_DIR) / "jobs"))

# Max concurrent render subprocesses (env-controlled — 1 or 2 for a laptop).
MAX_CONCURRENT_RENDERS = int(os.environ.get("OVK_MAX_CONCURRENT_RENDERS", "1"))

# Chrome workers PER render subprocess (passed to `hyperframes render --workers`).
RENDER_HF_WORKERS = int(os.environ.get("OVK_RENDER_HF_WORKERS", "3"))

# Dev origins — the Vite dev server proxies /api here, but CORS is still
# useful when the SPA talks to the API directly.
CORS_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
]
