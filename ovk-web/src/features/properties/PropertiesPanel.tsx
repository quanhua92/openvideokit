/**
 * PropertiesPanel — read-only view of the active slide's index.json.
 *
 * P3 flips the fields editable; P2 just displays them so the data flow is
 * visible end-to-end.
 */
import {
	CircleAlert,
	Image as ImageIcon,
	Mic,
	Type,
	Wand2,
} from "lucide-react";

import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import type { SlideIndex } from "@/shared/api/schemas/slideIndex";

export function PropertiesPanel({ slide }: { slide: SlideIndex | null }) {
	if (!slide) {
		return (
			<div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
				No active slide.
			</div>
		);
	}

	const entries = Object.entries(slide.fields);

	return (
		<div className="flex h-full flex-col overflow-hidden">
			<header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
				<h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					Properties
				</h2>
				<span className="font-mono text-[10px] text-muted-foreground">
					{slide.id} · {slide.duration.toFixed(1)}s
				</span>
			</header>
			<div className="flex-1 space-y-4 overflow-auto p-4">
				<Section icon={Type} title="Fields">
					{entries.length === 0 ? (
						<p className="text-xs text-muted-foreground">No fields.</p>
					) : (
						<div className="space-y-2">
							{entries.map(([id, value]) => (
								<FieldRow key={id} id={id} value={value} />
							))}
						</div>
					)}
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
					<p className="text-xs text-foreground/90">{slide.voiceover.text}</p>
					<p className="mt-1 font-mono text-[10px] text-muted-foreground">
						{slide.voiceover.voice}
					</p>
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
					<span>Editing lands in P3.</span>
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

function FieldRow({ id, value }: { id: string; value: string }) {
	const isMultiline = value.length > 60 || value.includes("\n");
	return (
		<div className="space-y-1">
			<div className="text-[10px] uppercase tracking-wide text-muted-foreground">
				{id}
			</div>
			<Textarea
				readOnly
				value={value}
				rows={isMultiline ? 3 : 1}
				className={cn(
					"resize-none bg-muted/40 font-mono text-xs",
					!isMultiline && "py-1",
				)}
			/>
		</div>
	);
}
