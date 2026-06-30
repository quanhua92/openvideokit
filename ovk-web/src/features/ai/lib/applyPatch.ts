/**
 * applyPatch — translates RFC 6902 JSON Patch ops into EditBus dispatches.
 *
 * Tier-1 AI proposals carry JSON Patch arrays; each path maps to a known
 * EditOp. Unsupported paths produce a warning and are skipped.
 *
 * Supported paths:
 *   /fields/<id>     → setField
 *   /voiceover/text  → setVoiceover
 *   /voiceover/voice → setVoiceover (with voice override)
 *   /transition      → setTransition
 */

import type { JsonPatchOp } from "@/shared/ai/types";
import type { EditOp } from "@/shared/edit/EditBus";

export interface PatchResult {
	ops: EditOp[];
	unsupported: string[];
}

export function translatePatch(
	slideId: string,
	patches: JsonPatchOp[],
): PatchResult {
	const ops: EditOp[] = [];
	const unsupported: string[] = [];

	for (const p of patches) {
		const translated = translateOne(slideId, p);
		if (translated) {
			ops.push(translated);
		} else {
			unsupported.push(p.path);
		}
	}

	return { ops, unsupported };
}

function translateOne(slideId: string, p: JsonPatchOp): EditOp | null {
	// /fields/<fieldId>
	const fieldsMatch = p.path.match(/^\/fields\/(.+)$/);
	if (fieldsMatch?.[1]) {
		if (p.op === "remove") return null;
		return {
			kind: "setField",
			slideId,
			fieldId: fieldsMatch[1],
			value: String(p.value ?? ""),
		};
	}

	// /voiceover/text
	if (p.path === "/voiceover/text") {
		return {
			kind: "setVoiceover",
			slideId,
			text: String(p.value ?? ""),
		};
	}

	// /voiceover/voice
	if (p.path === "/voiceover/voice") {
		return {
			kind: "setVoiceover",
			slideId,
			voice: String(p.value ?? "en-US-AriaNeural"),
		};
	}

	// /transition
	if (p.path === "/transition") {
		if (p.op === "remove") {
			return { kind: "setTransition", slideId, transition: null };
		}
		return {
			kind: "setTransition",
			slideId,
			transition: p.value as Record<string, unknown>,
		};
	}

	return null;
}
