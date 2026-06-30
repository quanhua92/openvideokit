/**
 * applyOp — pure reducer over ProjectBundle.
 *
 * (project, op) → newProject. The EditBus calls this, then writes the result
 * to the TanStack Query cache. Pure = trivially testable + reusable for
 * undo/redo (inverseOp reads the project state BEFORE applying to compute
 * the inverse).
 *
 * Default factory for new slides lives here so both `addSlide` and
 * `duplicateSlide` produce schema-valid SlideIndex entries.
 */
import type { ProjectBundle } from "@/shared/api/client";
import type { CaptionStyle } from "@/shared/api/schemas/rootIndex";
import type { SlideIndex } from "@/shared/api/schemas/slideIndex";

import type { EditOp } from "./EditBus";

const DEFAULT_VOICE = "en-US-AriaNeural";
const DEFAULT_DURATION = 3.0;

export function makeBlankSlide(id: string): SlideIndex {
	return {
		id,
		duration: DEFAULT_DURATION,
		fields: { title: "New slide", body: "" },
		assets: {},
		voiceover: { text: "", voice: DEFAULT_VOICE },
	};
}

export function applyOp(project: ProjectBundle, op: EditOp): ProjectBundle {
	switch (op.kind) {
		case "setField": {
			const slide = project.slides[op.slideId];
			if (!slide) return project;
			return {
				...project,
				slides: {
					...project.slides,
					[op.slideId]: {
						...slide,
						fields: { ...slide.fields, [op.fieldId]: op.value },
					},
				},
			};
		}

		case "reorderSlides": {
			// Only accept orderings that preserve the same id set.
			if (op.order.length !== project.root.slides.length) return project;
			const before = new Set(project.root.slides);
			if (!op.order.every((id) => before.has(id))) return project;
			return {
				...project,
				root: { ...project.root, slides: op.order },
			};
		}

		case "addSlide": {
			if (project.slides[op.newId]) return project; // id collision
			const slides = [...project.root.slides];
			const idx = op.afterId ? slides.indexOf(op.afterId) + 1 : slides.length;
			slides.splice(idx >= 0 ? idx : slides.length, 0, op.newId);
			return {
				...project,
				root: { ...project.root, slides },
				slides: {
					...project.slides,
					[op.newId]: makeBlankSlide(op.newId),
				},
			};
		}

		case "duplicateSlide": {
			const source = project.slides[op.slideId];
			if (!source || project.slides[op.newId]) return project;
			const slides = [...project.root.slides];
			const idx = slides.indexOf(op.slideId) + 1;
			slides.splice(idx, 0, op.newId);
			return {
				...project,
				root: { ...project.root, slides },
				slides: {
					...project.slides,
					[op.newId]: { ...source, id: op.newId },
				},
			};
		}

		case "removeSlide": {
			if (!project.slides[op.slideId]) return project;
			const { [op.slideId]: _removed, ...rest } = project.slides;
			void _removed;
			return {
				...project,
				root: {
					...project.root,
					slides: project.root.slides.filter((id) => id !== op.slideId),
				},
				slides: rest,
			};
		}

		case "setTransition": {
			const slide = project.slides[op.slideId];
			if (!slide) return project;
			const transition =
				op.transition === null
					? undefined
					: { type: "fade", duration: 0.4, ...op.transition };
			return {
				...project,
				slides: {
					...project.slides,
					[op.slideId]: { ...slide, transition },
				},
			};
		}

		case "setAsset": {
			const slide = project.slides[op.slideId];
			if (!slide) return project;
			const assets = { ...slide.assets };
			if (op.ref === "") {
				delete assets[op.fieldId];
			} else {
				assets[op.fieldId] = op.ref;
			}
			return {
				...project,
				slides: {
					...project.slides,
					[op.slideId]: { ...slide, assets },
				},
			};
		}

		case "setVoiceover": {
			const slide = project.slides[op.slideId];
			if (!slide) return project;
			return {
				...project,
				slides: {
					...project.slides,
					[op.slideId]: {
						...slide,
						voiceover: {
							text: op.text,
							voice: op.voice ?? slide.voiceover.voice,
						},
					},
				},
			};
		}

		case "setDuration": {
			const slide = project.slides[op.slideId];
			if (!slide) return project;
			return {
				...project,
				slides: {
					...project.slides,
					[op.slideId]: { ...slide, duration: op.duration },
				},
			};
		}

		case "setCaptionStyle": {
			return {
				...project,
				root: {
					...project.root,
					theme: {
						...project.root.theme,
						caption_style: op.style as CaptionStyle,
					},
				},
			};
		}

		case "setSlideHtml": {
			return {
				...project,
				slideHtml: {
					...project.slideHtml,
					[op.slideId]: op.html,
				},
			};
		}

		case "restoreSlide": {
			const slides = [...project.root.slides];
			const insertAt = Math.max(0, Math.min(op.at, slides.length));
			slides.splice(insertAt, 0, op.slide.id);
			return {
				...project,
				root: { ...project.root, slides },
				slides: {
					...project.slides,
					[op.slide.id]: op.slide,
				},
			};
		}
	}
}
