/**
 * ExportsPage — list all export jobs for a project with live status,
 * render log viewer, and download links.
 *
 * Auto-polls every 2s while any job is active (queued/running).
 * Stops polling once all jobs are terminal.
 *
 * Responsive: stacks vertically on mobile, horizontal on sm+.
 */
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import {
  ArrowLeft,
  CheckCircle2,
  Clock,
  Download,
  Loader2,
  Play,
  Terminal,
  XCircle,
} from "lucide-react";
import { useEffect, useState } from "react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { client } from "@/shared/api/client";
import type { RenderJob, RenderStatus } from "@/shared/api/schemas/renderJob";

const ACTIVE_STATES: RenderStatus[] = ["queued", "running"];

const STATUS_STYLES: Record<
  RenderStatus,
  { className: string; label: string }
> = {
  queued: {
    className: "border-amber-500/30 bg-amber-500/10 text-amber-600",
    label: "Queued",
  },
  running: {
    className: "border-blue-500/30 bg-blue-500/10 text-blue-600",
    label: "Rendering",
  },
  done: {
    className: "border-green-500/30 bg-green-500/10 text-green-600",
    label: "Done",
  },
  failed: {
    className: "border-destructive/30 bg-destructive/10 text-destructive",
    label: "Failed",
  },
  cancelled: {
    className: "border-zinc-500/30 bg-zinc-500/10 text-zinc-500",
    label: "Cancelled",
  },
};

function formatElapsed(startedAt: number, endedAt: number | null): string {
  const end = endedAt ?? Date.now() / 1000;
  const secs = Math.max(0, Math.round(end - startedAt));
  if (secs < 60) return `${secs}s`;
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}m ${s}s`;
}

function formatSize(bytes: number | undefined | null): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function ExportsPage({ projectId }: { projectId: string }) {
  const queryClient = useQueryClient();
  const [, setTick] = useState(0);

  const { data: jobs, isLoading } = useQuery({
    queryKey: ["exportJobs", projectId],
    queryFn: () => client.listExportJobs(projectId),
    refetchInterval: (query) => {
      const data = query.state.data;
      const hasActive = data?.some((j) => ACTIVE_STATES.includes(j.status));
      return hasActive ? 2000 : false;
    },
  });

  const startExport = useMutation({
    mutationFn: () => client.startExport(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exportJobs", projectId] });
    },
  });

  const cancelJob = useMutation({
    mutationFn: (jobId: string) => client.cancelExport(projectId, jobId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exportJobs", projectId] });
    },
  });

  // Re-render every second for elapsed-time updates while jobs are active
  const hasActive = jobs?.some((j) => ACTIVE_STATES.includes(j.status));
  useEffect(() => {
    if (!hasActive) return;
    const id = setInterval(() => setTick((t) => t + 1), 1000);
    return () => clearInterval(id);
  }, [hasActive]);

  return (
    <div className="h-full overflow-auto px-3 py-4 sm:p-6">
      <div className="mx-auto max-w-3xl space-y-4 sm:space-y-6">
        <header className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2 sm:gap-3">
            <Button variant="ghost" size="icon" className="shrink-0" asChild>
              <Link to="/projects/$projectId" params={{ projectId }}>
                <ArrowLeft className="size-4" />
              </Link>
            </Button>
            <h1 className="text-lg font-bold sm:text-xl">Exports</h1>
          </div>
          <Button
            size="sm"
            onClick={() => startExport.mutate()}
            disabled={startExport.isPending}
            className="shrink-0"
          >
            <Play className="size-4" />
            <span className="hidden sm:inline">
              {startExport.isPending ? "Starting…" : "New Export"}
            </span>
            <span className="sm:hidden">
              {startExport.isPending ? "…" : "New"}
            </span>
          </Button>
        </header>

        {isLoading ? (
          <div className="py-12 text-center text-sm text-muted-foreground">
            Loading…
          </div>
        ) : !jobs || jobs.length === 0 ? (
          <div className="rounded-lg border border-dashed border-border py-12 text-center sm:py-16">
            <p className="px-4 text-sm text-muted-foreground">
              No exports yet. Tap <strong>New</strong> to render an MP4.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {jobs.map((job) => (
              <JobCard
                key={job.id}
                job={job}
                projectId={projectId}
                onCancel={() => cancelJob.mutate(job.id)}
                cancelling={cancelJob.isPending}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function JobCard({
  job,
  projectId,
  onCancel,
  cancelling,
}: {
  job: RenderJob;
  projectId: string;
  onCancel: () => void;
  cancelling: boolean;
}) {
  const [showLog, setShowLog] = useState(false);
  const isActive = ACTIVE_STATES.includes(job.status);
  const style = STATUS_STYLES[job.status];

  return (
    <div className="rounded-lg border border-border bg-card p-3 sm:p-4">
      {/* Top row: icon + status badge + elapsed */}
      <div className="flex items-center gap-2 sm:gap-3">
        <StatusIcon status={job.status} />
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <Badge variant="outline" className={style.className}>
              {style.label}
            </Badge>
            <code className="truncate text-xs text-muted-foreground">
              {job.id}
            </code>
          </div>
          <div className="mt-1 flex items-center gap-3 text-xs text-muted-foreground">
            <span className="flex shrink-0 items-center gap-1">
              <Clock className="size-3" />
              {formatElapsed(job.started_at, job.ended_at)}
            </span>
            {job.size ? (
              <span className="shrink-0">{formatSize(job.size)}</span>
            ) : null}
            {job.error && (
              <span className="truncate text-destructive">{job.error}</span>
            )}
          </div>
        </div>
      </div>

      {/* Actions row — wraps below on mobile */}
      <div className="mt-3 flex items-center gap-2 border-t border-border/50 pt-3 sm:mt-0 sm:justify-end sm:border-0 sm:pt-0">
        {job.status === "done" && (
          <Button
            variant="outline"
            size="sm"
            className="flex-1 sm:flex-none"
            onClick={() => {
              const url = client.exportDownloadUrl(projectId, job.id);
              const a = document.createElement("a");
              a.href = url;
              a.download = `${projectId}-${job.id}.mp4`;
              document.body.appendChild(a);
              a.click();
              a.remove();
            }}
          >
            <Download className="size-3.5" />
            <span className="sm:hidden">Download</span>
            <span className="hidden sm:inline">MP4</span>
          </Button>
        )}
        {isActive && (
          <Button
            variant="ghost"
            size="sm"
            onClick={onCancel}
            disabled={cancelling}
            className="flex-1 text-destructive hover:text-destructive sm:flex-none"
          >
            <XCircle className="size-3.5" />
            Cancel
          </Button>
        )}
        <Button
          variant="ghost"
          size="sm"
          onClick={() => setShowLog((s) => !s)}
          className="flex-1 sm:flex-none"
        >
          <Terminal className="size-3.5" />
          Log
        </Button>
      </div>

      {showLog && <LogViewer projectId={projectId} jobId={job.id} />}
    </div>
  );
}

function StatusIcon({ status }: { status: RenderStatus }) {
  switch (status) {
    case "queued":
    case "running":
      return <Loader2 className="size-4 shrink-0 animate-spin text-blue-500" />;
    case "done":
      return <CheckCircle2 className="size-4 shrink-0 text-green-500" />;
    case "failed":
      return <XCircle className="size-4 shrink-0 text-destructive" />;
    case "cancelled":
      return <XCircle className="size-4 shrink-0 text-zinc-400" />;
  }
}

function LogViewer({ projectId, jobId }: { projectId: string; jobId: string }) {
  const { data: log, isLoading } = useQuery({
    queryKey: ["exportLog", jobId],
    queryFn: () => client.getExportLog(projectId, jobId),
    refetchInterval: 3000,
  });

  return (
    <div className="mt-3 overflow-hidden rounded-md bg-zinc-950">
      <pre
        className={cn(
          "max-h-48 overflow-auto p-3 text-xs",
          "font-mono text-zinc-300 sm:max-h-64",
        )}
      >
        {isLoading ? "Loading log…" : log || "(empty)"}
      </pre>
    </div>
  );
}
