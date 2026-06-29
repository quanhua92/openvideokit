/**
 * StageCanvas — letterboxed preview of the active slide.
 *
 * P2 implementation: a 1920×1080 div is scaled via `transform: scale()` to
 * fit the parent container (measured with ResizeObserver). The slide's
 * title/body fields are rendered as a basic title card.
 *
 * P2+ (when HF lands): swap <SlideView> for an iframe running the HF player
 * and drive `tl.time(localTime)` via rAF from the playhead.
 */
import { useEffect, useRef, useState } from "react";
import type { SlideIndex } from "@/shared/api/schemas/slideIndex";
import { scaleToFit } from "./lib/scale";

const SOURCE = { width: 1920, height: 1080 };

export function StageCanvas({
	slide,
	localTime,
}: {
	slide: SlideIndex | null;
	localTime: number;
}) {
	const containerRef = useRef<HTMLDivElement>(null);
	const [scale, setScale] = useState(0.2);

	useEffect(() => {
		const el = containerRef.current;
		if (!el) return;
		const measure = () => {
			const r = el.getBoundingClientRect();
			setScale(scaleToFit(SOURCE, { width: r.width, height: r.height }));
		};
		measure();
		const ro = new ResizeObserver(measure);
		ro.observe(el);
		return () => ro.disconnect();
	}, []);

	void localTime;

	return (
		<div
			ref={containerRef}
			className="relative flex h-full w-full items-center justify-center overflow-hidden bg-neutral-950"
		>
			<div
				className="absolute"
				style={{
					width: SOURCE.width,
					height: SOURCE.height,
					transform: `scale(${scale})`,
					transformOrigin: "center center",
				}}
			>
				{slide ? (
					<SlideView slide={slide} />
				) : (
					<div className="flex h-full items-center justify-center text-neutral-500">
						No active slide
					</div>
				)}
			</div>
		</div>
	);
}

/**
 * Static rendering of a slide's fields. P2 uses a basic title-card layout
 * derived from the slide's `title` and `body` fields. Real HF rendering
 * (with the slide's index.html + GSAP) lands later.
 */
function SlideView({ slide }: { slide: SlideIndex }) {
	const title = slide.fields.title ?? "";
	const body = slide.fields.body ?? "";
	const bg = "#0a0a14";
	const accent = "#4ade80";

	return (
		<div
			style={{
				position: "absolute",
				inset: 0,
				background: bg,
				color: "white",
				display: "flex",
				flexDirection: "column",
				alignItems: "center",
				justifyContent: "center",
				textAlign: "center",
				padding: "0 10%",
				fontFamily: "system-ui, sans-serif",
			}}
		>
			{title ? (
				<h1
					style={{
						fontSize: 120,
						fontWeight: 800,
						margin: 0,
						lineHeight: 1.1,
						letterSpacing: "-0.02em",
					}}
				>
					{title}
				</h1>
			) : null}
			{body ? (
				<p
					style={{
						marginTop: 32,
						fontSize: 40,
						color: "rgba(255,255,255,0.7)",
						lineHeight: 1.4,
						maxWidth: "70%",
					}}
				>
					{body}
				</p>
			) : null}
			<div
				style={{
					position: "absolute",
					bottom: 80,
					fontSize: 24,
					color: accent,
					letterSpacing: "0.15em",
					textTransform: "uppercase",
				}}
			>
				OpenVideoKit
			</div>
		</div>
	);
}
