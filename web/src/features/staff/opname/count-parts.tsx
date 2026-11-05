import { ScanLine, Search, Trash2 } from "lucide-react";
import type { RefObject } from "react";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Card } from "../receipt/form-ui";
import type { OpnameDraft } from "./opname-draft-types";

export const QUEUED_NOTE = "Belum terkirim — dikirim otomatis saat tersambung";
const STORAGE_NOTE =
  "Hitungan tidak bisa disimpan di HP. Coba lagi; bila tetap begini, catat hitungan di kertas dulu.";

const pill =
  "inline-flex h-11 items-center rounded-full bg-surface px-5 text-[17px] font-medium text-primary shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-primary";
const bigButton =
  "inline-flex min-h-14 flex-1 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-[17px] font-semibold text-primary-foreground outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";
const squareButton =
  "inline-flex min-h-14 items-center justify-center gap-2 rounded-lg border border-border bg-surface px-5 text-[17px] font-semibold text-primary outline-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-primary";

export type Confirm = "selesai" | "buang" | null;

export function NotFound({ onBack }: { onBack: () => void }) {
  return (
    <div className="grid max-w-xl gap-3 px-4 pt-4">
      <p role="alert" className="font-medium text-danger">
        Hitungan tidak ditemukan
      </p>
      <Button variant="outline" className="justify-self-start" onClick={onBack}>
        Kembali
      </Button>
    </div>
  );
}

export function ConfirmDialog({
  open,
  title,
  body,
  confirm,
  danger,
  onConfirm,
  onClose,
}: {
  open: boolean;
  title: string;
  body: string;
  confirm: string;
  danger?: boolean;
  onConfirm: () => void;
  onClose: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={(o) => !o && onClose()}>
      <DialogContent role="alertdialog" showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{body}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            Lanjut menghitung
          </Button>
          <Button variant={danger ? "danger" : "primary"} onClick={onConfirm}>
            {confirm}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/** Pesan galat per barang dari penolakan server, dengan tombol untuk menghapus hitungan barang itu. */
export function RejectedErrors({
  draft,
  onRemove,
}: {
  draft: OpnameDraft;
  onRemove: (productId: string) => void;
}) {
  if (draft.errors.length === 0) return null;
  const nameOf = (id: string) => draft.products.find((p) => p.id === id)?.name;
  return (
    <div className="mt-4">
      <Card>
        {draft.errors.map((e) => {
          const id = e.productId;
          return (
            <div
              key={`${id ?? "-"}:${e.message}`}
              className="flex min-h-14 items-center justify-between gap-3 px-4 py-2"
            >
              <div className="min-w-0">
                {id !== null && (
                  <p className="truncate font-medium">
                    {nameOf(id) ?? "Barang"}
                  </p>
                )}
                <p role="alert" className="text-[13px] font-medium text-danger">
                  {e.message}
                </p>
              </div>
              {id !== null && draft.counts[id] !== undefined && (
                <Button
                  variant="outline"
                  className="shrink-0"
                  onClick={() => onRemove(id)}
                >
                  <Trash2 aria-hidden="true" />
                  Hapus hitungan
                </Button>
              )}
            </div>
          );
        })}
      </Card>
    </div>
  );
}

/** Kepala layar: pil Jeda/Kembali, lingkup, `k dari n`, bilah progres. */
export function CountHeader({
  label,
  counted,
  total,
  readOnly,
  onLeave,
}: {
  label: string;
  counted: number;
  total: number;
  readOnly: boolean;
  onLeave: () => void;
}) {
  return (
    <header className="sticky top-0 z-10 -mx-4 bg-bg px-4 pt-3 pb-2">
      <div className="flex items-center gap-3">
        <button type="button" onClick={onLeave} className={pill}>
          {readOnly ? "Kembali" : "Jeda"}
        </button>
        <div className="min-w-0">
          <h1 className="truncate text-[20px] leading-tight font-bold">
            {label}
          </h1>
          <p className="text-[13px] text-muted tabular-nums">
            {`${counted} dari ${total}`}
          </p>
        </div>
      </div>
      <div
        role="progressbar"
        aria-label="Kemajuan menghitung"
        aria-valuemin={0}
        aria-valuemax={total}
        aria-valuenow={counted}
        className="mt-2 h-1.5 overflow-hidden rounded-full bg-primary-soft"
      >
        <div
          className="h-full bg-primary"
          style={{ width: `${total === 0 ? 0 : (counted / total) * 100}%` }}
        />
      </div>
    </header>
  );
}

/** Peringatan penyimpanan HP dan keterangan draf antre. */
export function CountNotices({
  storageError,
  queued,
}: {
  storageError: boolean;
  queued: boolean;
}) {
  return (
    <>
      {storageError && (
        <p
          role="alert"
          className="mt-3 rounded-lg bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger-ink"
        >
          {STORAGE_NOTE}
        </p>
      )}
      {queued && (
        <p className="mt-3 rounded-lg bg-warning-soft px-4 py-3 text-[14px] font-medium text-warning-ink">
          {QUEUED_NOTE}
        </p>
      )}
    </>
  );
}

/** `Scan barcode` (hanya bila kamera didukung) dan `Cari`; ref disimpan agar fokus bisa dikembalikan. */
export function ScanRow({
  supported,
  scanRef,
  searchRef,
  onScan,
  onSearch,
}: {
  supported: boolean;
  scanRef: RefObject<HTMLButtonElement | null>;
  searchRef: RefObject<HTMLButtonElement | null>;
  onScan: () => void;
  onSearch: () => void;
}) {
  return (
    <div className="mt-3 flex gap-2">
      {supported && (
        <button
          ref={scanRef}
          type="button"
          className={bigButton}
          onClick={onScan}
        >
          <ScanLine aria-hidden="true" className="size-5" />
          Scan barcode
        </button>
      )}
      <button
        ref={searchRef}
        type="button"
        className={supported ? squareButton : bigButton}
        onClick={onSearch}
      >
        <Search aria-hidden="true" className="size-5" />
        Cari
      </button>
    </div>
  );
}

/** `Selesai menghitung` (bila boleh diedit) dan `Buang hitungan`. */
export function BottomActions({
  readOnly,
  busy,
  canFinish,
  onFinish,
  onDiscard,
}: {
  readOnly: boolean;
  busy: boolean;
  canFinish: boolean;
  onFinish: () => void;
  onDiscard: () => void;
}) {
  return (
    <div className="mt-6 grid gap-2">
      {!readOnly && (
        <Button
          size="lg"
          variant="outline"
          disabled={busy || !canFinish}
          onClick={onFinish}
        >
          Selesai menghitung
        </Button>
      )}
      <Button
        variant="ghost"
        className="text-danger"
        disabled={busy}
        onClick={onDiscard}
      >
        <Trash2 aria-hidden="true" />
        Buang hitungan
      </Button>
    </div>
  );
}
