/**
 * useVoiceover — batch TTS pipeline trigger.
 *
 * Watches every slide's voiceover.text. When ANY text changes, debounce
 * 500ms then POST the whole batch to /api/tts. On response, dispatch
 * `setDuration` per slide so the timeline reflects measured lengths.
 *
 * Per AGENTS.md: durations are MEASURED from TTS, never authored. This hook
 * is the only path that updates durations after the initial fixture load.
 *
 * To avoid an infinite loop (setDuration mutates project → effect re-runs),
 * the comparison checks voiceover.text only, not the whole project. A
 * duration update never trips the text comparator.
 */
import { useEffect, useRef, useState } from "react";
import type { ProjectBundle } from "@/shared/api/client";
import { useEditBus } from "@/shared/edit/EditBusProvider";
import { setDuration } from "@/shared/edit/ops";

interface TtsResponse {
	timings: ReadonlyArray<{ slideId: string; duration: number }>;
}

export function useVoiceover(project: ProjectBundle): {
	isRegenerating: boolean;
} {
	const { dispatch } = useEditBus();
	const prevTextsRef = useRef<Record<string, string>>({});
	const inflight = useRef(false);
	const [isRegenerating, setIsRegenerating] = useState(false);

	useEffect(() => {
		const texts: Record<string, string> = {};
		for (const id of project.root.slides) {
			texts[id] = project.slides[id]?.voiceover.text ?? "";
		}

		const prev = prevTextsRef.current;
		const changed =
			Object.entries(texts).some(([id, t]) => prev[id] !== t) ||
			Object.keys(prev).length === 0;

		if (!changed || inflight.current) return;

		const t = setTimeout(async () => {
			inflight.current = true;
			setIsRegenerating(true);
			try {
				const payload = {
					slides: Object.entries(texts).map(([id, text]) => ({
						id,
						text,
						voice: project.slides[id]?.voiceover.voice ?? "en-US-AriaNeural",
					})),
				};
				const res = await fetch("/api/tts", {
					method: "POST",
					headers: { "Content-Type": "application/json" },
					body: JSON.stringify(payload),
				});
				if (!res.ok) return;
				const data = (await res.json()) as TtsResponse;
				for (const timing of data.timings) {
					dispatch(setDuration(timing.slideId, timing.duration));
				}
				prevTextsRef.current = texts;
			} finally {
				inflight.current = false;
				setIsRegenerating(false);
			}
		}, 500);

		return () => clearTimeout(t);
	}, [project, dispatch]);

	return { isRegenerating };
}
