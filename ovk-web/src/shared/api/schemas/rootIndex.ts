/**
 * Root index.json schema — RFC §5.2
 *
 * The single source of truth for project-wide DATA: canvas dims/fps, theme,
 * audio refs, transition default, and the slide ordering spine.
 */
import { z } from "zod";

export const CaptionStyleSchema = z.enum([
  "highlight",
  "neon",
  "editorial",
  "eco-green",
]);
export type CaptionStyle = z.infer<typeof CaptionStyleSchema>;

export const CanvasSchema = z.object({
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  fps: z.union([z.literal(24), z.literal(25), z.literal(30), z.literal(60)]),
});
export type Canvas = z.infer<typeof CanvasSchema>;

const Sha256Ref = z.string().regex(/^sha256:[a-f0-9]{64}$/);

export const MusicSchema = z.object({
  asset: z.union([Sha256Ref, z.literal("")]),
  volume: z.number().min(0).max(1),
  loop: z.boolean(),
});
export type Music = z.infer<typeof MusicSchema>;

export const VoiceoverTrackSchema = z.object({
  asset: z.string(),
  auto_generated: z.boolean(),
});
export type VoiceoverTrack = z.infer<typeof VoiceoverTrackSchema>;

export const AudioSchema = z.object({
  music: MusicSchema,
  voiceover: VoiceoverTrackSchema,
});
export type Audio = z.infer<typeof AudioSchema>;

export const ThemeSchema = z.object({
  caption_style: CaptionStyleSchema,
  colors: z.record(z.string(), z.string()),
  fonts: z.record(z.string(), z.string()),
});
export type Theme = z.infer<typeof ThemeSchema>;

export const TransitionDefaultSchema = z.object({
  type: z.string().min(1),
  duration: z.number().nonnegative(),
});
export type TransitionDefault = z.infer<typeof TransitionDefaultSchema>;

export const RootIndexSchema = z.object({
  version: z.literal(1),
  canvas: CanvasSchema,
  theme: ThemeSchema,
  audio: AudioSchema,
  transition_default: TransitionDefaultSchema,
  slides: z
    .array(z.string().min(1))
    .refine((ids) => new Set(ids).size === ids.length, {
      message: "duplicate slide id in slides[]",
    }),
});
export type RootIndex = z.infer<typeof RootIndexSchema>;
