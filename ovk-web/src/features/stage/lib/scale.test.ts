import { describe, expect, it } from "vitest";

import { scaleToFit } from "./scale";

describe("scaleToFit", () => {
  it("matches the pinned bundle fixture: 1920x1080 in 800x450 → 0.416667", () => {
    const s = scaleToFit(
      { width: 1920, height: 1080 },
      { width: 800, height: 450 },
    );
    expect(s).toBeCloseTo(0.416667, 4);
  });

  it("width-limited when source is wider than viewport ratio", () => {
    const s = scaleToFit(
      { width: 1920, height: 1080 },
      { width: 960, height: 1080 },
    );
    expect(s).toBeCloseTo(0.5); // limited by 960/1920
  });

  it("height-limited when viewport is wider than source ratio", () => {
    const s = scaleToFit(
      { width: 1920, height: 1080 },
      { width: 1920, height: 540 },
    );
    expect(s).toBeCloseTo(0.5); // limited by 540/1080
  });

  it("returns 0 for zero-size source (prevents NaN)", () => {
    expect(
      scaleToFit({ width: 0, height: 1080 }, { width: 800, height: 450 }),
    ).toBe(0);
    expect(
      scaleToFit({ width: 1920, height: 0 }, { width: 800, height: 450 }),
    ).toBe(0);
  });

  it("returns 1 when source === viewport", () => {
    expect(
      scaleToFit({ width: 800, height: 450 }, { width: 800, height: 450 }),
    ).toBe(1);
  });
});
