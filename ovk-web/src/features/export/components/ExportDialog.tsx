/**
 * ExportDialog — 6-step pipeline progress UI.
 *
 * Shows each step with its status (pending → running → done), a progress
 * bar during the render step, and a result message on completion.
 */
import { CheckCircle2, Circle, Loader2 } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";
import {
	Dialog,
	DialogContent,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";
import { cn } from "@/lib/utils";

import { type ExportStep, useExportJob } from "../hooks/useExportJob";

const STEP_LABELS: Record<string, string> = {
	assemble: "Assemble workspace",
	stamp: "Stamp __FIELD__ placeholders",
	voiceover: "Generate voiceover (TTS)",
	captions: "Build caption layer",
	render: "Render MP4 (npx hyperframes)",
	done: "Complete",
};

export function ExportDialog({
	open,
	onOpenChange,
}: {
	open: boolean;
	onOpenChange: (open: boolean) => void;
}) {
	const { state, start, reset } = useExportJob();
	const [started, setStarted] = useState(false);

	const handleStart = async () => {
		setStarted(true);
		await start();
	};

	const handleClose = (next: boolean) => {
		if (!next) {
			reset();
			setStarted(false);
		}
		onOpenChange(next);
	};

	return (
		<Dialog open={open} onOpenChange={handleClose}>
			<DialogContent className="max-w-md">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2 text-base">
						Export
					</DialogTitle>
				</DialogHeader>

				{!started ? (
					<div className="space-y-3 py-2">
						<p className="text-xs text-muted-foreground">
							Runs the 6-step pipeline: assemble → stamp → voiceover → captions
							→ render. Output is a mock MP4 for now.
						</p>
						<Button className="w-full" onClick={() => void handleStart()}>
							Start export
						</Button>
					</div>
				) : (
					<div className="space-y-3 py-2">
						<StepList
							currentStep={state.step}
							completed={state.stepsCompleted}
						/>

						{state.step === "render" && (
							<div className="space-y-1">
								<div className="flex items-center justify-between text-[10px] text-muted-foreground">
									<span>Rendering frames</span>
									<span className="font-mono">{state.renderProgress}%</span>
								</div>
								<Progress value={state.renderProgress} className="h-1.5" />
							</div>
						)}

						{state.step === "done" && (
							<div className="rounded-md border border-primary/30 bg-primary/5 p-3 text-xs text-primary">
								✓ Export complete — mock MP4 generated successfully.
							</div>
						)}

						{state.step === "error" && (
							<div className="rounded-md border border-destructive/30 bg-destructive/5 p-3 text-xs text-destructive">
								Export failed: {state.error ?? "unknown error"}
							</div>
						)}

						<div className="flex gap-2">
							{state.step === "done" && (
								<Button
									variant="outline"
									size="sm"
									className="flex-1"
									onClick={() => {
										reset();
										setStarted(false);
									}}
								>
									Export again
								</Button>
							)}
							<Button
								variant="ghost"
								size="sm"
								className="flex-1"
								onClick={() => handleClose(false)}
							>
								Close
							</Button>
						</div>
					</div>
				)}
			</DialogContent>
		</Dialog>
	);
}

function StepList({
	currentStep,
	completed,
}: {
	currentStep: ExportStep;
	completed: ExportStep[];
}) {
	const visibleSteps = ["assemble", "stamp", "voiceover", "captions", "render"];

	return (
		<ul className="space-y-1">
			{visibleSteps.map((step) => {
				const isDone = completed.includes(step as ExportStep);
				const isRunning = currentStep === step;
				const isPending = !isDone && !isRunning;

				return (
					<li
						key={step}
						className={cn(
							"flex items-center gap-2 rounded-md px-2 py-1.5 text-xs",
							isRunning && "bg-primary/5",
						)}
					>
						{isDone ? (
							<CheckCircle2 className="size-3.5 shrink-0 text-primary" />
						) : isRunning ? (
							<Loader2 className="size-3.5 shrink-0 animate-spin text-primary" />
						) : (
							<Circle className="size-3.5 shrink-0 text-muted-foreground" />
						)}
						<span
							className={cn(
								isDone && "text-muted-foreground line-through",
								isRunning && "font-medium text-foreground",
								isPending && "text-muted-foreground",
							)}
						>
							{STEP_LABELS[step]}
						</span>
					</li>
				);
			})}
		</ul>
	);
}
