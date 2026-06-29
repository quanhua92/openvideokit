/**
 * CaptionTextEditor — edits the slide's voiceover.text inline from the
 * Captions tab. The caption words are the voiceover text split into words
 * via timeWordsByCharRatio, so editing here immediately changes what
 * renders on the stage.
 *
 * Bound to the same `setVoiceover` EditBus op as the Properties panel —
 * both surfaces stay in sync automatically.
 */
import { useEffect, useState } from "react";

import { Textarea } from "@/components/ui/textarea";
import { splitWords } from "@/features/captions/lib/timeWordsByCharRatio";
import { splitSentences } from "@/features/voiceover/lib/text";
import type { SlideIndex } from "@/shared/api/schemas/slideIndex";
import { useEditBus } from "@/shared/edit/EditBusProvider";
import { setVoiceover } from "@/shared/edit/ops";

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
			dispatch(setVoiceover(slideId, text));
		}, 200);
		return () => clearTimeout(t);
	}, [text, slide.voiceover.text, slideId, dispatch]);

	const sentences = splitSentences(text);
	const wordCount = sentences.reduce((sum, s) => sum + splitWords(s).length, 0);

	return (
		<div className="space-y-1.5">
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
				rows={6}
				placeholder="Type the narration for this slide. Each word becomes a karaoke caption."
				className="resize-none bg-background text-sm"
			/>
			<p className="text-[10px] text-muted-foreground">
				This text drives both the voiceover (TTS) and the on-stage captions.
				Editing it here also updates Properties → Voiceover.
			</p>
		</div>
	);
}
