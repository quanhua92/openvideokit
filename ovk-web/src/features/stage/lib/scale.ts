/**
 * Uniform scale to fit a source canvas inside a viewport — "object-fit:
 * contain" computed numerically so we can apply it via `transform: scale()`
 * on an absolutely-positioned child.
 *
 * Pinned fixture: 1920×1080 inside 800×450 → 0.416667 (limited by width).
 */
export function scaleToFit(
  source: { width: number; height: number },
  viewport: { width: number; height: number },
): number {
  if (source.width === 0 || source.height === 0) return 0;
  const sx = viewport.width / source.width;
  const sy = viewport.height / source.height;
  return Math.min(sx, sy);
}
