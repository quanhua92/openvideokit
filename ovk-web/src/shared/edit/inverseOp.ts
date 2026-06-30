/**
 * inverseOp — pure: (op, projectBefore) → inverse op that would undo `op`.
 *
 * Used by useUndoRedo to flip the past/future stacks. Returns null only
 * when the data doesn't support an inverse (e.g. removing a slide that no
 * longer exists) — never because an op kind is unhandled.
 *
 * Exhaustiveness: the `default` branch assigns `op` to `never`. If a new
 * EditOp variant is added without a case here, TypeScript errors at compile
 * time, so undo can never silently break for a new op.
 */
import type { ProjectBundle } from "@/shared/api/client";

import type { EditOp } from "./EditBus";

export function inverseOp(op: EditOp, before: ProjectBundle): EditOp | null {
	switch (op.kind) {
		case "setField": {
			const prev = before.slides[op.slideId]?.fields[op.fieldId] ?? "";
			return {
				kind: "setField",
				slideId: op.slideId,
				fieldId: op.fieldId,
				value: prev,
			};
		}

		case "reorderSlides": {
			return { kind: "reorderSlides", order: before.root.slides };
		}

		case "addSlide": {
			// Inverse: remove the slide we just added.
			return { kind: "removeSlide", slideId: op.newId };
		}

		case "duplicateSlide": {
			return { kind: "removeSlide", slideId: op.newId };
		}

		case "removeSlide": {
			const removedSlide = before.slides[op.slideId];
			if (!removedSlide) return null;
			const idx = before.root.slides.indexOf(op.slideId);
			return {
				kind: "restoreSlide" as const,
				slide: removedSlide,
				at: idx,
			};
		}

		case "restoreSlide": {
			// Inverse of restoring a slide is removing it again.
			return { kind: "removeSlide", slideId: op.slide.id };
		}

		case "setTransition": {
			const prev = before.slides[op.slideId]?.transition ?? null;
			return { kind: "setTransition", slideId: op.slideId, transition: prev };
		}

		case "setAsset": {
			const prev = before.slides[op.slideId]?.assets[op.fieldId] ?? "";
			return {
				kind: "setAsset",
				slideId: op.slideId,
				fieldId: op.fieldId,
				ref: prev,
			};
		}

		case "setVoiceover": {
			const prev = before.slides[op.slideId]?.voiceover;
			if (!prev) return null;
			return {
				kind: "setVoiceover",
				slideId: op.slideId,
				text: prev.text,
				voice: prev.voice,
			};
		}

		case "setDuration": {
			const prev = before.slides[op.slideId]?.duration ?? 0;
			return { kind: "setDuration", slideId: op.slideId, duration: prev };
		}

		case "setCaptionStyle": {
			return {
				kind: "setCaptionStyle",
				style: before.root.theme.caption_style,
			};
		}

		case "setSlideHtml": {
			const prev = before.slideHtml?.[op.slideId] ?? "";
			return { kind: "setSlideHtml", slideId: op.slideId, html: prev };
		}

		default: {
			// Compile-time exhaustiveness: if a new EditOp kind is added without
			// a case above, `op` is no longer `never` and this errors.
			const _exhaustive: never = op;
			return _exhaustive;
		}
	}
}
