"""Section: the bare-<template> HTML contract (R1–R4)."""

from __future__ import annotations

SECTION = """# Slide HTML contract (Tier-2 / set_slide_html)

When you author or rewrite a slide's `index.html` with set_slide_html, the
result MUST pass these lint rules (R1–R5). A failing proposal is rejected
before the user ever sees it:

- **R1** — exactly one `<template>` element (not zero, not two).
- **R2** — no `<html>`, `<head>`, or `<body>` outside the `<template>`. HF's
  runtime only extracts `<template>` content; a wrapper renders blank (v0.7.3).
- **R3** — the `<template>` content must contain a `data-composition-id`
  attribute. Use the structural token `__OVK_SLIDE_ID__` as its value.
- **R4** — no Tailwind (no `cdn.tailwindcss.com`, no `@tailwind`, no `@apply`).
  Use vanilla CSS + GSAP only.
- **R5** — every `__OVK_*__` token must be a known field id (title, body,
  caption, …), the structural `__OVK_SLIDE_ID__`, or an
  `__OVK_CUSTOM_*__` escape hatch. Legacy bare `__TITLE__` tokens are rejected.

Vertical centering: prefer the HyperFrames pattern `text-align: center` +
`padding-top: XXvh` over flex/absolute centering, which HF's sub-comp mounting
context does not reliably support. The host div wrapping each slide needs
`position:absolute; inset:0;`."""
