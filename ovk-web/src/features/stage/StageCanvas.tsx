/**
 * StageCanvas — letterboxed preview of the active slide + caption overlay.
 *
 * CRITICAL: CaptionLayer lives OUTSIDE the `transform: scale()` div so
 * caption text renders at real viewport resolution (not shrunken). A
 * gradient scrim behind the captions ensures legibility against any slide
 * background.
 *
 * Slide images: loaded from IndexedDB by SHA-256 ref via useAssetUrl,
 * displayed as a cover background behind the title/body text.
 */
import { useEffect, useRef, useState } from "react";
import { useAssetUrl } from "@/features/assets/hooks/useAssetUrl";
import { CaptionLayer } from "@/features/captions/components/CaptionLayer";
import type { CaptionStyle } from "@/shared/api/schemas/rootIndex";
import type { SlideIndex } from "@/shared/api/schemas/slideIndex";
import { useCaptionSettings } from "@/shared/store/captionSettings";

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
	const { custom: captionCustom } = useCaptionSettings();

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

			{/* Caption overlay — OUTSIDE the scale, at viewport resolution.
				    Scrim only renders when captions exist AND the user has it on. */}
			{slide && slide.voiceover.text.trim() && (
				<>
					{captionCustom.scrim && (
						<div
							className="pointer-events-none absolute inset-x-0 bottom-0 h-1/4"
							style={{
								background:
									"linear-gradient(to top, rgba(0,0,0,0.5) 0%, transparent 100%)",
							}}
						/>
					)}
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
	const bgColor = slide.fields.bg ?? "#0a0a14";
	const imgUrl = useAssetUrl(slide.assets.img);

	return (
		<div
			style={{
				position: "absolute",
				inset: 0,
				background: imgUrl
					? `url(${imgUrl}) center / cover no-repeat`
					: bgColor,
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
			{/* Dark gradient overlay so text stays readable over images */}
			{imgUrl && (
				<div
					style={{
						position: "absolute",
						inset: 0,
						background:
							"linear-gradient(to bottom, rgba(0,0,0,0.2) 0%, rgba(0,0,0,0.6) 60%, rgba(0,0,0,0.8) 100%)",
					}}
				/>
			)}
			<div style={{ position: "relative", zIndex: 1, width: "100%" }}>
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
							marginLeft: "auto",
							marginRight: "auto",
							fontSize: 40,
							color: "rgba(255,255,255,0.8)",
							lineHeight: 1.4,
							maxWidth: "70%",
						}}
					>
						{body}
					</p>
				)}
			</div>
		</div>
	);
}
