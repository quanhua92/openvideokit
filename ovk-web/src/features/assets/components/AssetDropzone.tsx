/**
 * AssetDropzone — drag-and-drop image upload with SHA-256 dedup.
 *
 * Validates MIME type and file size before hashing. Uses a <label>
 * wrapper so click naturally opens the file picker (no JS click needed).
 */
import { Upload } from "lucide-react";
import { useCallback, useState } from "react";
import { toast } from "sonner";

import { useEditBus } from "@/shared/edit/EditBusProvider";
import { setAsset } from "@/shared/edit/ops";
import { storeAsset } from "../lib/assetStore";

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

export function AssetDropzone({
  slideId,
  fieldId,
  onStored,
}: {
  slideId: string;
  fieldId?: string;
  onStored?: (ref: string) => void;
}) {
  const { dispatch } = useEditBus();
  const [dragging, setDragging] = useState(false);
  const [hashing, setHashing] = useState(false);

  const handleFiles = useCallback(
    async (files: FileList | File[]) => {
      const file = Array.from(files)[0];
      if (!file) return;

      if (!file.type.startsWith("image/")) {
        toast.error("Only image files are supported");
        return;
      }
      if (file.size > MAX_SIZE) {
        toast.error("File too large (max 10 MB)");
        return;
      }

      setHashing(true);
      try {
        const ref = await storeAsset(file);
        if (fieldId) {
          dispatch(setAsset(slideId, fieldId, ref));
        }
        onStored?.(ref);
        toast.success("Image stored");
      } catch {
        toast.error("Failed to store asset");
      } finally {
        setHashing(false);
      }
    },
    [dispatch, slideId, fieldId, onStored],
  );

  return (
    <label
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-4 text-center transition-colors ${
        dragging
          ? "border-primary bg-primary/5"
          : "border-border hover:border-primary/40"
      }`}
      onDragOver={(e) => {
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(e) => {
        e.preventDefault();
        setDragging(false);
        void handleFiles(e.dataTransfer.files);
      }}
    >
      <input
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          if (e.target.files) void handleFiles(e.target.files);
        }}
      />
      <Upload className="size-5 text-muted-foreground" />
      <span className="text-[11px] text-muted-foreground">
        {hashing ? "Hashing…" : "Drop or click (max 10 MB)"}
      </span>
    </label>
  );
}
