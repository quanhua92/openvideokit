/**
 * Mock TTS endpoint — MSW handler for POST /api/tts.
 *
 * Mirrors the shape of the real edge-tts + ffprobe + ffmpeg pipeline from
 * voiceover.py: takes a batch of slides → returns per-slide measured
 * durations (sum of per-sentence durations, deterministic from a text
 * hash). Same text always produces the same duration so tests are stable.
 *
 * The real backend (later phase) reuses the same request/response shape.
 */
import { HttpResponse, http } from "msw";

import { mockSlideDuration } from "@/features/voiceover/lib/text";
import type { RootIndex, VoiceoverTrack } from "@/shared/api/schemas/rootIndex";

const API_BASE = "/api";

interface TtsRequest {
	slides: ReadonlyArray<{
		id: string;
		text: string;
		voice: string;
	}>;
}

interface TtsResponse {
	timings: ReadonlyArray<{
		slideId: string;
		duration: number;
	}>;
}

/** Re-export so handlers.ts can include this in the worker setup. */
export const ttsHandler = http.post(`${API_BASE}/tts`, async ({ request }) => {
	let body: TtsRequest;
	try {
		body = (await request.json()) as TtsRequest;
	} catch {
		return HttpResponse.json({ message: "invalid JSON body" }, { status: 400 });
	}

	if (!body.slides || !Array.isArray(body.slides)) {
		return HttpResponse.json(
			{ message: "missing `slides` array" },
			{ status: 400 },
		);
	}

	// Simulate the network + edge-tts + ffprobe + ffmpeg concat latency.
	// Realistic enough to exercise loading states; deterministic for tests.
	const artificialDelay = 150 + Math.random() * 300;
	await new Promise((r) => setTimeout(r, artificialDelay));

	const timings: TtsResponse["timings"] = body.slides.map((s) => ({
		slideId: s.id,
		duration: mockSlideDuration(s.text),
	}));

	return HttpResponse.json({ timings });
});

// Used by fixtures to satisfy the schema where a VoiceoverTrack asset is
// required. Kept here so all TTS concerns live together.
export function synthVoiceoverTrack(): VoiceoverTrack {
	const root: Pick<RootIndex, "audio"> = {
		audio: {
			music: { asset: "", volume: 0, loop: false },
			voiceover: { asset: "voiceover.mp3", auto_generated: true },
		},
	};
	return root.audio.voiceover;
}
