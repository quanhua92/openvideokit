/**
 * inverseOp — pure: (op, projectBefore) → inverse op that would undo `op`.
 *
 * Used by useUndoRedo to flip the past/future stacks. Returns null when no
 * meaningful inverse exists (e.g. setSlideHtml before P5 ships HTML storage).
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
	}

	return null;
}
