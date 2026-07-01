/**
 * SlideRenderer interface — RFC §9 contract.
 *
 * The editor talks to this interface and never imports HyperFrames directly.
 * P2 ships a MockRenderer that renders stamped slide HTML in a sandboxed
 * iframe so the data flow works end-to-end without the HF runtime. A real
 * HF impl (or our own headless-Chromium renderer) swaps in here later
 * without touching the editor.
 */

export type Fields = Record<string, string>;
export type Assets = Record<string, string>;

export interface Frame {
  slideId: string;
  time: number;
  loaded: boolean;
  hasContent: boolean;
}

export interface SlideRenderer {
  readonly backend: string;
  /**
   * Mount a slide composition. The renderer stamps fields into the slide
   * HTML and prepares to receive renderAt calls.
   */
  load(
    slideId: string,
    slideHtml: string,
    fields: Fields,
    assets: Assets,
  ): void;
  /**
   * Render at time `t` (seconds). Pure: same `t` always produces the same
   * visual frame. Calling renderAt before load throws.
   */
  renderAt(timecode: number): Frame;
  /** Total slide duration in seconds, measured at load. */
  duration(): number;
}
