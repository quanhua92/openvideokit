"""OKVContext — per-request context bound into every tool via closure.

Carries the read-only project snapshot the tools validate against + the ids
the agent's read tools resolve paths through. The agent itself is stateless
per request; this is the only per-request state.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from pathlib import Path
from typing import Any


@dataclass
class Pin:
    """A user-pinned reference injected into the prompt as context."""

    kind: str  # "slide" | "field" | "asset"
    value: str  # slideId / "slideId.fieldId" / asset ref


@dataclass
class OVKContext:
    project_id: str
    project: dict[str, Any]  # the bundle: {root, slides, slideHtml}
    active_slide_id: str | None = None
    pins: list[Pin] = field(default_factory=list)

    # ── Convenience accessors ────────────────────────────────────────────

    @property
    def root(self) -> dict[str, Any]:
        return self.project.get("root", {})

    @property
    def slides(self) -> dict[str, Any]:
        return self.project.get("slides", {})

    @property
    def slide_ids(self) -> list[str]:
        return list(self.root.get("slides", []))

    @property
    def project_dir(self) -> Path:
        from ..config import DATA_DIR

        return Path(DATA_DIR) / self.project_id

    def slide_dir(self, slide_id: str) -> Path:
        return self.project_dir / "slides" / slide_id

    def slide_exists(self, slide_id: str) -> bool:
        return slide_id in self.slides

    def slide_html(self, slide_id: str) -> str:
        return self.project.get("slideHtml", {}).get(slide_id, "")
