/**
 * ExportDialog — starts an MP4 render, then navigates to the Exports page.
 *
 * One click: "Start export" → dialog closes → Exports page opens with the
 * job already running. No confirmation screen needed.
 */
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useNavigate } from "@tanstack/react-router";
import { Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { client } from "@/shared/api/client";

export function ExportDialog({
  open,
  onOpenChange,
  projectId,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  projectId: string;
}) {
  const queryClient = useQueryClient();
  const navigate = useNavigate();

  const startExport = useMutation({
    mutationFn: () => client.startExport(projectId),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["exportJobs", projectId] });
      onOpenChange(false);
      navigate({ to: "/projects/$projectId/exports", params: { projectId } });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base">Export as MP4</DialogTitle>
        </DialogHeader>

        <div className="space-y-3 py-2">
          <p className="text-xs text-muted-foreground">
            Renders an MP4 with voiceover. You can close this dialog — track
            progress on the Exports page.
          </p>
          <Button
            className="w-full"
            onClick={() => startExport.mutate()}
            disabled={startExport.isPending}
          >
            {startExport.isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Starting…
              </>
            ) : (
              "Start export"
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
