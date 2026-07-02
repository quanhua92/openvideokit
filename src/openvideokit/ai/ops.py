"""EditOp — the canonical mutation shape.

This is a **faithful Python mirror** of ``ovk-web/src/shared/edit/EditBus.ts``
(``EditOp`` union) and ``ovk-web/src/shared/edit/ops.ts`` (creators). The JSON
emitted by the AI agent uses **camelCase** keys identical to the frontend so
that ``editBus.dispatch(op)`` consumes it with no translation.

The frontend ``EditBus`` is the single mutation path; the AI agent never
writes the document — it emits these ops as proposals, and the human Accepts
them in the AIDock, which dispatches them through the same bus a human edit
uses. This keeps undo/redo, lint gates, and SSE sync working uniformly.

Op-shape parity is asserted by tests in ``tests/ai/test_ops.py`` against the
TypeScript source in ``ovk-web/src/shared/edit/EditBus.ts``.
"""

from __future__ import annotations

from typing import Any, Literal, TypedDict

# ── Op shapes (one per kind in the frontend EditOp union) ────────────────


class SetField(TypedDict):
    kind: Literal["setField"]
    slideId: str
    fieldId: str
    value: str


class ReorderSlides(TypedDict):
    kind: Literal["reorderSlides"]
    order: list[str]


class AddSlide(TypedDict):
    newId: str
    layoutId: str
    afterId: str | None
    kind: Literal["addSlide"]


class RemoveSlide(TypedDict):
    kind: Literal["removeSlide"]
    slideId: str


class DuplicateSlide(TypedDict):
    kind: Literal["duplicateSlide"]
    slideId: str
    newId: str


class SetTransition(TypedDict):
    kind: Literal["setTransition"]
    slideId: str
    transition: dict[str, Any] | None


class SetAsset(TypedDict):
    kind: Literal["setAsset"]
    slideId: str
    fieldId: str
    ref: str


class SetVoiceover(TypedDict):
    kind: Literal["setVoiceover"]
    slideId: str
    text: str | None
    voice: str | None
    rate: str | None
    pitch: str | None
    volume: str | None


class SetDuration(TypedDict):
    kind: Literal["setDuration"]
    slideId: str
    duration: float


class SetCaptionStyle(TypedDict):
    kind: Literal["setCaptionStyle"]
    style: str


class SetCaptionSettings(TypedDict):
    kind: Literal["setCaptionSettings"]
    settings: dict[str, Any]


class SetSlideHtml(TypedDict):
    kind: Literal["setSlideHtml"]
    slideId: str
    html: str


EditOp = (
    SetField
    | ReorderSlides
    | AddSlide
    | RemoveSlide
    | DuplicateSlide
    | SetTransition
    | SetAsset
    | SetVoiceover
    | SetDuration
    | SetCaptionStyle
    | SetCaptionSettings
    | SetSlideHtml
)


# ── Creators — mirror ovk-web/src/shared/edit/ops.ts ─────────────────────


def set_field(slide_id: str, field_id: str, value: str) -> SetField:
    return {"kind": "setField", "slideId": slide_id, "fieldId": field_id, "value": value}


def reorder_slides(order: list[str]) -> ReorderSlides:
    return {"kind": "reorderSlides", "order": list(order)}


def add_slide(new_id: str, layout_id: str, after_id: str | None = None) -> AddSlide:
    return {"kind": "addSlide", "newId": new_id, "layoutId": layout_id, "afterId": after_id}


def remove_slide(slide_id: str) -> RemoveSlide:
    return {"kind": "removeSlide", "slideId": slide_id}


def duplicate_slide(slide_id: str, new_id: str) -> DuplicateSlide:
    return {"kind": "duplicateSlide", "slideId": slide_id, "newId": new_id}


def set_transition(
    slide_id: str, transition: dict[str, Any] | None
) -> SetTransition:
    return {"kind": "setTransition", "slideId": slide_id, "transition": transition}


def set_asset(slide_id: str, field_id: str, ref: str) -> SetAsset:
    return {"kind": "setAsset", "slideId": slide_id, "fieldId": field_id, "ref": ref}


def set_voiceover(
    slide_id: str,
    *,
    text: str | None = None,
    voice: str | None = None,
    rate: str | None = None,
    pitch: str | None = None,
    volume: str | None = None,
) -> SetVoiceover:
    return {
        "kind": "setVoiceover",
        "slideId": slide_id,
        "text": text,
        "voice": voice,
        "rate": rate,
        "pitch": pitch,
        "volume": volume,
    }


def set_duration(slide_id: str, duration: float) -> SetDuration:
    return {"kind": "setDuration", "slideId": slide_id, "duration": duration}


def set_caption_style(style: str) -> SetCaptionStyle:
    return {"kind": "setCaptionStyle", "style": style}


def set_caption_settings(settings: dict[str, Any]) -> SetCaptionSettings:
    return {"kind": "setCaptionSettings", "settings": settings}


def set_slide_html(slide_id: str, html: str) -> SetSlideHtml:
    return {"kind": "setSlideHtml", "slideId": slide_id, "html": html}


# ── Proposal payload ────────────────────────────────────────────────────


class EditProposalPayload(TypedDict):
    """The ``edit`` field of a ``proposal`` SSE event.

    ``ops`` is a list of EditOp (each a camelCase dict matching the frontend
    union). ``slideId`` is optional context for the UI badge (the primary
    slide touched); omitted for root-level ops.
    """

    id: str
    ops: list[dict[str, Any]]
    rationale: str
    slideId: str | None
