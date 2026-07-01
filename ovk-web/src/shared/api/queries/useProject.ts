/**
 * useProject — TanStack Query hook for a single project bundle.
 *
 * The fixture project from MSW contains root + all slides in one response.
 * P7 swaps the handler for a real FastAPI call without touching call sites.
 */
import { useQuery } from "@tanstack/react-query";

import { client } from "../client";

export function useProject(projectId: string) {
  return useQuery({
    queryKey: ["project", projectId],
    queryFn: () => client.getProject(projectId),
  });
}
