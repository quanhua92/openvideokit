"""Integration test for the POST /api/projects/{id}/ai/chat SSE route.

Uses FastAPI's TestClient with the agent's run_agent monkeypatched to a fake
async generator — no real LLM. Asserts the route returns text/event-stream
with correctly framed SSE events.
"""

from __future__ import annotations

import json

from fastapi.testclient import TestClient


def _parse_stream(text: str) -> list[dict]:
    events = []
    for block in text.split("\n\n"):
        block = block.strip()
        if not block or block.startswith(":"):
            continue
        if block.startswith("data:"):
            events.append(json.loads(block[5:].strip()))
    return events


class TestAiChatRoute:
    def test_returns_event_stream(self, tmp_path, monkeypatch):
        from openvideokit import config as ovk_config
        from openvideokit import store
        from openvideokit.ai import server

        monkeypatch.setattr(ovk_config, "DATA_DIR", str(tmp_path))
        monkeypatch.setattr(store, "_DATA_PATH", tmp_path)
        store._STORE = {}
        store.init_store()

        # Fake the agent: yield one proposal + done.
        async def fake_run(messages, ctx, *, model=None):
            yield 'data: {"type":"proposal","edit":{"id":"p1","ops":[{"kind":"setField","slideId":"slide-0","fieldId":"title","value":"Hi"}],"rationale":"r","slideId":"slide-0"}}\n\n'
            yield 'data: {"type":"done"}\n\n'

        monkeypatch.setattr(server, "run_agent", fake_run)

        from openvideokit.app import app

        client = TestClient(app)
        resp = client.post(
            "/api/projects/proj-1/ai/chat",
            json={"messages": [{"role": "user", "content": "hi"}], "activeSlideId": "slide-0"},
        )
        assert resp.status_code == 200
        assert "text/event-stream" in resp.headers.get("content-type", "")
        events = _parse_stream(resp.text)
        types = [e["type"] for e in events]
        assert types[0] == "open"
        assert "proposal" in types
        assert types[-1] == "done"
        prop = next(e for e in events if e["type"] == "proposal")
        assert prop["edit"]["ops"][0]["kind"] == "setField"

    def test_missing_messages_400(self, tmp_path, monkeypatch):
        from openvideokit import config as ovk_config
        from openvideokit import store

        monkeypatch.setattr(ovk_config, "DATA_DIR", str(tmp_path))
        monkeypatch.setattr(store, "_DATA_PATH", tmp_path)
        store._STORE = {}
        store.init_store()

        from openvideokit.app import app

        client = TestClient(app)
        resp = client.post("/api/projects/proj-1/ai/chat", json={})
        assert resp.status_code == 400

    def test_unknown_project_404(self, tmp_path, monkeypatch):
        from openvideokit import config as ovk_config
        from openvideokit import store

        monkeypatch.setattr(ovk_config, "DATA_DIR", str(tmp_path))
        monkeypatch.setattr(store, "_DATA_PATH", tmp_path)
        store._STORE = {}
        store.init_store()

        from openvideokit.app import app

        client = TestClient(app)
        resp = client.post(
            "/api/projects/does-not-exist/ai/chat",
            json={"messages": [{"role": "user", "content": "hi"}]},
        )
        assert resp.status_code == 404
