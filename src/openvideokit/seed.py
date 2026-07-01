"""In-memory seed project — ported from ovk-web's MSW fixture.

Holds ONE project so `ovk serve` has something to show without any disk I/O.
The slideHtml uses `__OVK_*__` tokens (already migrated) and a GSAP entrance
timeline so the `<hyperframes-player>` preview actually animates.
"""

from __future__ import annotations

PROJECT_ID = "proj-1"
PROJECT_NAME = "Eco Bottle Campaign"


def _slide_html(bg: str, body_color: str, accent: str) -> str:
    """A bare <template> sub-composition with a GSAP staggered entrance."""
    return f"""<template>
  <div data-composition-id="__OVK_SLIDE_ID__" data-width="1920" data-height="1080">
    <div class="content">
      <h1>__OVK_TITLE__</h1>
      <p>__OVK_BODY__</p>
      <div class="accent"></div>
    </div>
    <style>
      [data-composition-id="__OVK_SLIDE_ID__"] {{ background: {bg}; }}
      [data-composition-id="__OVK_SLIDE_ID__"] .content {{ text-align: center; padding-top: 38vh; }}
      [data-composition-id="__OVK_SLIDE_ID__"] h1 {{
        font-size: 120px; font-weight: 900; color: #ffffff;
        letter-spacing: -0.03em; line-height: 1.05; margin: 0;
      }}
      [data-composition-id="__OVK_SLIDE_ID__"] p {{
        font-size: 52px; font-weight: 600; color: {body_color};
        margin-top: 32px; letter-spacing: -0.01em;
      }}
      [data-composition-id="__OVK_SLIDE_ID__"] .accent {{
        width: 100px; height: 5px; border-radius: 3px;
        background: {accent}; margin: 40px auto 0;
      }}
    </style>
    <script>
      var tl = gsap.timeline({{ paused: true }});
      tl.from('[data-composition-id="__OVK_SLIDE_ID__"] .content > *',
        {{ opacity: 0, y: 40, duration: 0.4, stagger: 0.1, ease: 'power3.out' }});
      window.__timelines['__OVK_SLIDE_ID__'] = tl;
    </script>
  </div>
</template>"""


def fixture_project() -> dict:
    """The single in-memory ProjectBundle."""
    return {
        "root": {
            "version": 1,
            "canvas": {"width": 1920, "height": 1080, "fps": 30},
            "theme": {
                "caption_style": "highlight",
                "colors": {"primary": "#0a0a14", "accent": "#4ade80"},
                "fonts": {"heading": "Inter", "body": "Inter"},
            },
            "audio": {
                "music": {"asset": "", "volume": 0.0, "loop": False},
                "voiceover": {"asset": "", "auto_generated": False},
            },
            "captions": {
                "preset": "highlight",
                "activeColor": "#ffea00",
                "pillColor": "#0a0a14",
                "dimColor": "#ffffff",
                "dimOpacity": 0.5,
                "fontWeight": 900,
                "glow": 0,
                "pill": True,
                "shadow": False,
                "scrim": False,
                "letterSpacing": -0.02,
                "fontScale": 1,
            },
            "transition_default": {"type": "fade", "duration": 0.4},
            "slides": ["slide-0", "slide-1", "slide-2"],
        },
        "slides": {
            "slide-0": {
                "id": "slide-0",
                "duration": 5.0,
                "fields": {
                    "title": "Eco Bottle",
                    "body": "A reusable bottle made from ocean plastic.",
                },
                "assets": {},
                "voiceover": {
                    "text": "Meet the Eco Bottle. Reusable, durable, and made from reclaimed ocean plastic.",
                    "voice": "en-US-AriaNeural",
                },
            },
            "slide-1": {
                "id": "slide-1",
                "duration": 5.0,
                "fields": {
                    "title": "Why It Matters",
                    "body": "Every year, 8 million tons of plastic enter our oceans.",
                },
                "assets": {},
                "voiceover": {
                    "text": "Why does it matter? Eight million tons of plastic enter our oceans every single year.",
                    "voice": "en-US-AriaNeural",
                },
            },
            "slide-2": {
                "id": "slide-2",
                "duration": 5.0,
                "fields": {
                    "title": "Join Us",
                    "body": "Visit eco-bottle.example to learn more.",
                },
                "assets": {},
                "voiceover": {
                    "text": "Join us today at eco-bottle.example to learn more.",
                    "voice": "en-US-AriaNeural",
                },
            },
        },
        "slideHtml": {
            "slide-0": _slide_html(
                "#0a0a14", "#a5b4fc", "linear-gradient(90deg, #818cf8, #c084fc)"
            ),
            "slide-1": _slide_html(
                "#0d1b2a", "#4ade80", "linear-gradient(90deg, #4ade80, #34d399)"
            ),
            "slide-2": _slide_html(
                "#1a0a2e", "#fbbf24", "linear-gradient(90deg, #f59e0b, #fbbf24)"
            ),
        },
    }
