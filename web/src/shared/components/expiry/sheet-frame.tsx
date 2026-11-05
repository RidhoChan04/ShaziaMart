import { X } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/shared/ui/sheet";

export type SheetFrameProps = {
  open: boolean;
  onClose: () => void;
  /** Tombol yang membuka lembar; fokus kembali ke sana setelah lembar ditutup. */
  returnFocus?: RefObject<HTMLElement | null> | undefined;
};

/** Kerangka lembar bawah kedaluwarsa: judul, keterangan, tombol tutup, dan pengembalian fokus. */
export function SheetFrame({
  open,
  onClose,
  returnFocus,
  title,
  description,
  children,
}: SheetFrameProps & {
  title: string;
  description?: string | undefined;
  children: ReactNode;
}) {
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="bottom"
        showCloseButton={false}
        className="max-h-[92dvh] gap-0 rounded-t-lg p-0 lg:mx-auto lg:max-w-[480px]"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          returnFocus?.current?.focus();
        }}
      >
        <div className="flex items-start justify-between gap-3 px-4 pt-4 pb-3">
          <div className="min-w-0">
            <SheetTitle className="text-[20px] leading-tight font-bold">
              {title}
            </SheetTitle>
            {description ? (
              <SheetDescription className="mt-0.5 tabular-nums">
                {description}
              </SheetDescription>
            ) : (
              <SheetDescription className="sr-only">{title}</SheetDescription>
            )}
          </div>
          <SheetClose
            aria-label="Tutup"
            className="inline-flex size-11 shrink-0 items-center justify-center rounded-full bg-bg outline-none focus-visible:ring-2 focus-visible:ring-primary"
          >
            <X aria-hidden="true" className="size-5" />
          </SheetClose>
        </div>
        <div className="grid gap-3 px-4 pb-[calc(1rem+env(safe-area-inset-bottom))]">
          {children}
        </div>
      </SheetContent>
    </Sheet>
  );
}

export const OFFLINE_TEXT = "Perlu tersambung ke toko";

/** Pesan galat atau catatan tanpa koneksi di dalam lembar. */
export function SheetNotes({
  error,
  offline,
}: {
  error: string | null | undefined;
  offline: boolean;
}) {
  return (
    <>
      {error && (
        <p role="alert" className="text-[14px] font-medium text-danger">
          {error}
        </p>
      )}
      {offline && <p className="text-[14px] text-muted">{OFFLINE_TEXT}</p>}
    </>
  );
}
