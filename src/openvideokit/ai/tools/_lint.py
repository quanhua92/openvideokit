"""Bare-<template> HTML lint — faithful port of ovk-web lintHtml.ts (R1–R5).

Rules (first failing rule wins):
  R1: exactly one <template>
  R2: no <html>/<head>/<body> outside <template>
  R3: extracted content has data-composition-id
  R4: no Tailwind (cdn.tailwindcss.com / @tailwind / @apply)
  R5: every __OVK_*__ token is a known field id, the structural token, or
      an __OVK_CUSTOM_*__ escape hatch

Tested in tests/ai/test_lint.py against the same cases as the TS suite.
"""

from __future__ import annotations

import re
from typing import Literal

# Known field ids — mirrors ovk-web/src/shared/api/schemas/fields.json.
SCHEMA_KEYS = {
    "title", "body", "caption", "quote", "name", "step", "url", "cta",
    "bg_color", "accent", "image", "logo", "avatar", "video", "audio",
    "bg_image",
}

OVK = "__OVK_"
STRUCTURAL_TOKEN = "__OVK_SLIDE_ID__"

_RULE_ID = Literal["R1", "R2", "R3", "R4", "R5"]


class LintResult:
    __slots__ = ("ok", "fired_rule_id", "fired_rule_message")

    def __init__(self, ok: bool, rule_id: _RULE_ID | None = None, message: str = "") -> None:
        self.ok = ok
        self.fired_rule_id = rule_id
        self.fired_rule_message = message

    def __repr__(self) -> str:
        if self.ok:
            return "LintResult(ok=True)"
        return f"LintResult(ok=False, {self.fired_rule_id}: {self.fired_rule_message})"


def count_tag(src: str, tag: str) -> int:
    """Count opening tags (case-insensitive, naive scan)."""
    return len(re.findall(rf"<{tag}\s*/?>", src, flags=re.IGNORECASE))


def extract_template_content(src: str) -> str:
    """Inner content of the first <template>…</template>."""
    m = re.search(r"<template[\s>]", src, flags=re.IGNORECASE)
    if not m:
        return ""
    start = m.end()
    rest = src[start:]
    close = re.search(r"</template>", rest, flags=re.IGNORECASE)
    if not close:
        return ""
    return rest[: close.start()]


def has_html_wrapper(src: str) -> bool:
    """True if <html>/<head>/<body> appears OUTSIDE the <template>."""
    tstart = re.search(r"<template[\s>]", src, flags=re.IGNORECASE)
    tend = re.search(r"</template>", src, flags=re.IGNORECASE)
    before = src[: tstart.start()] if tstart else ""
    after = src[tend.end() :] if tend else ""
    outside = f"{before} {after}"
    return bool(
        re.search(r"<html[\s>]", outside, re.IGNORECASE)
        or re.search(r"<head[\s>]", outside, re.IGNORECASE)
        or re.search(r"<body[\s>]", outside, re.IGNORECASE)
    )


def has_attribute(inner: str, attr: str) -> bool:
    return bool(re.search(rf"{attr}\s*=", inner, flags=re.IGNORECASE))


def has_tailwind(src: str) -> bool:
    return bool(
        re.search(r"cdn\.tailwindcss\.com", src, re.IGNORECASE)
        or re.search(r"@tailwind\s", src)
        or re.search(r"@apply\s", src)
    )


_PLACEHOLDER_RE = re.compile(r"__[A-Z_][A-Z0-9_]*__")


def extract_placeholders(inner: str) -> list[str]:
    """All __UPPER_CASE__ tokens in the template content (deduped, in order)."""
    seen: dict[str, None] = {}
    for m in _PLACEHOLDER_RE.finditer(inner):
        seen.setdefault(m.group(0), None)
    return list(seen)


def _unknown_token_message(token: str) -> str | None:
    """None if valid; an error message otherwise."""
    if token == STRUCTURAL_TOKEN:
        return None
    if token.startswith("__OVK_CUSTOM_"):
        return None
    if token.startswith(OVK) and token.endswith("__"):
        field_id = token[len(OVK) : -2].lower()
        return (
            None
            if field_id in SCHEMA_KEYS
            else f"unknown field token {token} — not in schema.json and not __OVK_CUSTOM_*__"
        )
    return f"non-namespaced token {token} — use __OVK_<FIELD>__ (or __OVK_CUSTOM_<NAME>__)"


def lint_html(src: str) -> LintResult:
    """Run R1–R5 in order. Returns the first failing rule, or ok."""
    if src.strip() == "":
        return LintResult(ok=True)  # empty = clear override → template default

    # R1
    n = count_tag(src, "template")
    if n == 0:
        return LintResult(False, "R1", "missing <template> — slide HTML must be a bare <template>")
    if n > 1:
        return LintResult(False, "R1", f"expected 1 <template>, found {n}")

    # R2
    if has_html_wrapper(src):
        return LintResult(
            False,
            "R2",
            "<html>/<head>/<body> found outside <template> — HF renders wrapped templates blank (v0.7.3)",
        )

    # R3
    inner = extract_template_content(src)
    if not has_attribute(inner, "data-composition-id"):
        return LintResult(False, "R3", "missing data-composition-id in <template> content")

    # R4
    if has_tailwind(src):
        return LintResult(
            False, "R4", "Tailwind detected — use vanilla CSS + GSAP in composition HTML (RFC §16)"
        )

    # R5
    for token in extract_placeholders(inner):
        msg = _unknown_token_message(token)
        if msg:
            return LintResult(False, "R5", msg)

    return LintResult(ok=True)
