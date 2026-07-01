/**
 * useProjectSync — keeps the server in sync with local edits and pushes
 * external changes back to the client.
 *
 * Two channels:
 *   1. SSE listener (`EventSource` on /events) — server pushes when a
 *      background agent or another client mutates the project → refetch.
 *   2. Debounced autosave — 800ms after the last local edit (EditBus) →
 *      PUT the full bundle with `rev`.  On 409, re-apply local edits onto
 *      the server's version (3-way merge) and retry once.  If the retry
 *      also fails, show the server's version + a clear error toast.
 *
 * After any successful PUT or SSE push, bumps `compositionVersion` so the
 * HF player reloads its iframe with the re-stamped composition.
 */
import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import type { ProjectBundle } from "@/shared/api/client";
import { ConflictError, client } from "@/shared/api/client";
import { reapplyLocalEdits } from "@/shared/api/queries/reapply";
import { useProject } from "@/shared/api/queries/useProject";
import { apiBaseUrl } from "@/shared/config";
import { useCompositionVersion } from "@/shared/store/compositionVersion";

const SAVE_DEBOUNCE_MS = 800;

export function useProjectSync(projectId: string) {
  const queryClient = useQueryClient();
  const query = useProject(projectId);
  const bumpVersion = useCompositionVersion((s) => s.bump);
  const baseRef = useRef<ProjectBundle | null>(null);
  const lastSerialized = useRef("");
  const isFetching = useRef(false);

  // ── SSE: listen for external mutations ───────────────────────────────
  useEffect(() => {
    const url = `${apiBaseUrl}/projects/${encodeURIComponent(projectId)}/events`;
    const es = new EventSource(url);

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (!data.rev) return;

        // Skip echoes of our own writes (PUT response already updated us).
        if (baseRef.current && data.rev === baseRef.current.rev) return;

        // Check for unsaved local edits — if we have pending changes,
        // DON'T invalidate (the refetch would overwrite them).  The
        // debounce PUT will reconcile via 409 + 3-way merge.
        const current = queryClient.getQueryData<ProjectBundle>([
          "project",
          projectId,
        ]);
        const currentSerialized = current
          ? JSON.stringify({
              root: current.root,
              slides: current.slides,
              slideHtml: current.slideHtml,
            })
          : "";

        if (currentSerialized !== lastSerialized.current) {
          // Unsaved local changes — just reload the preview, don't refetch.
          bumpVersion();
          return;
        }

        // No local changes — safe to refetch server data.
        isFetching.current = true;
        queryClient.invalidateQueries({ queryKey: ["project", projectId] });
        bumpVersion();
      } catch {
        // keepalive ping or malformed — ignore
      }
    };

    return () => es.close();
  }, [projectId, queryClient, bumpVersion]);

  // ── Debounced autosave on local edits ────────────────────────────────
  useEffect(() => {
    if (!query.data) return;

    const serialized = JSON.stringify({
      root: query.data.root,
      slides: query.data.slides,
      slideHtml: query.data.slideHtml,
    });

    // First load — capture server state, don't autosave.
    if (!baseRef.current) {
      baseRef.current = query.data;
      lastSerialized.current = serialized;
      return;
    }

    // Server-originated data (SSE refetch or PUT success echo) — update
    // baseRef, don't autosave.
    if (isFetching.current || serialized === lastSerialized.current) {
      isFetching.current = false;
      baseRef.current = query.data;
      lastSerialized.current = serialized;
      return;
    }

    // ── Local edit — debounced PUT ──────────────────────────────────────
    const timer = setTimeout(async () => {
      const local = query.data;
      try {
        const updated = await client.saveProject(projectId, local);
        baseRef.current = updated;
        lastSerialized.current = JSON.stringify({
          root: updated.root,
          slides: updated.slides,
          slideHtml: updated.slideHtml,
        });
        queryClient.setQueryData(["project", projectId], updated);
        bumpVersion();
      } catch (e) {
        if (e instanceof ConflictError && baseRef.current) {
          // 3-way merge: re-apply user's local edits onto server's version.
          const merged = reapplyLocalEdits(
            baseRef.current,
            local,
            e.serverBundle,
          );
          try {
            const updated = await client.saveProject(projectId, merged);
            baseRef.current = updated;
            lastSerialized.current = JSON.stringify({
              root: updated.root,
              slides: updated.slides,
              slideHtml: updated.slideHtml,
            });
            queryClient.setQueryData(["project", projectId], updated);
            bumpVersion();
            toast.success("Edit re-applied after sync conflict");
          } catch {
            // Retry also failed — server version wins, user must re-apply.
            baseRef.current = e.serverBundle;
            lastSerialized.current = JSON.stringify({
              root: e.serverBundle.root,
              slides: e.serverBundle.slides,
              slideHtml: e.serverBundle.slideHtml,
            });
            queryClient.setQueryData(["project", projectId], e.serverBundle);
            bumpVersion();
            toast.error(
              "Could not auto-merge — server version loaded. Please re-apply your edit.",
              { duration: 8000 },
            );
          }
        } else {
          toast.error("Failed to save project");
        }
      }
    }, SAVE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query.data, projectId, queryClient, bumpVersion]);
}
