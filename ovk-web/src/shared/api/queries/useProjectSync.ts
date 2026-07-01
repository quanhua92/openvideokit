/**
 * useProjectSync — keeps the server in sync with local edits and pushes
 * external changes back to the client.
 *
 * Two channels:
 *   1. SSE listener (`EventSource` on /events) — server pushes when a
 *      background agent or another client mutates the project → refetch.
 *   2. Debounced autosave — 800ms after the last local edit (EditBus) →
 *      PUT the full bundle with `rev`.  On 409, refetch (server won).
 *
 * After any successful PUT or SSE push, bumps `compositionVersion` so the
 * HF player reloads its iframe with the re-stamped composition.
 */

import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef } from "react";
import { toast } from "sonner";
import { ConflictError, client } from "@/shared/api/client";
import { useProject } from "@/shared/api/queries/useProject";
import { apiBaseUrl } from "@/shared/config";
import { useCompositionVersion } from "@/shared/store/compositionVersion";

const SAVE_DEBOUNCE_MS = 800;

export function useProjectSync(projectId: string) {
  const queryClient = useQueryClient();
  const query = useProject(projectId);
  const bumpVersion = useCompositionVersion((s) => s.bump);
  const lastSerialized = useRef("");
  const isFetching = useRef(false);

  // ── SSE: listen for external mutations ───────────────────────────────
  useEffect(() => {
    const url = `${apiBaseUrl}/projects/${encodeURIComponent(projectId)}/events`;
    const es = new EventSource(url);

    es.onmessage = (e) => {
      try {
        const data = JSON.parse(e.data);
        if (data.rev) {
          isFetching.current = true;
          queryClient.invalidateQueries({ queryKey: ["project", projectId] });
          bumpVersion();
        }
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

    // Skip if nothing actually changed (e.g. server response after refetch).
    if (serialized === lastSerialized.current || isFetching.current) {
      isFetching.current = false;
      return;
    }

    const timer = setTimeout(async () => {
      try {
        const updated = await client.saveProject(projectId, query.data);
        lastSerialized.current = JSON.stringify({
          root: updated.root,
          slides: updated.slides,
          slideHtml: updated.slideHtml,
        });
        queryClient.setQueryData(["project", projectId], updated);
        bumpVersion();
      } catch (e) {
        if (e instanceof ConflictError) {
          queryClient.setQueryData(["project", projectId], e.serverBundle);
          toast.error("Project updated by another agent — changes reloaded");
        } else {
          toast.error("Failed to save project");
        }
      }
    }, SAVE_DEBOUNCE_MS);

    return () => clearTimeout(timer);
  }, [query.data, projectId, queryClient, bumpVersion]);
}
