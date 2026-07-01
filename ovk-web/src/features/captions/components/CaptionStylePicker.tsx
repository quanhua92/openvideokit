/**
 * CaptionStylePicker — root-level theme selector (project-wide).
 *
 * Bound to the `setCaptionStyle` EditBus op. Mounted in the Properties panel
 * as a root-level field (not per-slide).
 */
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import type { CaptionStyle } from "@/shared/api/schemas/rootIndex";
import { useEditBus } from "@/shared/edit/EditBusProvider";
import { setCaptionStyle } from "@/shared/edit/ops";

const OPTIONS: ReadonlyArray<{ value: CaptionStyle; label: string }> = [
  { value: "highlight", label: "Highlight (yellow)" },
  { value: "neon", label: "Neon (cyan)" },
  { value: "editorial", label: "Editorial (serif)" },
  { value: "eco-green", label: "Eco green" },
];

export function CaptionStylePicker({ value }: { value: CaptionStyle }) {
  const { dispatch } = useEditBus();
  return (
    <Select value={value} onValueChange={(v) => dispatch(setCaptionStyle(v))}>
      <SelectTrigger className="h-7 w-full text-xs">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {OPTIONS.map((o) => (
          <SelectItem key={o.value} value={o.value} className="text-xs">
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}
