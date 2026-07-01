import { createFileRoute, Link } from "@tanstack/react-router";

import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/")({ component: Home });

function Home() {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 p-8 text-center">
      <div>
        <h1 className="text-3xl font-bold">OpenVideoKit</h1>
        <p className="mt-2 text-muted-foreground">
          Scene-based, AI-assisted HTML-slide video editor.
        </p>
      </div>
      <Button asChild>
        <Link to="/projects/$projectId" params={{ projectId: "proj-1" }}>
          Open demo project
        </Link>
      </Button>
    </div>
  );
}
