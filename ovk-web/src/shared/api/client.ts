/**
 * Typed API client — every response runs through zod parse.
 *
 * Used by TanStack Query hooks in P2 (useProject, useSlide).
 * Swapping MSW for a real backend changes nothing upstream.
 */

import { apiBaseUrl } from "@/shared/config";
import type { RootIndex } from "./schemas/rootIndex";
import { RootIndexSchema } from "./schemas/rootIndex";
import type { SlideIndex } from "./schemas/slideIndex";
import { SlideIndexSchema } from "./schemas/slideIndex";

export interface ProjectBundle {
  root: RootIndex;
  slides: Record<string, SlideIndex>;
  slideHtml: Record<string, string>;
}

/** Inner parse: the /projects/:id response is { root, slides, slideHtml }. */
function parseProjectBundle(raw: unknown): ProjectBundle {
  if (typeof raw !== "object" || raw === null) {
    throw new Error("project bundle is not an object");
  }
  const { root, slides, slideHtml } = raw as Record<string, unknown>;
  if (slides === null || slides === undefined) {
    throw new Error("project bundle missing 'slides' field");
  }
  return {
    root: RootIndexSchema.parse(root),
    slides: Object.fromEntries(
      Object.entries(slides as Record<string, unknown>).map(
        ([id, slide]) => [id, SlideIndexSchema.parse(slide)] as const,
      ),
    ),
    slideHtml: (slideHtml as Record<string, string> | undefined) ?? {},
  };
}

/** Parse JSON with a friendly error if the body isn't JSON (e.g. HTML error page). */
async function parseJson(res: Response, label: string): Promise<unknown> {
  try {
    return await res.json();
  } catch {
    throw new Error(`${label}: ${res.status} — invalid JSON response`);
  }
}

export const client = {
  async getProject(projectId: string): Promise<ProjectBundle> {
    const res = await fetch(
      `${apiBaseUrl}/projects/${encodeURIComponent(projectId)}`,
    );
    if (!res.ok) {
      throw new Error(`getProject ${projectId}: ${res.status}`);
    }
    return parseProjectBundle(await parseJson(res, `getProject ${projectId}`));
  },

  async getSlide(projectId: string, slideId: string): Promise<SlideIndex> {
    const res = await fetch(
      `${apiBaseUrl}/projects/${encodeURIComponent(projectId)}/slides/${encodeURIComponent(slideId)}`,
    );
    if (!res.ok) {
      throw new Error(`getSlide ${projectId}/${slideId}: ${res.status}`);
    }
    return SlideIndexSchema.parse(
      await parseJson(res, `getSlide ${projectId}/${slideId}`),
    );
  },
};
