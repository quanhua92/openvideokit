/**
 * StageCanvas — letterboxed preview of the active slide + caption overlay.
 *
 * CRITICAL: CaptionLayer lives OUTSIDE the `transform: scale()` div so
 * caption text renders at real viewport resolution (not shrunken). A
 * gradient scrim behind the captions ensures legibility against any slide
 * background.
 */
import { useEffect, useRef, useState } from "react";

import { CaptionLayer } from "@/features/captions/components/CaptionLayer";
import type { CaptionStyle } from "@/shared/api/schemas/rootIndex";
import type { SlideIndex } from "@/shared/api/schemas/slideIndex";

import { scaleToFit } from "./lib/scale";

const SOURCE = { width: 1920, height: 1080 };

export function StageCanvas({
	slide,
	localTime,
	activeStart,
	captionStyle,
}: {
	slide: SlideIndex | null;
	localTime: number;
	activeStart: number;
	captionStyle: CaptionStyle;
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
			style={{ containerType: "inline-size" }}
		>
			{/* Scaled slide canvas — 1920x1080 content */}
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

			{/* Caption overlay — OUTSIDE the scale, at viewport resolution */}
			{slide && (
				<>
					<div
						className="pointer-events-none absolute inset-x-0 bottom-0 h-1/3"
						style={{
							background:
								"linear-gradient(to top, rgba(0,0,0,0.75) 0%, rgba(0,0,0,0.4) 50%, transparent 100%)",
						}}
					/>
					<CaptionLayer
						slide={slide}
						captionStyle={captionStyle}
						activeStart={activeStart}
					/>
				</>
			)}
		</div>
	);
}

function SlideView({ slide }: { slide: SlideIndex }) {
	const title = slide.fields.title ?? "";
	const body = slide.fields.body ?? "";

	return (
		<div
			style={{
				position: "absolute",
				inset: 0,
				background: "#0a0a14",
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
			{title && (
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
			)}
			{body && (
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
			)}
		</div>
	);
}
