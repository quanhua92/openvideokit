"""Tests for chats.py — JSONL persistence + proposal-state reconciliation."""

from __future__ import annotations

import json

import pytest

from openvideokit import chats


@pytest.fixture
def fresh(tmp_path, monkeypatch):
    """Point chats at a tmp data dir and seed a project folder."""
    monkeypatch.setattr(chats, "_DATA_PATH", tmp_path)
    (tmp_path / "proj-1" / "slides").mkdir(parents=True)
    return tmp_path


class TestCreateAndList:
    def test_create_returns_id_and_created_at(self, fresh):
        c = chats.create_chat("proj-1")
        assert c["id"]
        assert c["created_at"]
        # File exists with one meta line
        lines = (fresh / "proj-1" / "chats" / f"{c['id']}.jsonl").read_text().splitlines()
        assert len(lines) == 1
        assert json.loads(lines[0])["type"] == "meta"

    def test_list_empty_when_none(self, fresh):
        assert chats.list_chats("proj-1") == []

    def test_list_newest_first(self, fresh):
        a = chats.create_chat("proj-1")
        # Force a's created_at earlier by editing its meta line
        p = fresh / "proj-1" / "chats" / f"{a['id']}.jsonl"
        p.write_text(json.dumps({"type": "meta", "id": a["id"], "created_at": "2026-01-01T00:00:00+00:00"}) + "\n")
        b = chats.create_chat("proj-1")  # created_at = now (newer)
        listed = chats.list_chats("proj-1")
        assert [m["id"] for m in listed] == [b["id"], a["id"]]


class TestAppendAndRead:
    def test_append_message_then_read(self, fresh):
        c = chats.create_chat("proj-1")
        chats.append_record(
            "proj-1",
            c["id"],
            {"type": "message", "id": "u1", "role": "user", "content": "hi"},
        )
        chat = chats.read_chat("proj-1", c["id"])
        assert chat is not None
        assert len(chat["messages"]) == 1
        assert chat["messages"][0]["content"] == "hi"

    def test_read_nonexistent_is_none(self, fresh):
        assert chats.read_chat("proj-1", "nope") is None

    def test_malformed_line_skipped(self, fresh):
        c = chats.create_chat("proj-1")
        p = fresh / "proj-1" / "chats" / f"{c['id']}.jsonl"
        with p.open("a") as f:
            f.write("{this is not json\n")
            f.write(json.dumps({"type": "message", "id": "u1", "role": "user", "content": "ok"}) + "\n")
        chat = chats.read_chat("proj-1", c["id"])
        assert chat is not None
        assert len(chat["messages"]) == 1  # malformed skipped, good one kept


class TestResolutionReconciliation:
    def test_proposal_state_reconciled_from_resolution(self, fresh):
        c = chats.create_chat("proj-1")
        chats.append_record(
            "proj-1",
            c["id"],
            {
                "type": "message",
                "id": "a1",
                "role": "assistant",
                "content": "Sure.",
                "proposals": [
                    {"proposal": {"id": "prop-xx", "ops": []}, "state": "pending"}
                ],
            },
        )
        chats.append_record(
            "proj-1",
            c["id"],
            {"type": "resolution", "proposalId": "prop-xx", "state": "rejected"},
        )
        chat = chats.read_chat("proj-1", c["id"])
        assert chat["messages"][0]["proposals"][0]["state"] == "rejected"

    def test_unresolved_stays_pending(self, fresh):
        c = chats.create_chat("proj-1")
        chats.append_record(
            "proj-1",
            c["id"],
            {
                "type": "message",
                "id": "a1",
                "role": "assistant",
                "content": "Sure.",
                "proposals": [
                    {"proposal": {"id": "prop-yy", "ops": []}, "state": "pending"}
                ],
            },
        )
        chat = chats.read_chat("proj-1", c["id"])
        assert chat["messages"][0]["proposals"][0]["state"] == "pending"


class TestIsolation:
    def test_chats_scoped_per_project(self, fresh):
        a = chats.create_chat("proj-1")
        chats.create_chat("proj-1")
        # Another project
        (fresh / "proj-2").mkdir()
        chats.create_chat("proj-2")
        assert len(chats.list_chats("proj-1")) == 2
        assert len(chats.list_chats("proj-2")) == 1
        assert a["id"] not in [m["id"] for m in chats.list_chats("proj-2")]
