/**
 * AssetLibrary — grid of stored assets with search.
 *
 * Click an asset to apply it to the active slide's `img` field.
 * Hover for copy-ref / delete actions.
 */
import { Images } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { AspectRatio } from "@/components/ui/aspect-ratio";
import { Input } from "@/components/ui/input";
import { useEditBus } from "@/shared/edit/EditBusProvider";
import { setAsset } from "@/shared/edit/ops";
import { type Asset, listAssets, removeAsset } from "../lib/assetStore";
import { AssetDropzone } from "./AssetDropzone";

export function AssetLibrary({ slideId }: { slideId: string }) {
  const { dispatch } = useEditBus();
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");

  const refresh = async () => {
    setLoading(true);
    try {
      setAssets(await listAssets());
    } finally {
      setLoading(false);
    }
  };

  // biome-ignore lint/correctness/useExhaustiveDependencies: refresh on mount only
  useEffect(() => {
    void refresh();
  }, []);

  const filtered = query
    ? assets.filter(
        (a) =>
          a.ref.toLowerCase().includes(query.toLowerCase()) ||
          a.mime.toLowerCase().includes(query.toLowerCase()),
      )
    : assets;

  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 space-y-2 border-b border-border p-3">
        <Input
          placeholder="Search assets…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="h-7 text-xs"
        />
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {loading ? (
          <p className="text-center text-xs text-muted-foreground">
            Loading assets…
          </p>
        ) : filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center gap-2 py-8 text-muted-foreground">
            <Images className="size-8 opacity-40" />
            <p className="text-xs">
              {query ? "No matches." : "No assets yet. Drop one below."}
            </p>
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
            {filtered.map((a) => (
              <AssetCard
                key={a.ref}
                asset={a}
                slideId={slideId}
                onApply={(ref) => {
                  dispatch(setAsset(slideId, "img", ref));
                  toast.success(`Applied to ${slideId}`);
                }}
                onRemove={async () => {
                  await removeAsset(a.ref);
                  await refresh();
                  toast.success("Asset removed");
                }}
              />
            ))}
          </div>
        )}
      </div>

      <div className="shrink-0 border-t border-border p-3">
        <AssetDropzone slideId={slideId} onStored={() => void refresh()} />
      </div>
    </div>
  );
}

function AssetCard({
  asset,
  slideId,
  onApply,
  onRemove,
}: {
  asset: Asset;
  slideId: string;
  onApply: (ref: string) => void;
  onRemove: () => void;
}) {
  const [url, setUrl] = useState<string>("");

  useEffect(() => {
    const blobUrl = URL.createObjectURL(asset.blob);
    setUrl(blobUrl);
    return () => URL.revokeObjectURL(blobUrl);
  }, [asset.blob]);

  return (
    <div className="group relative overflow-hidden rounded-md border border-border">
      <button
        type="button"
        onClick={() => onApply(asset.ref)}
        className="block size-full"
        aria-label={`Apply ${asset.ref} to ${slideId}`}
      >
        <AspectRatio ratio={1}>
          {url ? (
            <img src={url} alt={asset.ref} className="size-full object-cover" />
          ) : null}
        </AspectRatio>
      </button>
      <div className="pointer-events-none absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-1.5">
        <p className="truncate font-mono text-[8px] text-white/80">
          {asset.ref.slice(7, 19)}…
        </p>
        <p className="font-mono text-[8px] text-white/50">
          {(asset.size / 1024).toFixed(0)} KB
        </p>
      </div>
      <div className="absolute inset-x-0 top-0 flex justify-between p-1 opacity-0 transition-opacity group-hover:opacity-100">
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onApply(asset.ref);
          }}
          className="rounded bg-primary/90 px-1.5 py-0.5 text-[8px] font-medium text-primary-foreground"
        >
          Use
        </button>
        <div className="flex gap-1">
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              void navigator.clipboard?.writeText(asset.ref);
              toast.success("Ref copied");
            }}
            className="rounded bg-black/60 px-1 py-0.5 text-[8px] text-white"
          >
            Copy
          </button>
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onRemove();
            }}
            className="rounded bg-destructive/80 px-1 py-0.5 text-[8px] text-white"
          >
            Del
          </button>
        </div>
      </div>
    </div>
  );
}
