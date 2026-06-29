/**
 * Typed API client — every response runs through zod parse.
 *
 * Used by TanStack Query hooks in P2 (useProject, useSlide).
 * Swapping MSW for a real backend changes nothing upstream.
 */

import type { RootIndex } from "./schemas/rootIndex";
import { RootIndexSchema } from "./schemas/rootIndex";
import type { SlideIndex } from "./schemas/slideIndex";
import { SlideIndexSchema } from "./schemas/slideIndex";

const API_BASE = "/api";

export interface ProjectBundle {
	root: RootIndex;
	slides: Record<string, SlideIndex>;
}

/** Inner parse: the /projects/:id response is { root, slides }. */
function parseProjectBundle(raw: unknown): ProjectBundle {
	if (typeof raw !== "object" || raw === null) {
		throw new Error("project bundle is not an object");
	}
	const { root, slides } = raw as Record<string, unknown>;
	return {
		root: RootIndexSchema.parse(root),
		slides: Object.fromEntries(
			Object.entries(slides as Record<string, unknown>).map(
				([id, slide]) => [id, SlideIndexSchema.parse(slide)] as const,
			),
		),
	};
}

export const client = {
	async getProject(projectId: string): Promise<ProjectBundle> {
		const res = await fetch(`${API_BASE}/projects/${projectId}`);
		if (!res.ok) {
			throw new Error(`getProject ${projectId}: ${res.status}`);
		}
		return parseProjectBundle(await res.json());
	},

	async getSlide(projectId: string, slideId: string): Promise<SlideIndex> {
		const res = await fetch(
			`${API_BASE}/projects/${projectId}/slides/${slideId}`,
		);
		if (!res.ok) {
			throw new Error(`getSlide ${projectId}/${slideId}: ${res.status}`);
		}
		return SlideIndexSchema.parse(await res.json());
	},
};
