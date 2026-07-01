/**
 * TimelinePanel — view + edit over (root.slides + per-slide durations).
 *
 * P3 behavior:
 *   - dnd-kit drag-reorder via an explicit GripVertical handle on each clip
 *     (NOT the whole clip). The clip body stays tappable for seek and
 *     swipeable for timeline scroll; only the handle initiates a drag.
 *   - PointerSensor (desktop, 6px movement) + TouchSensor (mobile, 250ms
 *     long-press + 8px tolerance) so a tap won't accidentally start a drag.
 *   - Add slide button + per-clip duplicate / remove on hover.
 */
import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  DragOverlay,
  type DragStartEvent,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  horizontalListSortingStrategy,
  SortableContext,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { Copy, GripVertical, Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import type { ProjectBundle } from "@/shared/api/client";
import { useEditBus } from "@/shared/edit/EditBusProvider";
import {
  addSlide,
  duplicateSlide,
  removeSlide,
  reorderSlides,
} from "@/shared/edit/ops";
import { usePlayhead } from "@/shared/store/playhead";
import { cumulativeStarts } from "./lib/cumulativeStarts";

const PX_PER_SEC = 32;

export function TimelinePanel({
  project,
  onSeekToSlide,
}: {
  project: ProjectBundle;
  onSeekToSlide?: (slideId: string) => void;
}) {
  const { dispatch } = useEditBus();
  const t = usePlayhead((s) => s.t);
  const seek = usePlayhead((s) => s.seek);
  const ids = project.root.slides;
  const durations = ids.map((id) => project.slides[id]?.duration ?? 0);
  const { starts, total } = cumulativeStarts(durations);

  const [activeId, setActiveId] = useState<string | null>(null);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, {
      activationConstraint: { delay: 250, tolerance: 10 },
    }),
  );

  const playheadX = t * PX_PER_SEC;
  const totalWidth = Math.max(total * PX_PER_SEC + 80, 600);

  let activeIndex = starts.findIndex((s, i) => t >= s && t < s + durations[i]);
  if (activeIndex === -1 && t >= total && ids.length > 0)
    activeIndex = ids.length - 1;
  const activeSlideId = activeIndex >= 0 ? ids[activeIndex] : null;

  const onDragStart = (e: DragStartEvent) => setActiveId(String(e.active.id));
  const onDragEnd = (e: DragEndEvent) => {
    setActiveId(null);
    const { active, over } = e;
    if (!over || active.id === over.id) return;
    const oldIndex = ids.indexOf(String(active.id));
    const newIndex = ids.indexOf(String(over.id));
    if (oldIndex < 0 || newIndex < 0) return;
    const next = [...ids];
    next.splice(oldIndex, 1);
    next.splice(newIndex, 0, String(active.id));
    dispatch(reorderSlides(next));
  };

  const handleAdd = () => {
    const newId = `slide-${Math.random().toString(36).slice(2, 8)}`;
    const lastId = ids[ids.length - 1];
    dispatch(addSlide(newId, "default", lastId));
    toast.success(`Added ${newId}`);
  };

  const handleDuplicateActive = () => {
    if (!activeSlideId) return;
    const newId = `slide-${Math.random().toString(36).slice(2, 8)}`;
    dispatch(duplicateSlide(activeSlideId, newId));
    toast.success(`Duplicated ${activeSlideId}`);
  };

  const handleRemoveActive = () => {
    if (!activeSlideId) return;
    dispatch(removeSlide(activeSlideId));
    toast.success(`Removed ${activeSlideId}`);
  };

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border px-4 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Timeline
        </h2>
        <div className="flex items-center gap-2">
          <span className="font-mono text-xs text-muted-foreground">
            {t.toFixed(1)}s / {total.toFixed(1)}s
          </span>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="size-6"
                onClick={handleAdd}
                aria-label="Add slide"
              >
                <Plus className="size-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent>Add slide</TooltipContent>
          </Tooltip>
        </div>
      </div>

      <div className="flex items-center gap-2 border-b border-border bg-muted/20 px-4 py-1.5 min-h-[36px]">
        {activeSlideId ? (
          <>
            <span className="text-[10px] font-medium text-muted-foreground uppercase tracking-wider mr-2">
              {project.slides[activeSlideId]?.fields.title || activeSlideId}
            </span>
            <div className="h-3 w-px bg-border mx-1" />
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs"
              onClick={handleDuplicateActive}
            >
              <Copy className="mr-1.5 size-3" /> Duplicate
            </Button>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2 text-xs text-destructive hover:text-destructive"
              onClick={handleRemoveActive}
            >
              <Trash2 className="mr-1.5 size-3" /> Delete
            </Button>
          </>
        ) : (
          <span className="text-xs text-muted-foreground">
            Select a slide to see actions
          </span>
        )}
      </div>

      <div className="relative flex-1 overflow-x-auto">
        <DndContext
          sensors={sensors}
          collisionDetection={closestCenter}
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
        >
          <SortableContext items={ids} strategy={horizontalListSortingStrategy}>
            <div
              className="relative h-full min-w-full select-none px-2 py-3"
              style={{ width: totalWidth }}
            >
              <div
                className="relative flex h-14 gap-1"
                style={{ touchAction: "pan-x" }}
              >
                {ids.map((id, i) => (
                  <SortableClip
                    key={id}
                    id={id}
                    title={project.slides[id]?.fields.title ?? id}
                    duration={durations[i]}
                    left={starts[i] * PX_PER_SEC}
                    active={id === activeSlideId}
                    onJump={() => {
                      seek(starts[i] + 0.01);
                      onSeekToSlide?.(id);
                    }}
                  />
                ))}
              </div>

              <div className="relative mt-2 h-6 rounded-md bg-muted/40">
                <div
                  className="absolute inset-y-0 left-0 rounded-md bg-primary/15"
                  style={{ width: total * PX_PER_SEC }}
                />
                <span className="absolute left-2 top-1/2 -translate-y-1/2 font-mono text-[10px] text-muted-foreground">
                  music · voiceover
                </span>
              </div>

              <div
                className="pointer-events-none absolute top-0 bottom-0 w-px bg-primary"
                style={{ left: playheadX + 8 }}
              >
                <div className="absolute -top-1 -left-1.5 size-3 rounded-full bg-primary" />
              </div>
            </div>
          </SortableContext>

          <DragOverlay dropAnimation={null}>
            {activeId ? (
              <div className="flex h-14 items-center gap-2 rounded-md border border-primary bg-card px-3 shadow-lg">
                <GripVertical className="size-4 text-primary" />
                <span className="text-xs font-medium">
                  {project.slides[activeId]?.fields.title ?? activeId}
                </span>
              </div>
            ) : null}
          </DragOverlay>
        </DndContext>
      </div>
    </div>
  );
}

function SortableClip({
  id,
  title,
  duration,
  left,
  active,
  onJump,
}: {
  id: string;
  title: string;
  duration: number;
  left: number;
  active: boolean;
  onJump: () => void;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const width = Math.max(duration * PX_PER_SEC, 96);

  const style: React.CSSProperties = {
    position: "absolute",
    left,
    width: width - 4,
    transform: CSS.Translate.toString(transform),
    transition,
    opacity: isDragging ? 0.3 : 1,
  };

  return (
    <div
      ref={setNodeRef}
      style={style}
      className={`group flex h-14 flex-col justify-center overflow-hidden rounded-md border ${
        active
          ? "border-primary bg-primary/10"
          : "border-border bg-card hover:border-primary/40"
      }`}
      {...attributes}
    >
      <div className="flex items-center gap-1 px-1.5">
        <button
          type="button"
          className="flex size-7 shrink-0 items-center justify-center rounded text-muted-foreground hover:bg-accent hover:text-foreground cursor-grab active:cursor-grabbing"
          aria-label={`Drag ${title}`}
          style={{ touchAction: "none" }}
          {...listeners}
        >
          <GripVertical className="size-4" />
        </button>
        <button
          type="button"
          className="flex-1 truncate text-left text-xs font-medium pr-2"
          onClick={onJump}
        >
          {title}
        </button>
      </div>
      <span className="pl-9 font-mono text-[10px] text-muted-foreground truncate pr-2">
        {duration.toFixed(1)}s
      </span>
    </div>
  );
}
