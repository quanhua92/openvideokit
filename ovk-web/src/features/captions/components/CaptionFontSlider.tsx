/**
 * CaptionFontSlider — adjusts caption text size. Persisted to localStorage.
 */
import { Slider } from "@/components/ui/slider";
import { useCaptionSettings } from "@/shared/store/captionSettings";

export function CaptionFontSlider() {
	const fontScale = useCaptionSettings((s) => s.fontScale);
	const setFontScale = useCaptionSettings((s) => s.setFontScale);

	const pct = Math.round(fontScale * 100);

	return (
		<div className="space-y-1.5">
			<div className="flex items-center justify-between">
				<span className="text-[10px] uppercase tracking-wide text-muted-foreground">
					Font size
				</span>
				<span className="font-mono text-[10px] text-muted-foreground">
					{pct}%
				</span>
			</div>
			<Slider
				value={[fontScale]}
				min={0.5}
				max={1.5}
				step={0.05}
				onValueChange={(v) => setFontScale(v[0] ?? 1)}
				aria-label="Caption font size"
			/>
		</div>
	);
}
