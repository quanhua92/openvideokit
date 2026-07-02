"""Shared fixtures for the AI tests.

- ``ctx`` — an OVKContext over the seed fixture project on a tmp_path data dir.
- ``ctx_on_disk`` — same but the project is actually written to disk (for read
  tools that hit files).
- ``FakeToolModel`` — a BaseChatModel that returns canned AIMessages and
  supports ``bind_tools`` (no-op), so the agent loop runs with no real LLM.
"""

from __future__ import annotations

from typing import Any

import pytest
from langchain_core.language_models.chat_models import BaseChatModel
from langchain_core.messages import AIMessage
from langchain_core.outputs import ChatGeneration, ChatResult

from openvideokit.ai.context import OVKContext
from openvideokit.seed import fixture_project


class FakeToolModel(BaseChatModel):
    """Returns canned AIMessages in order; supports bind_tools (returns self).

    Set ``scripted`` to the sequence of AIMessages the model should emit. The
    agent loop will call tools between them automatically.
    """

    scripted: list = []

    # pydantic v2 private attr counter
    def __init__(self, **kwargs):  # noqa: D401
        super().__init__(**kwargs)
        object.__setattr__(self, "_i", 0)

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        return self._gen()

    async def _agenerate(self, messages, stop=None, run_manager=None, **kwargs):
        return self._gen()

    def _gen(self) -> ChatResult:
        i = object.__getattribute__(self, "_i")
        msgs: list[AIMessage] = list(self.scripted)
        msg = msgs[i] if i < len(msgs) else AIMessage(content="Done.")
        object.__setattr__(self, "_i", i + 1)
        return ChatResult(generations=[ChatGeneration(message=msg)])

    def bind_tools(self, tools, **kwargs):  # type: ignore[override]
        return self

    @property
    def _llm_type(self) -> str:
        return "fake-tool"

    @property
    def _identifying_params(self) -> dict[str, Any]:
        return {}


@pytest.fixture
def ctx(tmp_path, monkeypatch) -> OVKContext:
    """Context over the in-memory fixture (no disk writes)."""
    from openvideokit import config as ovk_config

    monkeypatch.setattr(ovk_config, "DATA_DIR", str(tmp_path))
    return OVKContext(
        project_id="proj-1",
        project=fixture_project(),
        active_slide_id="slide-0",
    )


@pytest.fixture
def ctx_on_disk(tmp_path, monkeypatch) -> OVKContext:
    """Context whose fixture project is materialized to tmp_path (for read tools)."""
    from openvideokit import config as ovk_config
    from openvideokit import store

    monkeypatch.setattr(ovk_config, "DATA_DIR", str(tmp_path))
    monkeypatch.setattr(store, "_DATA_PATH", tmp_path)
    store._STORE = {}
    store.init_store()  # writes proj-1 to disk
    project = store.get_project("proj-1") or fixture_project()
    return OVKContext(project_id="proj-1", project=project, active_slide_id="slide-0")


@pytest.fixture
def make_fake_model():
    """Factory fixture: returns the FakeToolModel class for tests to construct.

    Usage: ``model = make_fake_model(scripted=[AIMessage(...)])``
    """
    return FakeToolModel
