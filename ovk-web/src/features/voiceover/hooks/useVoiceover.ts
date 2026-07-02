/**
 * useVoiceover — TTS pipeline.
 *
 * Initial load: tries GET /slides/{id}/audio for each slide. If all cached,
 * no POST. If any missing, POST /tts to generate.
 *
 * Subsequent: NO auto-fire. The user must click "Generate Audio" in the
 * CaptionTextEditor, which calls requestRegenerate() → this hook watches
 * regenerateNonce and POSTs on change.
 */
import { useEffect, useRef } from "react";
import type { ProjectBundle } from "@/shared/api/client";
import { apiBaseUrl } from "@/shared/config";
import { useEditBus } from "@/shared/edit/EditBusProvider";
import { setDuration } from "@/shared/edit/ops";
import { useAudioUrls } from "@/shared/store/audioUrls";

interface TtsResponse {
  timings: ReadonlyArray<{
    slideId: string;
    duration: number;
    audio: string;
    audioHash: string;
  }>;
}

export function useVoiceover(projectId: string, project: ProjectBundle): void {
  const { dispatch } = useEditBus();
  const initialized = useRef(false);
  const projectRef = useRef(project);
  projectRef.current = project;
  const setAudioUrls = useAudioUrls((s) => s.setUrls);
  const regenerateNonce = useAudioUrls((s) => s.regenerateNonce);
  const regenerateSlideId = useAudioUrls((s) => s.regenerateSlideId);

  // ── Initial load: GET existing audio, POST only if missing ──────────
  // hasSlides flips false→true once (when query resolves). Stays true
  // through all text edits → effect fires exactly once, never again.
  const hasSlides = project.root.slides.length > 0;
  useEffect(() => {
    if (initialized.current || !hasSlides) return;
    initialized.current = true;
    const proj = projectRef.current;

    (async () => {
      const slideIds = proj.root.slides;
      const results = await Promise.all(
        slideIds.map(async (id) => {
          const res = await fetch(
            `${apiBaseUrl}/projects/${encodeURIComponent(projectId)}/slides/${id}/audio`,
          );
          return { id, ok: res.ok };
        }),
      );

      const allCached = results.every((r) => r.ok);
      if (allCached) {
        const urls: Record<string, string> = {};
        for (const { id } of results) {
          urls[id] =
            `${apiBaseUrl}/projects/${encodeURIComponent(projectId)}/slides/${id}/audio`;
        }
        setAudioUrls(urls);
      } else {
        await postTtsAll(projectId, proj, dispatch, setAudioUrls);
      }
    })();
  }, [hasSlides, projectId, dispatch, setAudioUrls]);

  const setGenerating = useAudioUrls((s) => s.setGenerating);

  // ── Manual regenerate: fired ONLY by nonce, sends just the changed slide ─
  useEffect(() => {
    if (regenerateNonce === 0 || !regenerateSlideId) return;
    const slide = projectRef.current.slides[regenerateSlideId];
    if (!slide) return;
    postTtsSlide(
      projectId,
      regenerateSlideId,
      slide,
      dispatch,
      setAudioUrls,
    ).finally(() => {
      setGenerating(null);
    });
  }, [
    regenerateNonce,
    regenerateSlideId,
    projectId,
    dispatch,
    setAudioUrls,
    setGenerating,
  ]);
}

/** POST /tts for a single slide only. */
async function postTtsSlide(
  projectId: string,
  slideId: string,
  slide: {
    // Optional until the first TTS generation; default to a stub below.
    voiceover?: {
      text: string;
      voice: string;
      rate?: string;
      pitch?: string;
      volume?: string;
    };
  },
  dispatch: ReturnType<typeof useEditBus>["dispatch"],
  setAudioUrls: (urls: Record<string, string>) => void,
): Promise<void> {
  const vo = slide.voiceover ?? { text: "", voice: "en-US-AriaNeural" };
  const res = await fetch(
    `${apiBaseUrl}/projects/${encodeURIComponent(projectId)}/tts`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        slides: [
          {
            id: slideId,
            text: vo.text ?? "",
            voice: vo.voice ?? "en-US-AriaNeural",
            rate: vo.rate ?? "",
            pitch: vo.pitch ?? "",
            volume: vo.volume ?? "",
          },
        ],
      }),
    },
  );
  if (!res.ok) return;
  const data = (await res.json()) as TtsResponse;
  for (const timing of data.timings) {
    dispatch(setDuration(timing.slideId, timing.duration));
  }
  const timing = data.timings[0];
  if (timing?.audio) {
    setAudioUrls({ ...useAudioUrls.getState().urls, [slideId]: timing.audio });
  }
}

/** POST /tts for all slides (initial load when audio is missing). */
async function postTtsAll(
  projectId: string,
  project: ProjectBundle,
  dispatch: ReturnType<typeof useEditBus>["dispatch"],
  setAudioUrls: (urls: Record<string, string>) => void,
): Promise<void> {
  const slides = project.root.slides.map((id) => {
    const vo = project.slides[id]?.voiceover;
    return {
      id,
      text: vo?.text ?? "",
      voice: vo?.voice ?? "en-US-AriaNeural",
      rate: vo?.rate ?? "",
      pitch: vo?.pitch ?? "",
      volume: vo?.volume ?? "",
    };
  });

  const res = await fetch(
    `${apiBaseUrl}/projects/${encodeURIComponent(projectId)}/tts`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slides }),
    },
  );
  if (!res.ok) return;
  const data = (await res.json()) as TtsResponse;
  const urls: Record<string, string> = {};
  for (const timing of data.timings) {
    dispatch(setDuration(timing.slideId, timing.duration));
    if (timing.audio) {
      urls[timing.slideId] = timing.audio;
    }
  }
  if (Object.keys(urls).length > 0) {
    setAudioUrls(urls);
  }
}
