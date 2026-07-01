import { describe, expect, it } from "vitest";

import { splitWords, timeWordsByCharRatio } from "./timeWordsByCharRatio";

describe("splitWords", () => {
  it("splits on whitespace, dropping empties", () => {
    expect(splitWords("  hello   world  ")).toEqual(["hello", "world"]);
  });

  it("returns [] for empty input", () => {
    expect(splitWords("")).toEqual([]);
    expect(splitWords("   ")).toEqual([]);
  });
});

describe("timeWordsByCharRatio", () => {
  it("returns [] for empty input", () => {
    expect(timeWordsByCharRatio("", 0, 5)).toEqual([]);
  });

  it("returns [] for non-positive duration", () => {
    expect(timeWordsByCharRatio("hello world", 0, 0)).toEqual([]);
    expect(timeWordsByCharRatio("hello world", 0, -1)).toEqual([]);
  });

  it("preserves sentenceStart as the first word's start", () => {
    const t = timeWordsByCharRatio("hello", 1.5, 2);
    expect(t[0].start).toBe(1.5);
  });

  it("preserves the last word's end as sentenceStart + sentenceDur", () => {
    const t = timeWordsByCharRatio("the quick brown fox", 0, 4);
    expect(t[t.length - 1].end).toBeCloseTo(4, 5);
  });

  it("sum of ratios === 1.0 (Σ ratioᵢ === 1.0)", () => {
    const t = timeWordsByCharRatio("one two three four", 0, 10);
    const sum = t.reduce((s, w) => s + w.ratio, 0);
    expect(sum).toBeCloseTo(1.0, 10);
  });

  it("sum of durations === sentenceDur (Σ durᵢ === sentenceDur)", () => {
    const t = timeWordsByCharRatio("one two three four", 0, 10);
    const sum = t.reduce((s, w) => s + w.dur, 0);
    expect(sum).toBeCloseTo(10, 10);
  });

  it("each end === start + dur", () => {
    const t = timeWordsByCharRatio("the quick brown fox jumps", 0, 5);
    for (const w of t) {
      expect(w.end).toBeCloseTo(w.start + w.dur, 10);
    }
  });

  it("starts are monotonically increasing", () => {
    const t = timeWordsByCharRatio("alpha beta gamma delta", 0, 4);
    for (let i = 1; i < t.length; i++) {
      expect(t[i].start).toBeGreaterThanOrEqual(t[i - 1].start);
    }
  });

  it("longer words get proportionally more time", () => {
    const t = timeWordsByCharRatio("a sophisticated", 0, 10);
    // "a" (1 char) vs "sophisticated" (13 chars): ratio 1/14 vs 13/14
    expect(t[1].dur).toBeGreaterThan(t[0].dur * 5);
  });

  it("preserves original word text", () => {
    const t = timeWordsByCharRatio("Hello, world!", 0, 2);
    expect(t.map((w) => w.text)).toEqual(["Hello,", "world!"]);
  });
});
