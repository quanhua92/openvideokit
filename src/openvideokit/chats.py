"""Chat persistence — JSONL-backed chat sessions per project.

Storage::

    {OVK_DATA_DIR}/{project_id}/chats/{chat_id}.jsonl

One JSON object per line. Three record types (discriminated by ``type``):

  - ``meta``      — first line, exactly one: {id, created_at}
  - ``message``   — a chat bubble (user / assistant / system)
  - ``resolution``— a proposal accept/reject record (not a bubble)

The file is append-only. ``read_chat`` parses the lines and reconciles each
assistant proposal's ``state`` from the resolution records so callers see a
clean, ready-to-render message list.

See ``docs/chat.md`` for the full contract.
"""

from __future__ import annotations

import contextlib
import json
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from .config import DATA_DIR

_DATA_PATH = Path(DATA_DIR)


def _chats_dir(project_id: str) -> Path:
    return _DATA_PATH / project_id / "chats"


def _chat_path(project_id: str, chat_id: str) -> Path:
    return _chats_dir(project_id) / f"{chat_id}.jsonl"


def _now_iso() -> str:
    return datetime.now(UTC).isoformat(timespec="seconds")


def _gen_id() -> str:
    return str(uuid.uuid4())


# ── Public API ───────────────────────────────────────────────────────────


def list_chats(project_id: str) -> list[dict[str, Any]]:
    """Return ``[{id, created_at}]`` newest-first. Empty list if none."""
    cdir = _chats_dir(project_id)
    if not cdir.is_dir():
        return []
    out: list[dict[str, Any]] = []
    for f in cdir.glob("*.jsonl"):
        meta = _read_meta(f)
        if meta:
            out.append(meta)
    out.sort(key=lambda m: m.get("created_at", ""), reverse=True)
    return out


def create_chat(project_id: str) -> dict[str, Any]:
    """Create an empty chat (writes the meta header); return {id, created_at}."""
    chat_id = _gen_id()
    created_at = _now_iso()
    path = _chat_path(project_id, chat_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    meta = {"type": "meta", "id": chat_id, "created_at": created_at}
    # New file — atomic write of the single meta line.
    path.write_text(json.dumps(meta, ensure_ascii=False) + "\n", encoding="utf-8")
    return {"id": chat_id, "created_at": created_at}


def read_chat(project_id: str, chat_id: str) -> dict[str, Any] | None:
    """Return ``{id, created_at, messages}`` with proposal states reconciled.

    ``None`` if the chat doesn't exist. Malformed lines are skipped (never raise).
    """
    path = _chat_path(project_id, chat_id)
    if not path.is_file():
        return None
    meta = _read_meta(path) or {"id": chat_id, "created_at": ""}
    messages: list[dict[str, Any]] = []
    resolutions: dict[str, str] = {}  # proposalId → state
    for rec in _iter_records(path):
        rtype = rec.get("type")
        if rtype == "message":
            messages.append(rec)
        elif rtype == "resolution":
            pid = rec.get("proposalId")
            state = rec.get("state")
            if pid and state:
                resolutions[pid] = state
    # Reconcile proposal states onto the messages.
    if resolutions:
        for m in messages:
            for p in m.get("proposals") or []:
                prop = p.get("proposal") or {}
                pid = prop.get("id")
                if pid in resolutions:
                    p["state"] = resolutions[pid]
    return {"id": meta["id"], "created_at": meta["created_at"], "messages": messages}


def append_record(project_id: str, chat_id: str, record: dict[str, Any]) -> None:
    """Append one record (message or resolution) as a single JSON line.

    Creates the chat dir if needed; does NOT create the meta header — the chat
    must exist (created via ``create_chat``).
    """
    path = _chat_path(project_id, chat_id)
    path.parent.mkdir(parents=True, exist_ok=True)
    # Single append (one write call) is atomic enough for our single-user cadence.
    with path.open("a", encoding="utf-8") as f:
        f.write(json.dumps(record, ensure_ascii=False) + "\n")


# ── Helpers ──────────────────────────────────────────────────────────────


def _read_meta(path: Path) -> dict[str, Any] | None:
    """Read the first line (meta) of a chat file."""
    try:
        first = path.read_text(encoding="utf-8").splitlines()[0]
    except (OSError, IndexError):
        return None
    with contextlib.suppress(json.JSONDecodeError):
        rec = json.loads(first)
        if rec.get("type") == "meta":
            return {"id": rec.get("id"), "created_at": rec.get("created_at", "")}
    return None


def _iter_records(path: Path):
    """Yield every parseable record after the meta line."""
    try:
        lines = path.read_text(encoding="utf-8").splitlines()
    except OSError:
        return
    for line in lines[1:]:
        if not line.strip():
            continue
        with contextlib.suppress(json.JSONDecodeError):
            yield json.loads(line)
