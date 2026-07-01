/**
 * MockRenderer — P2 placeholder that satisfies the SlideRenderer interface
 * without pulling in HyperFrames. Real HF runtime (or our own renderer)
 * replaces this in a later phase.
 *
 * What it does:
 *   - load() stamps the slide's __FIELD__ placeholders via stampSafe
 *   - renderAt(t) returns a Frame with hasContent=true (no actual DOM update;
 *     the React component reading the Frame decides what to render)
 *   - duration() is set from the load() caller — the editor already knows
 *     the measured duration from the slide's index.json
 *
 * The actual visual rendering of the slide HTML happens in <StageCanvas>
 * via a sandboxed iframe so we don't need HF's runtime to demonstrate
 * the data flow.
 */
import { stampSafe } from "@/shared/lib/placeholders";

import type { Assets, Fields, Frame, SlideRenderer } from "./types";

export class MockRenderer implements SlideRenderer {
  readonly backend = "mock-p2";
  private loaded = false;
  private currentSlideId: string | null = null;
  private currentDuration = 0;

  load(
    slideId: string,
    slideHtml: string,
    fields: Fields,
    assets: Assets,
  ): void {
    // Stamp every field placeholder into the HTML (no-op for the mock
    // since StageCanvas renders from fields directly, but kept to honor
    // the contract and exercise stampSafe in development).
    let stamped = slideHtml;
    for (const [id, value] of Object.entries(fields)) {
      stamped = stampSafe(stamped, id, value);
    }
    for (const [id, ref] of Object.entries(assets)) {
      stamped = stampSafe(stamped, id, ref);
    }
    void stamped; // MockRenderer doesn't itself render HTML
    this.currentSlideId = slideId;
    this.loaded = true;
  }

  renderAt(timecode: number): Frame {
    if (!this.loaded || this.currentSlideId === null) {
      throw new Error("SlideRenderer.render_at() called before load()");
    }
    return {
      slideId: this.currentSlideId,
      time: timecode,
      loaded: true,
      hasContent: true,
    };
  }

  setDuration(d: number) {
    this.currentDuration = d;
  }

  duration(): number {
    return this.currentDuration;
  }
}
