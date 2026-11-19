import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/shared/api/fetcher";
import { useCancelOwnerCashTake } from "@/shared/api/gen/owner/owner";
import type { OwnerCashTake } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { relativeDayTime } from "@/shared/lib/business-day";
import { pesanError } from "@/shared/lib/error-messages";
import { formatRupiah } from "@/shared/lib/money";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/shared/ui/sheet";
import { refreshShifts } from "./shifts-cache";

/** Keterangan terkunci (§12g): sudah dipakai modal shift berikutnya, atau shift tempatnya sudah tutup. */
export function lockedTakeText(take: OwnerCashTake): string {
  return take.consumedByKasirName !== null
    ? `Sudah dipakai modal shift ${take.consumedByKasirName}`
    : "Shift sudah tutup — tidak bisa dibatalkan";
}

/** Efek pembatalan: uang seharusnya shift itu naik lagi, atau saran modal shift berikutnya (di sela shift). */
function effectText(take: OwnerCashTake): string {
  const amount = formatRupiah(take.amount);
  return take.shiftId !== null
    ? `Uang seharusnya shift ${take.shiftKasirName ?? ""} kembali bertambah ${amount}.`
    : `Modal shift berikutnya kembali bertambah ${amount}.`;
}

/**
 * Lembar `Pengambilan {Rp}` dari baris pengambilan aktif, lalu dialog alasan wajib (S5, K9). Tombol
 * `Batalkan pengambilan` hanya ada bila `cancellable`; selain itu keterangan terkunci. `take` null =
 * tertutup (isi terakhir tetap tampil selama animasi) dan datang dari data terbaru halaman, jadi
 * 409 CASH_TAKE_LOCKED (kalah cepat dari shift tutup / modal shift berikutnya) cukup memuat ulang:
 * dialog ditutup dan lembar berganti ke keterangan terkunci tanpa angka yang berubah.
 */
export function CancelTakeSheet({
  take,
  onClose,
}: {
  take: OwnerCashTake | null;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const last = useRef<OwnerCashTake | null>(null);
  if (take) last.current = take;
  const shown = take ?? last.current;
  const succeeded = useRef(false);
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState("");
  const cancel = useCancelOwnerCashTake({
    mutation: {
      onSuccess: () => {
        succeeded.current = true;
        toast.success("Pengambilan dibatalkan");
        refreshShifts(client);
        setConfirm(false);
        onClose();
      },
      onError: (error) => {
        if (error instanceof ApiError && error.code === "CASH_TAKE_LOCKED") {
          setConfirm(false);
        }
        refreshShifts(client);
      },
    },
  });

  if (!shown) return null;
  // Pemicu (baris) sudah menjadi baris dibatalkan: fokus pindah ke judul halaman.
  const refocus = (e: Event) => {
    if (!succeeded.current) return;
    e.preventDefault();
    document.querySelector<HTMLElement>("main h1")?.focus();
  };
  const errorText =
    cancel.isError &&
    !(
      cancel.error instanceof ApiError &&
      cancel.error.code === "CASH_TAKE_LOCKED"
    )
      ? pesanError(cancel.error)
      : null;
  const canCancel = shown.cancellable && shown.cancelled === null;

  return (
    <Sheet
      open={take !== null}
      onOpenChange={(next) => {
        if (next || cancel.isPending) return;
        setConfirm(false);
        onClose();
      }}
    >
      <SheetContent
        side="bottom"
        showCloseButton={false}
        onCloseAutoFocus={refocus}
        className="gap-3 rounded-t-lg p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:mx-auto lg:max-w-md"
      >
        <SheetTitle className="text-[20px] font-bold">{`Pengambilan ${formatRupiah(shown.amount)}`}</SheetTitle>
        <SheetDescription>
          {relativeDayTime(shown.at, Date.now())}
        </SheetDescription>
        {shown.note !== null && (
          <p className="text-[15px] break-words">{shown.note}</p>
        )}
        {canCancel ? (
          <Button
            variant="danger"
            className="h-12 w-full text-[17px]"
            onClick={() => {
              succeeded.current = false;
              cancel.reset();
              setReason("");
              setConfirm(true);
            }}
          >
            Batalkan pengambilan
          </Button>
        ) : (
          <p className="text-[15px] text-muted">{lockedTakeText(shown)}</p>
        )}
        <SheetClose asChild>
          <Button variant="outline" className="h-12 w-full text-[17px]">
            Tutup
          </Button>
        </SheetClose>
      </SheetContent>
      <Dialog
        open={confirm && take !== null && canCancel}
        onOpenChange={(next) => {
          if (cancel.isPending) return;
          setConfirm(next);
        }}
      >
        <DialogContent
          role="alertdialog"
          showCloseButton={false}
          onInteractOutside={(e) => e.preventDefault()}
          onCloseAutoFocus={refocus}
        >
          <DialogHeader>
            <DialogTitle>{`Batalkan pengambilan ${formatRupiah(shown.amount)}?`}</DialogTitle>
            <DialogDescription>{effectText(shown)}</DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <label
              htmlFor="alasan-batal-ambil"
              className="text-[15px] font-semibold"
            >
              Alasan
            </label>
            <input
              id="alasan-batal-ambil"
              maxLength={200}
              autoComplete="off"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              className="h-11 w-full rounded-md border border-border bg-transparent px-3 text-[17px] outline-none focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
          {errorText !== null && (
            <p role="alert" className="text-sm font-medium text-danger">
              {errorText}
            </p>
          )}
          <DialogFooter>
            <DialogClose asChild>
              <Button variant="outline" disabled={cancel.isPending}>
                Kembali
              </Button>
            </DialogClose>
            <Button
              variant="danger"
              disabled={reason.trim() === "" || cancel.isPending}
              onClick={() =>
                cancel.mutate({
                  takeId: shown.id,
                  data: { reason: reason.trim() },
                })
              }
            >
              Batalkan pengambilan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}
