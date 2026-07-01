/**
 * CaptionTextEditor — the single voiceover editing surface.
 *
 * Edits the slide's voiceover.text (caption words), voice (Neural TTS ID),
 * and optional rate/pitch/volume params. Everything voiceover-related lives
 * here — the Properties panel no longer has a voiceover section.
 */
import { useEffect, useState } from "react";

import { Textarea } from "@/components/ui/textarea";
import { splitWords } from "@/features/captions/lib/timeWordsByCharRatio";
import { splitSentences } from "@/features/voiceover/lib/text";
import type { SlideIndex } from "@/shared/api/schemas/slideIndex";
import { useEditBus } from "@/shared/edit/EditBusProvider";
import { setVoiceover } from "@/shared/edit/ops";

const VOICES = [
  { id: "en-US-AriaNeural", label: "Aria (EN-US, F)" },
  { id: "en-US-GuyNeural", label: "Guy (EN-US, M)" },
  { id: "en-GB-SoniaNeural", label: "Sonia (EN-GB, F)" },
  { id: "en-AU-NatashaNeural", label: "Natasha (EN-AU, F)" },
  { id: "vi-VN-HoaiMyNeural", label: "Hoài My (VI, F)" },
  { id: "vi-VN-NamMinhNeural", label: "Nam Minh (VI, M)" },
  { id: "ja-JP-NanamiNeural", label: "Nanami (JA, F)" },
  { id: "ko-KR-SunHiNeural", label: "Sun-Hi (KO, F)" },
  { id: "zh-CN-XiaoxiaoNeural", label: "Xiaoxiao (ZH, F)" },
  { id: "fr-FR-DeniseNeural", label: "Denise (FR, F)" },
  { id: "de-DE-KatjaNeural", label: "Katja (DE, F)" },
  { id: "es-ES-ElviraNeural", label: "Elvira (ES, F)" },
];

export function CaptionTextEditor({
  slide,
  slideId,
}: {
  slide: SlideIndex;
  slideId: string;
}) {
  const { dispatch } = useEditBus();
  const [text, setText] = useState(slide.voiceover.text);

  useEffect(() => {
    setText(slide.voiceover.text);
  }, [slide.voiceover.text]);

  useEffect(() => {
    if (text === slide.voiceover.text) return;
    const t = setTimeout(() => {
      dispatch(setVoiceover(slideId, { text }));
    }, 200);
    return () => clearTimeout(t);
  }, [text, slide.voiceover.text, slideId, dispatch]);

  const sentences = splitSentences(text);
  const wordCount = sentences.reduce((sum, s) => sum + splitWords(s).length, 0);
  const vo = slide.voiceover;

  const param = (key: "rate" | "pitch" | "volume", placeholder: string) => ({
    value: vo[key] ?? "",
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      dispatch(setVoiceover(slideId, { [key]: e.target.value })),
    placeholder,
  });

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Caption text
        </span>
        <span className="font-mono text-[10px] text-muted-foreground">
          {wordCount} words · {sentences.length} sentences
        </span>
      </div>
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={5}
        placeholder="Type the narration for this slide. Each word becomes a karaoke caption."
        className="resize-none bg-background text-sm"
      />

      <div className="space-y-1.5">
        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
          Voice
        </span>
        <select
          value={vo.voice}
          onChange={(e) =>
            dispatch(setVoiceover(slideId, { voice: e.target.value }))
          }
          className="h-8 w-full rounded border border-border bg-background px-2 text-xs"
        >
          {VOICES.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
      </div>

      <div className="grid grid-cols-3 gap-1.5">
        <label className="space-y-0.5">
          <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
            Rate
          </span>
          <input
            {...param("rate", "+0%")}
            className="h-7 w-full rounded border border-border bg-background px-1.5 font-mono text-[10px]"
          />
        </label>
        <label className="space-y-0.5">
          <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
            Pitch
          </span>
          <input
            {...param("pitch", "+0Hz")}
            className="h-7 w-full rounded border border-border bg-background px-1.5 font-mono text-[10px]"
          />
        </label>
        <label className="space-y-0.5">
          <span className="text-[9px] uppercase tracking-wide text-muted-foreground">
            Volume
          </span>
          <input
            {...param("volume", "+0%")}
            className="h-7 w-full rounded border border-border bg-background px-1.5 font-mono text-[10px]"
          />
        </label>
      </div>

      <p className="text-[10px] text-muted-foreground">
        Text drives both voiceover (TTS) and on-stage captions.
      </p>
    </div>
  );
}
