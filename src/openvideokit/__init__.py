"""OpenVideoKit — deterministic video templating pipeline.

Public API:
    from openvideokit import app        # FastAPI instance
    python -m openvideokit              # run the server
"""

from __future__ import annotations

from .app import app  # noqa: F401  (re-export)
from .config import ensure_data_dirs  # noqa: F401

__version__ = "0.1.0"
__all__ = ["app", "ensure_data_dirs", "__version__"]
