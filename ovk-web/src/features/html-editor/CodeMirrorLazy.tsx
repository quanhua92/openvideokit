/**
 * CodeMirrorLazy — dynamic import wrapper for @uiw/react-codemirror.
 *
 * CodeMirror 6 (~400KB) is route-split: the chunk loads only when the user
 * opens the HTML tab. Skeleton fallback until then.
 */

import { html } from "@codemirror/lang-html";
import type { Extension } from "@codemirror/state";
import { lazy, Suspense } from "react";

import { Skeleton } from "@/components/ui/skeleton";
import { useTheme } from "@/shared/lib/useTheme";

const CodeMirror = lazy(() => import("@uiw/react-codemirror"));

const extensions: Extension[] = [html()];

export function CodeMirrorLazy({
	value,
	onChange,
}: {
	value: string;
	onChange: (value: string) => void;
}) {
	const { resolved } = useTheme();

	return (
		<Suspense
			fallback={
				<div className="space-y-2 p-3">
					<Skeleton className="h-4 w-3/4" />
					<Skeleton className="h-4 w-1/2" />
					<Skeleton className="h-4 w-2/3" />
				</div>
			}
		>
			<CodeMirror
				value={value}
				onChange={(val) => onChange(val)}
				extensions={extensions}
				theme={resolved}
				basicSetup={{
					lineNumbers: true,
					highlightActiveLine: true,
					autocompletion: true,
					foldGutter: false,
				}}
				className="overflow-auto rounded-md border border-border text-xs"
				height="100%"
			/>
		</Suspense>
	);
}
