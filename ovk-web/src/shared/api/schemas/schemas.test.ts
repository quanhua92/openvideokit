import { describe, expect, it } from "vitest";

import { fixtureBundle, fixtureSlides } from "../fixtures";
import { RootIndexSchema } from "./rootIndex";
import { SlideIndexSchema } from "./slideIndex";

describe("RootIndexSchema", () => {
  it("parses the fixture project", () => {
    expect(() => RootIndexSchema.parse(fixtureBundle.root)).not.toThrow();
  });

  it("rejects caption_style outside the enum", () => {
    const bad = {
      ...fixtureBundle.root,
      theme: { ...fixtureBundle.root.theme, caption_style: "random" },
    };
    expect(() => RootIndexSchema.parse(bad)).toThrow();
  });

  it("rejects duplicate slide ids", () => {
    const bad = {
      ...fixtureBundle.root,
      slides: ["slide-0", "slide-0"],
    };
    expect(() => RootIndexSchema.parse(bad)).toThrow(/duplicate slide id/);
  });

  it("rejects invalid fps", () => {
    const bad = {
      ...fixtureBundle.root,
      canvas: { ...fixtureBundle.root.canvas, fps: 50 },
    };
    expect(() => RootIndexSchema.parse(bad)).toThrow();
  });

  it("rejects music volume > 1", () => {
    const bad = {
      ...fixtureBundle.root,
      audio: {
        ...fixtureBundle.root.audio,
        music: { ...fixtureBundle.root.audio.music, volume: 1.5 },
      },
    };
    expect(() => RootIndexSchema.parse(bad)).toThrow();
  });

  it("rejects non-sha256 music asset", () => {
    const bad = {
      ...fixtureBundle.root,
      audio: {
        ...fixtureBundle.root.audio,
        music: { ...fixtureBundle.root.audio.music, asset: "not-a-sha" },
      },
    };
    expect(() => RootIndexSchema.parse(bad)).toThrow();
  });
});

describe("SlideIndexSchema", () => {
  it("parses every fixture slide", () => {
    for (const slide of Object.values(fixtureSlides)) {
      expect(() => SlideIndexSchema.parse(slide)).not.toThrow();
    }
  });

  it("rejects voice id without Neural suffix", () => {
    const bad = {
      ...fixtureSlides["slide-0"],
      voiceover: {
        ...fixtureSlides["slide-0"].voiceover,
        voice: "vi-VN-HoaiMy",
      },
    };
    expect(() => SlideIndexSchema.parse(bad)).toThrow(/Neural/);
  });

  it("rejects asset ref without sha256: prefix", () => {
    const bad = {
      ...fixtureSlides["slide-0"],
      assets: { img: "plain-string-ref" },
    };
    expect(() => SlideIndexSchema.parse(bad)).toThrow();
  });

  it("rejects negative duration", () => {
    const bad = { ...fixtureSlides["slide-0"], duration: -1 };
    expect(() => SlideIndexSchema.parse(bad)).toThrow();
  });
});
