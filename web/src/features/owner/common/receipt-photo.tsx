import { ImageOff, X } from "lucide-react";
import { useState } from "react";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/dialog";

/** Alamat foto nota milik pemilik; `photoId` datang dari nota (`photoId`), bukan diketik. */
export const receiptPhotoUrl = (photoId: string): string =>
  `/api/owner/receipt-photos/${encodeURIComponent(photoId)}`;

const rowClass =
  "flex min-h-14 w-full items-center gap-3 px-4 py-2 text-left text-[17px]";

/**
 * Baris `Foto nota` dengan thumbnail; mengetuknya membuka foto layar penuh (dialog `Foto nota`).
 * Fokus kembali ke baris saat dialog ditutup.
 *
 * Props:
 * - `photoId`: id foto dari nota; `null` bila nota tanpa foto (baris statis `Tanpa foto`, tidak bisa diketuk).
 * - `caption`: teks kecil di bawah judul, mis. `Dicatat Rina · Hari ini 09.15`.
 *
 * Dipakai sebagai satu baris di dalam kartu (`Section`/`RowList`); pemanggil yang membungkusnya dengan `<li>` bila perlu.
 */
export function ReceiptPhotoRow({
  photoId,
  caption,
}: {
  photoId: string | null;
  caption: string;
}) {
  const [failed, setFailed] = useState(false);
  const label = (
    <span className="grid min-w-0 flex-1">
      <span className="font-semibold">Foto nota</span>
      <span className="truncate text-[13px] text-muted">{caption}</span>
    </span>
  );

  if (photoId === null) {
    return (
      <div className={rowClass}>
        <span
          aria-hidden="true"
          className="grid size-11 shrink-0 place-items-center rounded-md bg-bg text-muted"
        >
          <ImageOff className="size-5" />
        </span>
        {label}
        <span className="shrink-0 text-[15px] text-muted">Tanpa foto</span>
      </div>
    );
  }

  const src = receiptPhotoUrl(photoId);
  return (
    <Dialog onOpenChange={(open) => open && setFailed(false)}>
      <DialogTrigger
        className={`${rowClass} focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary`}
      >
        {failed ? (
          <span
            aria-hidden="true"
            className="grid size-11 shrink-0 place-items-center rounded-md bg-bg text-muted"
          >
            <ImageOff className="size-5" />
          </span>
        ) : (
          <img
            src={src}
            alt=""
            loading="lazy"
            onError={() => setFailed(true)}
            className="size-11 shrink-0 rounded-md bg-bg object-cover"
          />
        )}
        {label}
      </DialogTrigger>
      <DialogContent
        showCloseButton={false}
        className="inset-0 h-dvh max-h-dvh w-screen max-w-none translate-x-0 translate-y-0 content-start gap-3 rounded-none border-0 p-4 sm:max-w-none"
      >
        <div className="flex items-center justify-between gap-3">
          <DialogTitle className="text-[20px] leading-tight font-bold">
            Foto nota
          </DialogTitle>
          <DialogClose asChild>
            <Button variant="outline" className="h-11">
              <X aria-hidden="true" />
              Tutup
            </Button>
          </DialogClose>
        </div>
        <DialogDescription className="sr-only">{caption}</DialogDescription>
        <div className="grid min-h-0 place-items-center overflow-auto">
          {failed ? (
            <p role="alert" className="text-sm font-medium text-danger">
              Foto tidak bisa dimuat
            </p>
          ) : (
            <img
              src={src}
              alt="Foto nota"
              onError={() => setFailed(true)}
              className="max-h-[calc(100dvh-6rem)] max-w-full object-contain"
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
