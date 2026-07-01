/**
 * Fixture project — RFC §5.2 root + RFC §5.3 slides.
 * 3 slides, caption_style 'highlight'. Used by tests and the AppShell
 * default-project link.
 */
import type { RootIndex } from "./schemas/rootIndex";
import type { SlideIndex } from "./schemas/slideIndex";

/** Deterministic 64-char hex string for SHA refs in fixtures (NOT a real SHA-256). */
function fakeSha(seed: string): string {
  // FNV-1a-ish hash → 64 hex chars by chaining 8 salted 32-bit hashes.
  // 8 × 8 hex chars per pass = 64 hex chars total.
  function fnv16(s: string): string {
    let h = 0x811c9dc5;
    for (let i = 0; i < s.length; i++) {
      h ^= s.charCodeAt(i);
      h = Math.imul(h, 0x01000193);
    }
    // Force positive 32-bit and hex-stringify (8 hex chars per pass).
    return (h >>> 0).toString(16).padStart(8, "0");
  }
  const hex =
    fnv16(`${seed}#1`) +
    fnv16(`${seed}#2`) +
    fnv16(`${seed}#3`) +
    fnv16(`${seed}#4`) +
    fnv16(`${seed}#5`) +
    fnv16(`${seed}#6`) +
    fnv16(`${seed}#7`) +
    fnv16(`${seed}#8`);
  return `sha256:${hex.toLowerCase()}`;
}

export const FIXTURE_PROJECT_ID = "proj-1";

export const fixtureRoot: RootIndex = {
  version: 1,
  canvas: { width: 1920, height: 1080, fps: 30 },
  theme: {
    caption_style: "highlight",
    colors: { primary: "#0a0a14", accent: "#4ade80" },
    fonts: { heading: "Geist", body: "Inter" },
  },
  audio: {
    music: {
      asset: fakeSha("music-bed"),
      volume: 0.08,
      loop: true,
    },
    voiceover: {
      asset: "voiceover.mp3",
      auto_generated: true,
    },
  },
  transition_default: { type: "crossfade", duration: 0.4 },
  slides: ["slide-0", "slide-1", "slide-2"],
};

export const fixtureSlides: Record<string, SlideIndex> = {
  "slide-0": {
    id: "slide-0",
    duration: 4.0,
    fields: {
      title: "Eco Bottle",
      body: "A reusable bottle made from ocean plastic.",
    },
    assets: { img: fakeSha("eco-bottle-png") },
    voiceover: {
      text: "Meet the Eco Bottle. Reusable, durable, and made from reclaimed ocean plastic.",
      voice: "en-US-AriaNeural",
    },
  },
  "slide-1": {
    id: "slide-1",
    duration: 5.0,
    fields: {
      title: "Why It Matters",
      body: "Every year, 8 million tons of plastic enter our oceans.",
    },
    assets: { img: fakeSha("ocean-png") },
    voiceover: {
      text: "Why does it matter? Eight million tons of plastic enter our oceans every single year.",
      voice: "en-US-AriaNeural",
    },
  },
  "slide-2": {
    id: "slide-2",
    duration: 3.0,
    fields: {
      title: "Join Us",
      body: "Visit eco-bottle.example to learn more.",
    },
    assets: { img: fakeSha("cta-png") },
    voiceover: {
      text: "Join us today at eco-bottle.example to learn more.",
      voice: "en-US-AriaNeural",
    },
  },
};

export const fixtureSlideHtml: Record<string, string> = {
  "slide-0": `<template>
  <div data-composition-id="__OVK_SLIDE_ID__" data-width="1920" data-height="1080">
    <div class="content">
      <h1>__OVK_TITLE__</h1>
      <p>__OVK_BODY__</p>
    </div>
    <style>
      [data-composition-id="__OVK_SLIDE_ID__"] { background: #0a0a14; }
      [data-composition-id="__OVK_SLIDE_ID__"] .content { text-align: center; padding-top: 38vh; }
      [data-composition-id="__OVK_SLIDE_ID__"] h1 { font-size: 120px; font-weight: 800; color: #fff; }
      [data-composition-id="__OVK_SLIDE_ID__"] p { font-size: 52px; font-weight: 600; color: rgba(255,255,255,0.85); margin-top: 28px; }
    </style>
  </div>
</template>`,
  "slide-1": `<template>
  <div data-composition-id="__OVK_SLIDE_ID__" data-width="1920" data-height="1080">
    <div class="content">
      <h1>__OVK_TITLE__</h1>
      <p>__OVK_BODY__</p>
    </div>
    <style>
      [data-composition-id="__OVK_SLIDE_ID__"] { background: #0d1b2a; }
      [data-composition-id="__OVK_SLIDE_ID__"] .content { text-align: center; padding-top: 38vh; }
      [data-composition-id="__OVK_SLIDE_ID__"] h1 { font-size: 100px; font-weight: 700; color: #4ade80; }
      [data-composition-id="__OVK_SLIDE_ID__"] p { font-size: 48px; font-weight: 600; color: rgba(255,255,255,0.85); margin-top: 28px; }
    </style>
  </div>
</template>`,
  "slide-2": `<template>
  <div data-composition-id="__OVK_SLIDE_ID__" data-width="1920" data-height="1080">
    <div class="content">
      <h1>__OVK_TITLE__</h1>
      <p>__OVK_BODY__</p>
    </div>
    <style>
      [data-composition-id="__OVK_SLIDE_ID__"] { background: #1a0a2e; }
      [data-composition-id="__OVK_SLIDE_ID__"] .content { text-align: center; padding-top: 35vh; }
      [data-composition-id="__OVK_SLIDE_ID__"] h1 { font-size: 90px; font-weight: 800; color: #fff; text-transform: uppercase; }
      [data-composition-id="__OVK_SLIDE_ID__"] p { font-size: 44px; font-weight: 600; color: rgba(255,255,255,0.85); margin-top: 28px; }
    </style>
  </div>
</template>`,
};

export interface ProjectBundle {
  root: RootIndex;
  slides: Record<string, SlideIndex>;
  slideHtml: Record<string, string>;
}

export const fixtureBundle: ProjectBundle = {
  root: fixtureRoot,
  slides: fixtureSlides,
  slideHtml: fixtureSlideHtml,
};
