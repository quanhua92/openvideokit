/**
 * HtmlEditor — per-slide HTML editor for bare `<template>` compositions.
 *
 * Loads CodeMirror 6 lazily (route-split ~400KB chunk). Runs lintHtml on
 * every change; LintGate gates Accept behind R1–R4. Accept dispatches
 * setSlideHtml via EditBus; Revert restores prior.
 */
import { Code2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

import DEFAULT_SHELL from "./default.html?raw";
import { CodeMirrorLazy } from "./CodeMirrorLazy";
import { LintGate } from "./LintGate";

export function HtmlEditor({
	slideId,
	prior,
}: {
	slideId: string;
	prior: string;
}) {
	const [edited, setEdited] = useState(prior || DEFAULT_SHELL);
	const prevSlideId = useRef(slideId);
	const prevPrior = useRef(prior);

	// Sync when slide changes or when external patches change prior
	useEffect(() => {
		if (slideId !== prevSlideId.current) {
			prevSlideId.current = slideId;
			prevPrior.current = prior;
			setEdited(prior || DEFAULT_SHELL);
		} else if (prior !== prevPrior.current) {
			prevPrior.current = prior;
			setEdited(prior || DEFAULT_SHELL);
		}
	}, [slideId, prior]);

	return (
		<div className="flex h-full flex-col">
			<header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
				<div className="flex items-center gap-1.5">
					<Code2 className="size-3.5 text-muted-foreground" />
					<h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
						HTML Editor
					</h2>
				</div>
				<span className="font-mono text-[10px] text-muted-foreground">
					{slideId}
				</span>
			</header>

			<div className="min-h-0 flex-1 overflow-hidden p-2">
				<CodeMirrorLazy value={edited} onChange={setEdited} />
			</div>

			<LintGate
				slideId={slideId}
				prior={prior}
				edited={edited}
				onRevert={() => setEdited(prior)}
			/>
		</div>
	);
}
