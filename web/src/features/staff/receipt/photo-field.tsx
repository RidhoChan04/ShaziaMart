import { Camera, ImageIcon } from "lucide-react";
import { useEffect, useId, useState } from "react";
import { newId } from "@/shared/lib/id";
import type { DraftPhoto } from "../drafts/draft-types";
import { compressPhoto } from "./compress-photo";
import { photoCaption } from "./form-model";

/** Pratinjau kecil; jsdom/peramban tanpa createObjectURL → ikon saja. */
function useThumbUrl(blob: Blob | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!blob || typeof URL.createObjectURL !== "function") {
      setUrl(null);
      return;
    }
    const made = URL.createObjectURL(blob);
    setUrl(made);
    return () => URL.revokeObjectURL(made);
  }, [blob]);
  return url;
}

export function PhotoField({
  photo,
  onChange,
}: {
  photo: DraftPhoto | null;
  onChange: (p: DraftPhoto) => void;
}) {
  const inputId = useId();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const thumb = useThumbUrl(photo?.blob);

  const pick = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    try {
      const { blob, bytes } = await compressPhoto(file);
      onChange({
        id: newId(),
        blob,
        takenAt: Date.now(),
        bytes,
        uploaded: false,
      });
    } catch {
      setError("Foto tidak bisa dibaca — coba ambil ulang");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="px-4 py-3">
      <div className="flex min-w-0 items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center overflow-hidden rounded-md bg-bg text-muted">
          {thumb ? (
            <img src={thumb} alt="" className="size-full object-cover" />
          ) : (
            <ImageIcon aria-hidden="true" className="size-5" />
          )}
        </span>
        <div className="min-w-0 flex-1">
          <p className="font-medium">{photo ? "1 lembar" : "Belum ada foto"}</p>
          {photo && (
            <p className="text-[13px] text-muted tabular-nums">
              {photoCaption(photo)}
            </p>
          )}
        </div>
        <label
          htmlFor={inputId}
          className="inline-flex h-11 shrink-0 cursor-pointer items-center gap-1.5 rounded-md bg-primary-soft px-3 font-medium text-primary has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-primary"
        >
          <Camera aria-hidden="true" className="size-4" />
          {busy ? "Memproses…" : "Foto nota"}
          <input
            id={inputId}
            type="file"
            accept="image/*"
            capture="environment"
            disabled={busy}
            className="sr-only"
            onChange={(e) => {
              void pick(e.target.files?.[0]);
              e.target.value = "";
            }}
          />
        </label>
      </div>
      {error && (
        <p role="alert" className="mt-2 text-[13px] font-medium text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
