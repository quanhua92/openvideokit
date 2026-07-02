/**
 * RenderJob — zod schema for the export/render job dict.
 *
 * Mirrors the Python `rendering.py` job shape. Used by the API client
 * to validate poll responses.
 */
import { z } from "zod";

export const RenderStatusSchema = z.enum([
  "queued",
  "running",
  "done",
  "failed",
  "cancelled",
]);

export const RenderJobSchema = z.object({
  id: z.string(),
  project_id: z.string(),
  status: RenderStatusSchema,
  output: z.string(),
  log: z.string(),
  started_at: z.number(),
  ended_at: z.number().nullable(),
  exit_code: z.number().nullable(),
  error: z.string().nullable(),
  size: z.number().optional(),
  reconstructed: z.boolean().optional(),
});

export type RenderStatus = z.infer<typeof RenderStatusSchema>;
export type RenderJob = z.infer<typeof RenderJobSchema>;
