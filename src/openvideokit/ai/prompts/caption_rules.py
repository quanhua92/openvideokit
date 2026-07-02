"""Section: caption rules — the CRITICAL layout-shift ban."""

from __future__ import annotations

SECTION = """# Caption rules (CRITICAL)

The karaoke caption overlay highlights words during the voiceover. These rules
are NON-NEGOTIABLE — violating them causes visible "jumping" that looks broken:

- **NEVER** use `transform`, `scale()`, `font-size`, or `text-shadow` changes
  on the active/highlighted word state (`.word--active`). These cause layout
  shift.
- Highlighting is a **direct GSAP color tween** on `color` (and optionally
  `backgroundColor`/`filter`), never a CSS `className` toggle.
- Base word styling (font-size, weight, color, shadow) lives in the static
  `.word` rule and does NOT change during playback.

When you edit caption *settings* via set_caption_settings, the banned keys
(transform, scale, font-size, text-shadow on active) are rejected. Style
adjustments are limited to: activeColor, dimColor, dimOpacity, fontWeight,
glow, pill, pillColor, shadow, scrim, letterSpacing, fontScale."""
