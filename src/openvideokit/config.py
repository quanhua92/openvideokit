"""Runtime configuration for the ovk server.

All values are overridable via env vars so the same code runs in dev and prod.
"""

from __future__ import annotations

import os

HOST = os.environ.get("OVK_HOST", "127.0.0.1")
PORT = int(os.environ.get("OVK_PORT", "8000"))

# Where generated audio + assets are written.
DATA_DIR = os.environ.get("OVK_DATA_DIR", "data")

# Dev origins — the Vite dev server proxies /api here, but CORS is still
# useful when the SPA talks to the API directly.
CORS_ORIGINS = [
    "http://localhost:3000",
    "http://localhost:5173",
    "http://127.0.0.1:3000",
]
