/**
 * PropertiesPanel — editable view of the active slide's index.json.
 *
 * Editing model: every field is a controlled input bound to local state.
 * On change we dispatch `setField` through the EditBus (debounced 200ms for
 * text so the studio doesn't re-render per keystroke; immediate for voice
 * and transition since those are discrete selects).
 *
 * When a real HF renderer + GSAP timelines land, switch to ref-write live
 * binding (useLiveBind) so the slide's animation state survives each edit.
 */
import {
	CircleAlert,
	Image as ImageIcon,
	Mic,
	Trash2,
	Type,
	Wand2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { SlideIndex } from "@/shared/api/schemas/slideIndex";
import { useEditBus } from "@/shared/edit/EditBusProvider";
import { removeSlide, setField, setVoiceover } from "@/shared/edit/ops";

export function PropertiesPanel({
	slide,
	slideId,
}: {
	slide: SlideIndex | null;
	slideId: string | null;
}) {
	const { dispatch } = useEditBus();

	if (!slide || !slideId) {
		return (
			<div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
				No active slide.
			</div>
		);
	}

	return (
		<div className="flex h-full flex-col overflow-hidden">
			<header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
				<h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					Properties
				</h2>
				<div className="flex items-center gap-2">
					<span className="font-mono text-[10px] text-muted-foreground">
						{slide.id} · {slide.duration.toFixed(1)}s
					</span>
					<Button
						variant="ghost"
						size="icon"
						className="size-6 text-destructive hover:text-destructive"
						aria-label="Delete slide"
						onClick={() => {
							dispatch(removeSlide(slideId));
							toast.success(`Removed ${slideId}`);
						}}
					>
						<Trash2 className="size-3.5" />
					</Button>
				</div>
			</header>
			<div className="flex-1 space-y-4 overflow-auto p-4">
				<Section icon={Type} title="Fields">
					<div className="space-y-2">
						{Object.entries(slide.fields).map(([id, value]) => (
							<FieldInput
								key={id}
								slideId={slideId}
								fieldId={id}
								initialValue={value}
							/>
						))}
					</div>
				</Section>

				<Section icon={ImageIcon} title="Assets">
					{Object.keys(slide.assets).length === 0 ? (
						<p className="text-xs text-muted-foreground">No assets.</p>
					) : (
						<ul className="space-y-1 font-mono text-[11px] text-muted-foreground">
							{Object.entries(slide.assets).map(([id, ref]) => (
								<li key={id} className="truncate">
									<span className="text-foreground">{id}</span>:{" "}
									{ref.slice(0, 20)}…
								</li>
							))}
						</ul>
					)}
				</Section>

				<Section icon={Mic} title="Voiceover">
					<VoiceoverInput slideId={slideId} slide={slide} />
				</Section>

				<Section icon={Wand2} title="Transition">
					{slide.transition ? (
						<p className="text-xs text-foreground/90">
							{slide.transition.type} · {slide.transition.duration}s
						</p>
					) : (
						<p className="text-xs text-muted-foreground">
							Inherits root default.
						</p>
					)}
				</Section>

				<div className="flex items-center gap-2 rounded-md border border-dashed border-border bg-muted/30 p-2 text-[11px] text-muted-foreground">
					<CircleAlert className="size-3 shrink-0" />
					<span>
						Duration is measured — P4 wires the voiceover → TTS pipeline.
					</span>
				</div>
			</div>
		</div>
	);
}

function Section({
	icon: Icon,
	title,
	children,
}: {
	icon: React.ComponentType<{ className?: string }>;
	title: string;
	children: React.ReactNode;
}) {
	return (
		<section className="space-y-1.5">
			<header className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
				<Icon className="size-3" />
				{title}
			</header>
			{children}
		</section>
	);
}

function FieldInput({
	slideId,
	fieldId,
	initialValue,
}: {
	slideId: string;
	fieldId: string;
	initialValue: string;
}) {
	const { dispatch } = useEditBus();
	const [value, setValue] = useState(initialValue);

	// Sync external → local when the slide (or field) changes.
	useEffect(() => {
		setValue(initialValue);
	}, [initialValue]);

	// Debounced dispatch — 200ms after the last keystroke.
	useEffect(() => {
		if (value === initialValue) return;
		const t = setTimeout(() => {
			dispatch(setField(slideId, fieldId, value));
		}, 200);
		return () => clearTimeout(t);
	}, [value, initialValue, slideId, fieldId, dispatch]);

	const isMultiline = value.length > 60 || value.includes("\n");
	return (
		<div className="space-y-1">
			<div className="text-[10px] uppercase tracking-wide text-muted-foreground">
				{fieldId}
			</div>
			<Textarea
				value={value}
				onChange={(e) => setValue(e.target.value)}
				rows={isMultiline ? 3 : 1}
				className={cn(
					"resize-none bg-background font-mono text-xs",
					!isMultiline && "py-1",
				)}
			/>
		</div>
	);
}

function VoiceoverInput({
	slideId,
	slide,
}: {
	slideId: string;
	slide: SlideIndex;
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

	return (
		<div className="space-y-1">
			<Textarea
				value={text}
				onChange={(e) => setText(e.target.value)}
				rows={3}
				className="resize-none bg-background text-xs"
			/>
			<p className="font-mono text-[10px] text-muted-foreground">
				{slide.voiceover.voice}
			</p>
		</div>
	);
}
