/**
 * LintGate — displays the lint result for edited HTML and gates the Accept
 * button. If any of R1–R4 fails, shows the rule + message and disables
 * Accept. Accept dispatches `setSlideHtml` via the EditBus; Revert restores
 * the prior value.
 */
import { CheckCircle2, XCircle } from "lucide-react";
import { useMemo } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import { useEditBus } from "@/shared/edit/EditBusProvider";
import { setSlideHtml } from "@/shared/edit/ops";
import { lintHtml } from "@/shared/lib/lintHtml";

export function LintGate({
  slideId,
  prior,
  edited,
  onRevert,
}: {
  slideId: string;
  prior: string;
  edited: string;
  onRevert: () => void;
}) {
  const { dispatch } = useEditBus();
  const result = useMemo(() => lintHtml(edited), [edited]);
  const dirty = edited !== prior;

  return (
    <div className="space-y-2 border-t border-border p-3">
      {result.ok ? (
        <div className="flex items-center gap-1.5 text-xs text-primary">
          <CheckCircle2 className="size-3.5" />
          <span>{dirty ? "Ready to apply" : "No changes"}</span>
        </div>
      ) : (
        <div className="flex items-start gap-1.5 text-xs text-destructive">
          <XCircle className="mt-0.5 size-3.5 shrink-0" />
          <span>
            <span className="font-mono font-bold">{result.firedRule?.id}</span>:{" "}
            {result.firedRule?.message}
          </span>
        </div>
      )}

      <div className="flex gap-2">
        <Button
          size="sm"
          className="flex-1"
          disabled={!result.ok || !dirty}
          onClick={() => {
            dispatch(setSlideHtml(slideId, edited));
            toast.success("HTML updated");
          }}
        >
          Accept
        </Button>
        <Button size="sm" variant="ghost" disabled={!dirty} onClick={onRevert}>
          Revert
        </Button>
      </div>
    </div>
  );
}
