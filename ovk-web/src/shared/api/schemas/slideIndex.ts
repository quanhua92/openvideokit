/**
 * Slide index.json schema — RFC §5.3
 *
 * Per-slide DATA: id, MEASURED duration, optional transition override,
 * fields (→ __FIELD__ stamps), assets (SHA refs only), voiceover.
 *
 * Critical invariants:
 *   - duration is measured (ffprobe), never authored
 *   - assets values must be sha256: refs (never blobs)
 *   - voiceover.voice MUST end in "Neural" (per AGENTS.md pitfall #1)
 */
import { z } from "zod";

export const TransitionSchema = z.object({
  type: z.string().min(1),
  duration: z.number().nonnegative(),
});
export type Transition = z.infer<typeof TransitionSchema>;

export const SlideVoiceoverSchema = z.object({
  text: z.string(),
  voice: z.string().regex(/Neural$/, {
    message: 'voice id must end in "Neural" (e.g. vi-VN-HoaiMyNeural)',
  }),
  rate: z.string().optional(),
  pitch: z.string().optional(),
  volume: z.string().optional(),
});
export type SlideVoiceover = z.infer<typeof SlideVoiceoverSchema>;

export const SlideIndexSchema = z.object({
  id: z.string().min(1),
  duration: z.number().nonnegative(),
  transition: TransitionSchema.optional(),
  fields: z.record(z.string(), z.string()),
  assets: z.record(z.string(), z.string().regex(/^sha256:[a-f0-9]{64}$/)),
  // Optional: absent until the first TTS generation writes audio.json.
  voiceover: SlideVoiceoverSchema.optional(),
});
export type SlideIndex = z.infer<typeof SlideIndexSchema>;

/**
 * Effective transition for a slide = slide.transition ?? root.transition_default.
 * Pure helper usable on the parsed types.
 */
export function effectiveTransition(
  slideTransition: Transition | undefined,
  rootDefault: Transition,
): Transition {
  return slideTransition ?? rootDefault;
}
