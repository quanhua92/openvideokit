/**
 * PropertiesPanel — editable view of the active slide's index.json.
 *
 * Text fields use local state + 200ms debounced dispatch to avoid
 * re-rendering the studio per keystroke.
 */
import {
  Image as ImageIcon,
  Mic,
  Palette,
  Trash2,
  Type,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { AssetDropzone } from "@/features/assets/components/AssetDropzone";
import { useAssetUrl } from "@/features/assets/hooks/useAssetUrl";
import { cn } from "@/lib/utils";
import fieldsSchema from "@/shared/api/schemas/fields.json";
import type { SlideIndex } from "@/shared/api/schemas/slideIndex";
import { useEditBus } from "@/shared/edit/EditBusProvider";
import {
  removeSlide,
  setAsset,
  setField,
  setVoiceover,
} from "@/shared/edit/ops";

function fieldLabel(id: string): string {
  const entry = (fieldsSchema as Record<string, { label?: string }>)[id];
  return entry?.label ?? id;
}

export function PropertiesPanel({
  slide,
  slideId,
}: {
  slide: SlideIndex | null;
  slideId: string | null;
}) {
  const { dispatch } = useEditBus();

  if (!slide || !slideId) {
    return (
      <div className="flex h-full items-center justify-center p-4 text-center text-xs text-muted-foreground">
        No active slide.
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="flex shrink-0 items-center justify-between border-b border-border px-4 py-2">
        <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
          Properties
        </h2>
        <div className="flex items-center gap-2">
          <span className="font-mono text-[10px] text-muted-foreground">
            {slide.id} · {slide.duration.toFixed(1)}s
          </span>
          <Button
            variant="ghost"
            size="icon"
            className="size-6 text-destructive hover:text-destructive"
            aria-label="Delete slide"
            onClick={() => {
              dispatch(removeSlide(slideId));
              toast.success(`Removed ${slideId}`);
            }}
          >
            <Trash2 className="size-3.5" />
          </Button>
        </div>
      </header>
      <div className="min-h-0 flex-1 space-y-4 overflow-auto p-4">
        <Section icon={Type} title="Fields">
          <div className="space-y-2">
            {Object.entries(slide.fields)
              .filter(([id]) => id !== "bg_color")
              .map(([id, value]) => (
                <FieldInput
                  key={id}
                  slideId={slideId}
                  fieldId={id}
                  label={fieldLabel(id)}
                  initialValue={value}
                />
              ))}
          </div>
        </Section>

        <Section icon={Palette} title="Background">
          <BackgroundPicker
            slideId={slideId}
            value={slide.fields.bg_color ?? "#0a0a14"}
          />
        </Section>

        <Section icon={ImageIcon} title="Assets">
          {Object.entries(slide.assets).length > 0 ? (
            <div className="space-y-3">
              {Object.entries(slide.assets).map(([id, ref]) => (
                <AssetFieldPreview
                  key={id}
                  slideId={slideId}
                  fieldId={id}
                  currentRef={ref}
                />
              ))}
            </div>
          ) : (
            <AssetFieldPreview slideId={slideId} fieldId="img" />
          )}
        </Section>

        <Section icon={Mic} title="Voiceover">
          <VoiceoverInput slideId={slideId} slide={slide} />
        </Section>
      </div>
    </div>
  );
}

/**
 * Shows the current image for an asset field with thumbnail preview,
 * a remove button, and a dropzone to replace it.
 */
function AssetFieldPreview({
  slideId,
  fieldId,
  currentRef,
}: {
  slideId: string;
  fieldId: string;
  currentRef?: string;
}) {
  const { dispatch } = useEditBus();
  const imgUrl = useAssetUrl(currentRef);

  if (!currentRef || !imgUrl) {
    return (
      <div className="space-y-1.5">
        <p className="text-xs text-muted-foreground">No image set.</p>
        <AssetDropzone slideId={slideId} fieldId={fieldId} />
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div className="relative overflow-hidden rounded-md border border-border">
        <img
          src={imgUrl}
          alt={currentRef}
          className="aspect-video w-full object-cover"
        />
        <button
          type="button"
          onClick={() => {
            dispatch(setAsset(slideId, fieldId, ""));
            toast.success("Image removed");
          }}
          className="absolute right-1 top-1 rounded bg-destructive/90 p-1 text-white transition hover:bg-destructive"
          aria-label="Remove image"
        >
          <X className="size-3" />
        </button>
        <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5">
          <p className="truncate font-mono text-[8px] text-white/70">
            {fieldId}: {currentRef.slice(7, 19)}…
          </p>
        </div>
      </div>
      <AssetDropzone slideId={slideId} fieldId={fieldId} />
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-1.5">
      <header className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        <Icon className="size-3" />
        {title}
      </header>
      {children}
    </section>
  );
}

function FieldInput({
  slideId,
  fieldId,
  label,
  initialValue,
}: {
  slideId: string;
  fieldId: string;
  label: string;
  initialValue: string;
}) {
  const { dispatch } = useEditBus();
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    if (value === initialValue) return;
    const t = setTimeout(() => {
      dispatch(setField(slideId, fieldId, value));
    }, 200);
    return () => clearTimeout(t);
  }, [value, initialValue, slideId, fieldId, dispatch]);

  const isMultiline = value.length > 60 || value.includes("\n");
  return (
    <div className="space-y-1">
      <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      <Textarea
        value={value}
        onChange={(e) => setValue(e.target.value)}
        rows={isMultiline ? 3 : 1}
        className={cn(
          "resize-none bg-background font-mono text-xs",
          !isMultiline && "py-1",
        )}
      />
    </div>
  );
}

function VoiceoverInput({
  slideId,
  slide,
}: {
  slideId: string;
  slide: SlideIndex;
}) {
  const { dispatch } = useEditBus();
  const [text, setText] = useState(slide.voiceover.text);

  useEffect(() => {
    setText(slide.voiceover.text);
  }, [slide.voiceover.text]);

  useEffect(() => {
    if (text === slide.voiceover.text) return;
    const t = setTimeout(() => {
      dispatch(setVoiceover(slideId, text));
    }, 200);
    return () => clearTimeout(t);
  }, [text, slide.voiceover.text, slideId, dispatch]);

  return (
    <div className="space-y-1">
      <Textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        rows={3}
        className="resize-none bg-background text-xs"
      />
      <p className="font-mono text-[10px] text-muted-foreground">
        {slide.voiceover.voice}
      </p>
    </div>
  );
}

const BG_SWATCHES = [
  "#0a0a14",
  "#1a1a2e",
  "#0f3460",
  "#533483",
  "#e94560",
  "#2d6a4f",
  "#f39c12",
  "#06b6d4",
  "#8b5cf6",
  "#2c3e50",
  "#7c2d12",
  "#0a0a0a",
];

function BackgroundPicker({
  slideId,
  value: initialValue,
}: {
  slideId: string;
  value: string;
}) {
  const { dispatch } = useEditBus();
  const [localColor, setLocalColor] = useState(initialValue);

  // Sync external → local when slide changes.
  useEffect(() => {
    setLocalColor(initialValue);
  }, [initialValue]);

  // Debounce dispatch so dragging the color picker doesn't re-render
  // the entire studio on every pixel move.
  useEffect(() => {
    if (localColor === initialValue) return;
    const t = setTimeout(() => {
      dispatch(setField(slideId, "bg_color", localColor));
    }, 150);
    return () => clearTimeout(t);
  }, [localColor, initialValue, slideId, dispatch]);

  return (
    <div className="space-y-2">
      <div className="flex items-center gap-2">
        <input
          type="color"
          value={localColor}
          onChange={(e) => setLocalColor(e.target.value)}
          className="size-7 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0"
        />
        <input
          type="text"
          value={localColor}
          onChange={(e) => setLocalColor(e.target.value)}
          className="h-7 w-20 rounded border border-border bg-background px-2 font-mono text-xs"
        />
      </div>
      <div className="flex flex-wrap gap-1">
        {BG_SWATCHES.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => {
              setLocalColor(c);
              dispatch(setField(slideId, "bg_color", c));
            }}
            className={cn(
              "size-5 rounded-full border transition",
              localColor.toLowerCase() === c.toLowerCase()
                ? "border-foreground ring-1 ring-foreground"
                : "border-border",
            )}
            style={{ backgroundColor: c }}
            aria-label={`Background ${c}`}
          />
        ))}
      </div>
    </div>
  );
}
