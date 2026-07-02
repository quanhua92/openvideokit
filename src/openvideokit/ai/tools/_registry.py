"""Shared helpers for tool construction.

Each tool module exports a ``build(ctx) -> BaseTool`` factory. The factory
closes over ctx and returns a langchain tool whose return value is either:
  - a plain string (read tools / errors), or
  - a JSON-serializable payload describing the EditOp(s) to propose.

The agent runner inspects tool results for an ``"_ovk_ops"`` key and, when
present, emits them as proposal events. Tools that only return strings produce
no proposal.
"""

from __future__ import annotations

import json
from typing import TYPE_CHECKING, Any

from langchain_core.tools import StructuredTool

if TYPE_CHECKING:
    from ..context import OVKContext


def ops_result(
    ops: list[dict[str, Any]],
    *,
    rationale: str,
    slide_id: str | None = None,
) -> str:
    """The marker payload an OVK tool returns to signal a proposal.

    The agent runner decodes this and emits a ``proposal`` SSE event carrying
    the ops. Returning it as a JSON string keeps the tool's langchain contract
    simple (tools return strings) while carrying structured data out.
    """
    return json.dumps(
        {
            "_ovk_ops": ops,
            "rationale": rationale,
            "slideId": slide_id,
        },
        ensure_ascii=False,
    )


def is_ops_result(text: Any) -> dict[str, Any] | None:
    """Decode an ops-result payload, or return None if it isn't one."""
    if not isinstance(text, str) or "_ovk_ops" not in text:
        return None
    try:
        return json.loads(text)
    except (json.JSONDecodeError, TypeError):
        return None


def tool(name: str, description: str, args_schema: type):
    """Decorator factory binding a fn + schema into a StructuredTool factory.

    Usage in a tool module::

        class _Args(BaseModel):
            slide_id: str = Field(description="...")
            value: str

        def build(ctx: OVKContext) -> BaseTool:
            def run(slide_id: str, value: str) -> str:
                ...
                return ops_result([op], rationale="...")
            return StructuredTool.from_function(run, name=name, description=description, args_schema=_Args)
    """

    def decorator(fn):
        def build(ctx: OVKContext) -> StructuredTool:
            bound = make_bound(fn, ctx)
            return StructuredTool.from_function(
                bound,
                name=name,
                description=description,
                args_schema=args_schema,
            )

        return build

    return decorator


def make_bound(fn, ctx: OVKContext):
    """Wrap fn so ctx is injected implicitly (curried)."""
    import functools

    @functools.wraps(fn)
    def wrapper(**kwargs):
        return fn(ctx, **kwargs)

    return wrapper
