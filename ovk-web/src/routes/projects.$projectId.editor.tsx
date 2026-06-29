import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/projects/$projectId/editor")({
	component: EditorStub,
});

function EditorStub() {
	return (
		<div className="flex h-full items-center justify-center p-8">
			<div className="text-center">
				<h1 className="text-2xl font-semibold">Studio</h1>
				<p className="mt-2 text-sm text-muted-foreground">
					Empty shell — P1 ships the responsive Studio layout.
				</p>
			</div>
		</div>
	);
}
