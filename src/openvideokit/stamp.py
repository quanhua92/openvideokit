"""Stamp `__OVK_*__` tokens into HTML — the schema-first data binding.

Python's `str.replace` is literal (no `$` interpretation), so it is safe by
default — the JS `$&`/`$$` trap does not apply here. Values are html-escaped
to prevent injection. See docs/web/templates.md for the token convention.
"""

from __future__ import annotations

import html
from collections.abc import Mapping

_PREFIX = "__OVK_"
_SUFFIX = "__"


def placeholder_for(field_id: str) -> str:
    """field id → token. e.g. `title` → `__OVK_TITLE__`."""
    return f"{_PREFIX}{field_id.upper()}{_SUFFIX}"


def stamp(html_src: str, field_id: str, value: str) -> str:
    """Replace every `__OVK_<FIELD_ID>__` occurrence with the (escaped) value."""
    return html_src.replace(placeholder_for(field_id), html.escape(value))


def stamp_many(html_src: str, values: Mapping[str, str]) -> str:
    """Stamp a whole mapping at once. Slide ids are safe to escape (no-op)."""
    out = html_src
    for field_id, value in values.items():
        out = stamp(out, field_id, str(value))
    return out
