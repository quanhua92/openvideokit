/**
 * Op creator signatures — P0 ships signatures only (no runtime).
 *
 * P3 implements these as pure functions returning EditOp values that the
 * EditBus consumes. Defining the contract now means AI scenarios (P6) can
 * be authored against stable shapes.
 *
 * Each creator returns a value conforming to EditOp from EditBus.ts.
 */
import type { EditOp } from "./EditBus";

export function setField(
	slideId: string,
	fieldId: string,
	value: string,
): Extract<EditOp, { kind: "setField" }> {
	return { kind: "setField", slideId, fieldId, value };
}

export function reorderSlides(
	order: string[],
): Extract<EditOp, { kind: "reorderSlides" }> {
	return { kind: "reorderSlides", order };
}

export function addSlide(
	newId: string,
	layoutId: string,
	afterId?: string,
): Extract<EditOp, { kind: "addSlide" }> {
	return { kind: "addSlide", newId, layoutId, afterId };
}

export function removeSlide(
	slideId: string,
): Extract<EditOp, { kind: "removeSlide" }> {
	return { kind: "removeSlide", slideId };
}

export function duplicateSlide(
	slideId: string,
	newId: string,
): Extract<EditOp, { kind: "duplicateSlide" }> {
	return { kind: "duplicateSlide", slideId, newId };
}

export function setTransition(
	slideId: string,
	transition: Record<string, unknown> | null,
): Extract<EditOp, { kind: "setTransition" }> {
	return { kind: "setTransition", slideId, transition };
}

export function setAsset(
	slideId: string,
	fieldId: string,
	ref: string,
): Extract<EditOp, { kind: "setAsset" }> {
	return { kind: "setAsset", slideId, fieldId, ref };
}

export function setVoiceover(
	slideId: string,
	text?: string,
	voice?: string,
): Extract<EditOp, { kind: "setVoiceover" }> {
	return { kind: "setVoiceover", slideId, text, voice };
}

export function setDuration(
	slideId: string,
	duration: number,
): Extract<EditOp, { kind: "setDuration" }> {
	return { kind: "setDuration", slideId, duration };
}

export function setCaptionStyle(
	style: string,
): Extract<EditOp, { kind: "setCaptionStyle" }> {
	return { kind: "setCaptionStyle", style };
}

export function setSlideHtml(
	slideId: string,
	html: string,
): Extract<EditOp, { kind: "setSlideHtml" }> {
	return { kind: "setSlideHtml", slideId, html };
}
