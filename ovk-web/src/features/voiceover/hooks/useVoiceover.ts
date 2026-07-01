/**
 * useVoiceover — batch TTS pipeline trigger.
 *
 * Watches every slide's voiceover.text. When ANY text changes, debounce
 * 500ms then POST the whole batch to /api/projects/{id}/tts. On response,
 * dispatch `setDuration` per slide so the timeline reflects measured lengths,
 * and store audio URLs for playback.
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
  }>;
}

export function useVoiceover(projectId: string, project: ProjectBundle): void {
  const { dispatch } = useEditBus();
  const prevTextsRef = useRef<Record<string, string>>({});
  const inflight = useRef(false);
  const setAudioUrls = useAudioUrls((s) => s.setUrls);

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
      try {
        const payload = {
          slides: Object.entries(texts).map(([id, text]) => ({
            id,
            text,
            voice: project.slides[id]?.voiceover.voice ?? "en-US-AriaNeural",
          })),
        };
        const res = await fetch(
          `${apiBaseUrl}/projects/${encodeURIComponent(projectId)}/tts`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(payload),
          },
        );
        if (!res.ok) return;
        const data = (await res.json()) as TtsResponse;
        const audioUrls: Record<string, string> = {};
        for (const timing of data.timings) {
          dispatch(setDuration(timing.slideId, timing.duration));
          if (timing.audio) audioUrls[timing.slideId] = timing.audio;
        }
        if (Object.keys(audioUrls).length > 0) {
          setAudioUrls(audioUrls);
        }
        prevTextsRef.current = texts;
      } finally {
        inflight.current = false;
      }
    }, 500);

    return () => clearTimeout(t);
  }, [projectId, project, dispatch, setAudioUrls]);
}
