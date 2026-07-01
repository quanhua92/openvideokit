import { useQuery } from "@tanstack/react-query";
import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Clapperboard,
  Clock,
  Images,
  Settings,
  Sparkles,
  Square,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { client } from "@/shared/api/client";

export const Route = createFileRoute("/projects/$projectId/")({
  component: ProjectDashboard,
});

function ProjectDashboard() {
  const { projectId } = Route.useParams();
  const { data, isLoading, error } = useQuery({
    queryKey: ["project", projectId],
    queryFn: () => client.getProject(projectId),
  });

  if (isLoading) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        Loading project…
      </div>
    );
  }

  if (error instanceof Error || !data) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-destructive">
        Failed to load project: {error?.message ?? "unknown"}
      </div>
    );
  }

  const { root, slides } = data;
  const totalDuration = root.slides.reduce(
    (sum, id) => sum + (slides[id]?.duration ?? 0),
    0,
  );
  const assetCount = new Set(
    root.slides.flatMap((id) => Object.values(slides[id]?.assets ?? {})),
  ).size;

  const editorParams = { projectId };

  return (
    <div className="h-full overflow-auto p-6">
      <div className="mx-auto max-w-5xl space-y-6">
        <header className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Eco Bottle Campaign</h1>
            <p className="mt-1 text-sm text-muted-foreground">
              {root.canvas.width}×{root.canvas.height} · {root.canvas.fps} fps ·{" "}
              <span className="capitalize">{root.theme.caption_style}</span>{" "}
              captions
            </p>
          </div>
          <Button asChild>
            <Link to={EDITOR_TO} params={editorParams}>
              <Sparkles className="size-4" />
              Open editor
            </Link>
          </Button>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            icon={<Square className="size-4" />}
            label="Slides"
            value={root.slides.length.toString()}
          />
          <StatCard
            icon={<Clock className="size-4" />}
            label="Total duration"
            value={`${totalDuration.toFixed(1)}s`}
          />
          <StatCard
            icon={<Images className="size-4" />}
            label="Assets"
            value={assetCount.toString()}
          />
          <StatCard
            icon={<Clapperboard className="size-4" />}
            label="Default transition"
            value={`${root.transition_default.type} · ${root.transition_default.duration}s`}
          />
        </section>

        <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          <ActionCard
            to={EDITOR_TO}
            params={editorParams}
            icon={<Sparkles className="size-5" />}
            title="Editor"
            desc="Timeline, stage, properties, captions — the full studio."
          />
          <ActionCard
            to={EDITOR_TO}
            params={editorParams}
            icon={<Images className="size-5" />}
            title="Assets"
            desc="Browse, drop, and reuse SHA-256 content-addressed assets."
            disabled
          />
          <ActionCard
            to={EDITOR_TO}
            params={editorParams}
            icon={<Clapperboard className="size-5" />}
            title="Export"
            desc="Assemble + stamp + render via the 6-step pipeline."
            disabled
          />
          <ActionCard
            to={EDITOR_TO}
            params={editorParams}
            icon={<Settings className="size-5" />}
            title="Settings"
            desc="Canvas, theme, audio, default transitions."
            disabled
          />
        </section>

        <section>
          <h2 className="mb-3 text-sm font-semibold text-muted-foreground">
            Slides
          </h2>
          <ol className="space-y-2">
            {root.slides.map((id, idx) => {
              const slide = slides[id];
              if (!slide) return null;
              return (
                <li
                  key={id}
                  className="flex items-center gap-3 rounded-md border border-border bg-card px-4 py-3 text-sm"
                >
                  <span className="font-mono text-xs text-muted-foreground">
                    {String(idx).padStart(2, "0")}
                  </span>
                  <span className="flex-1 truncate font-medium">
                    {slide.fields.title ?? id}
                  </span>
                  <span className="text-xs text-muted-foreground">
                    {slide.duration.toFixed(1)}s
                  </span>
                </li>
              );
            })}
          </ol>
        </section>
      </div>
    </div>
  );
}

function StatCard({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between pb-2">
        <CardDescription>{label}</CardDescription>
        <span className="text-muted-foreground">{icon}</span>
      </CardHeader>
      <CardContent>
        <div className="text-xl font-semibold">{value}</div>
      </CardContent>
    </Card>
  );
}

function ActionCard({
  to,
  params,
  icon,
  title,
  desc,
  disabled,
}: {
  to: typeof EDITOR_TO;
  params: { projectId: string };
  icon: React.ReactNode;
  title: string;
  desc: string;
  disabled?: boolean;
}) {
  return (
    <Card className={disabled ? "opacity-60" : ""}>
      <CardHeader>
        <div className="flex items-center gap-2">
          <span className="text-primary">{icon}</span>
          <CardTitle className="text-base">{title}</CardTitle>
        </div>
        <CardDescription>{desc}</CardDescription>
      </CardHeader>
      <CardContent>
        <Button
          asChild={!disabled}
          variant={disabled ? "outline" : "default"}
          size="sm"
          disabled={disabled}
        >
          {disabled ? (
            <span>Ships in later phase</span>
          ) : (
            <Link to={to} params={params}>
              Open
            </Link>
          )}
        </Button>
      </CardContent>
    </Card>
  );
}

const EDITOR_TO = "/projects/$projectId/editor" as const;
