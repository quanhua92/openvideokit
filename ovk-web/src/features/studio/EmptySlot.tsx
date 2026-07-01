import { Skeleton } from "@/components/ui/skeleton";

import type { PanelDescriptor } from "./panels";

/**
 * Placeholder rendered in every reserved PanelSlot until the phase that
 * fills it ships. Shows the slot name, the phase it lands in, and a faux
 * loading skeleton so the studio looks alive even in P1.
 */
export function EmptySlot({ panel }: { panel: PanelDescriptor }) {
  const { label, landsIn } = panel;
  return (
    <div className="flex h-full flex-col gap-3 p-4">
      <header className="flex items-center justify-between">
        <h2 className="text-sm font-semibold">{label}</h2>
        <span className="text-xs text-muted-foreground">
          Wired in {landsIn}
        </span>
      </header>
      <div className="flex-1 space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
        <Skeleton className="h-4 w-2/3" />
      </div>
      {panel.id === "ai" && (
        <p className="rounded-md border border-dashed border-border bg-muted/30 p-3 text-xs text-muted-foreground">
          AI ready — demos in P2, real AI in P6.
        </p>
      )}
    </div>
  );
}
