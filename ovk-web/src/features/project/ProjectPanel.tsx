import { Palette, Sliders, Type } from "lucide-react";
import type { ComponentType, ReactNode } from "react";
import type { ProjectBundle } from "@/shared/api/client";

export function ProjectPanel({ project }: { project: ProjectBundle }) {
	const { root } = project;

	return (
		<div className="flex h-full flex-col overflow-hidden">
			<header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
				<h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
					Project
				</h2>
				<span className="font-mono text-[10px] text-muted-foreground">
					v{root.version}
				</span>
			</header>

			<div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
				<Section icon={Sliders} title="Canvas">
					<Row label="Resolution">
						{root.canvas.width}×{root.canvas.height}
					</Row>
					<Row label="Frame rate">{root.canvas.fps} fps</Row>
					<Row label="Slides">{root.slides.length}</Row>
				</Section>

				<Section icon={Sliders} title="Default transition">
					<Row label="Type">{root.transition_default.type || "—"}</Row>
					<Row label="Duration">
						{root.transition_default.duration > 0
							? `${root.transition_default.duration}s`
							: "—"}
					</Row>
				</Section>

				<Section icon={Type} title="Fonts">
					{Object.entries(root.theme.fonts).map(([k, v]) => (
						<Row key={k} label={k}>
							{v}
						</Row>
					))}
				</Section>

				<Section icon={Palette} title="Theme colors">
					<div className="flex flex-wrap gap-2 pt-1">
						{Object.entries(root.theme.colors).map(([k, v]) => (
							<div key={k} className="flex items-center gap-1.5">
								<span
									className="size-4 rounded-full border border-border"
									style={{ backgroundColor: v }}
								/>
								<span className="font-mono text-[10px] text-muted-foreground">
									{k}
								</span>
							</div>
						))}
					</div>
				</Section>
			</div>
		</div>
	);
}

function Section({
	icon: Icon,
	title,
	children,
}: {
	icon: ComponentType<{ className?: string }>;
	title: string;
	children: ReactNode;
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

function Row({ label, children }: { label: string; children: ReactNode }) {
	return (
		<div className="flex items-center justify-between py-0.5 text-xs">
			<span className="text-muted-foreground">{label}</span>
			<span className="font-mono">{children}</span>
		</div>
	);
}
