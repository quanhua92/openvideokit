/**
 * AssetDropzone — drag-and-drop image upload with SHA-256 dedup.
 *
 * On drop: hash blob → storeAsset (IndexedDB) → dispatch setAsset via
 * EditBus so the slide's assets map updates.
 */
import { Upload } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { toast } from "sonner";

import { useEditBus } from "@/shared/edit/EditBusProvider";
import { setAsset } from "@/shared/edit/ops";
import { storeAsset } from "../lib/assetStore";

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
	const inputRef = useRef<HTMLInputElement>(null);

	const handleFiles = useCallback(
		async (files: FileList | File[]) => {
			const file = Array.from(files)[0];
			if (!file) return;
			setHashing(true);
			try {
				const ref = await storeAsset(file);
				if (fieldId) {
					dispatch(setAsset(slideId, fieldId, ref));
				}
				onStored?.(ref);
				toast.success(`Stored ${ref.slice(0, 20)}…`);
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
			className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-6 text-center transition-colors ${
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
				ref={inputRef}
				type="file"
				accept="image/*"
				className="hidden"
				onChange={(e) => {
					if (e.target.files) void handleFiles(e.target.files);
				}}
			/>
			<Upload className="size-6 text-muted-foreground" />
			<span className="text-xs text-muted-foreground">
				{hashing ? "Hashing…" : "Drop image or click to upload"}
			</span>
		</label>
	);
}
