/**
 * CaptionControls — preset picker + per-property adjustments.
 *
 * The preset Select loads a starting point; the controls below let the user
 * tweak individual properties (color, glow, weight, pill, shadow). All
 * changes apply live to the stage via CSS custom properties.
 */
import { RotateCcw } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@/components/ui/select";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";
import type { CaptionStyle } from "@/shared/api/schemas/rootIndex";
import { useCaptionSettings } from "@/shared/store/captionSettings";

const PRESET_OPTIONS: ReadonlyArray<{ value: CaptionStyle; label: string }> = [
	{ value: "highlight", label: "Highlight" },
	{ value: "neon", label: "Neon" },
	{ value: "editorial", label: "Editorial" },
	{ value: "eco-green", label: "Eco green" },
];

const COLOR_SWATCHES = [
	"#ffea00",
	"#00f5ff",
	"#4ade80",
	"#ff6b6b",
	"#ffd700",
	"#a78bfa",
	"#f97316",
	"#ffffff",
];

export function CaptionControls() {
	const { preset, custom, applyPreset, patch, reset } = useCaptionSettings();

	return (
		<div className="space-y-4">
			{/* Preset picker */}
			<div className="space-y-1.5">
				<div className="flex items-center justify-between">
					<span className="text-[10px] uppercase tracking-wide text-muted-foreground">
						Preset
					</span>
					<Button
						variant="ghost"
						size="sm"
						className="h-5 gap-1 px-1.5 text-[10px] text-muted-foreground"
						onClick={reset}
					>
						<RotateCcw className="size-2.5" />
						Reset
					</Button>
				</div>
				<Select
					value={preset}
					onValueChange={(v) => applyPreset(v as CaptionStyle)}
				>
					<SelectTrigger className="h-7 w-full text-xs">
						<SelectValue />
					</SelectTrigger>
					<SelectContent>
						{PRESET_OPTIONS.map((o) => (
							<SelectItem key={o.value} value={o.value} className="text-xs">
								{o.label}
							</SelectItem>
						))}
					</SelectContent>
				</Select>
			</div>

			{/* Active text color */}
			<ColorRow
				label="Text color"
				value={custom.activeColor}
				onChange={(c) => patch({ activeColor: c })}
			/>

			{/* Non-active text color */}
			<ColorRow
				label="Dim text color"
				value={custom.dimColor}
				onChange={(c) => patch({ dimColor: c })}
			/>

			{/* Pill background color (only when pill is on) */}
			{custom.pill && (
				<ColorRow
					label="Pill color"
					value={custom.pillColor}
					onChange={(c) => patch({ pillColor: c })}
				/>
			)}

			{/* Font weight */}
			<SliderRow
				label="Font weight"
				value={custom.fontWeight}
				min={400}
				max={900}
				step={100}
				display={String(custom.fontWeight)}
				onChange={(v) => patch({ fontWeight: v })}
			/>

			{/* Glow */}
			<SliderRow
				label="Glow"
				value={custom.glow}
				min={0}
				max={1}
				step={0.05}
				display={`${Math.round(custom.glow * 100)}%`}
				onChange={(v) => patch({ glow: v })}
			/>

			{/* Dim opacity */}
			<SliderRow
				label="Dim opacity"
				value={custom.dimOpacity}
				min={0.1}
				max={1}
				step={0.05}
				display={`${Math.round(custom.dimOpacity * 100)}%`}
				onChange={(v) => patch({ dimOpacity: v })}
			/>

			{/* Font scale */}
			<SliderRow
				label="Font size"
				value={custom.fontScale}
				min={0.5}
				max={1.5}
				step={0.05}
				display={`${Math.round(custom.fontScale * 100)}%`}
				onChange={(v) => patch({ fontScale: v })}
			/>

			{/* Toggles */}
			<div className="flex gap-4">
				<Toggle
					label="Pill"
					checked={custom.pill}
					onChange={(v) => patch({ pill: v })}
				/>
				<Toggle
					label="Shadow"
					checked={custom.shadow}
					onChange={(v) => patch({ shadow: v })}
				/>
				<Toggle
					label="Scrim"
					checked={custom.scrim}
					onChange={(v) => patch({ scrim: v })}
				/>
			</div>
		</div>
	);
}

function SliderRow({
	label,
	value,
	min,
	max,
	step,
	display,
	onChange,
}: {
	label: string;
	value: number;
	min: number;
	max: number;
	step: number;
	display: string;
	onChange: (v: number) => void;
}) {
	return (
		<div className="space-y-1">
			<div className="flex items-center justify-between">
				<span className="text-[10px] uppercase tracking-wide text-muted-foreground">
					{label}
				</span>
				<span className="font-mono text-[10px] text-muted-foreground">
					{display}
				</span>
			</div>
			<Slider
				value={[value]}
				min={min}
				max={max}
				step={step}
				onValueChange={(v) => onChange(v[0] ?? value)}
			/>
		</div>
	);
}

function Toggle({
	label,
	checked,
	onChange,
}: {
	label: string;
	checked: boolean;
	onChange: (v: boolean) => void;
}) {
	return (
		<button
			type="button"
			onClick={() => onChange(!checked)}
			className={cn(
				"flex items-center gap-1.5 rounded-md border px-2 py-1 text-[10px] font-medium transition",
				checked
					? "border-primary bg-primary/10 text-primary"
					: "border-border text-muted-foreground",
			)}
		>
			<span
				className={cn(
					"size-2 rounded-full",
					checked ? "bg-primary" : "bg-muted-foreground",
				)}
			/>
			{label}
		</button>
	);
}

function ColorRow({
	label,
	value,
	onChange,
}: {
	label: string;
	value: string;
	onChange: (c: string) => void;
}) {
	return (
		<div className="space-y-1.5">
			<span className="text-[10px] uppercase tracking-wide text-muted-foreground">
				{label}
			</span>
			<div className="flex items-center gap-2">
				<input
					type="color"
					value={value}
					onChange={(e) => onChange(e.target.value)}
					className="size-7 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0"
				/>
				<input
					type="text"
					value={value}
					onChange={(e) => onChange(e.target.value)}
					className="h-7 w-20 rounded border border-border bg-background px-2 font-mono text-xs"
				/>
				<div className="flex flex-wrap gap-1">
					{COLOR_SWATCHES.map((c) => (
						<button
							key={c}
							type="button"
							onClick={() => onChange(c)}
							className={cn(
								"size-4 rounded-full border transition",
								value.toLowerCase() === c.toLowerCase()
									? "border-foreground ring-1 ring-foreground"
									: "border-border",
							)}
							style={{ backgroundColor: c }}
							aria-label={`Color ${c}`}
						/>
					))}
				</div>
			</div>
		</div>
	);
}
