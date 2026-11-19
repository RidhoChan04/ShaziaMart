import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/shared/api/fetcher";
import { useCancelOwnerExpense } from "@/shared/api/gen/owner/owner";
import type { OwnerDrawerExpense } from "@/shared/api/gen/shaziaMartAPI.schemas";
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
import { useCancelSheetState } from "./cancel-sheet-state";
import { RELOAD_FAILED, refreshShifts } from "./shifts-cache";

/**
 * Lembar `Kas keluar {Rp}` dari baris kas keluar aktif, lalu dialog alasan wajib (S10, K10). Dari app
 * pemilik hanya kas keluar shift yang sudah tutup, dan hitungan laci shift itu tidak berubah. Shift
 * yang masih buka: `Masih di shift yang buka — batalkan dari kasir`. `expense` null = tertutup (isi
 * terakhir tetap tampil selama animasi) dan datang dari data terbaru halaman: 409 IN_OPEN_SHIFT
 * cukup menutup dialog dan memuat ulang, lalu lembar berganti ke keterangan itu.
 */
export function CancelExpenseSheet({
  expense,
  kasirName,
  onClose,
}: {
  expense: OwnerDrawerExpense | null;
  /** Kasir pemilik shift (untuk keterangan dialog). */
  kasirName: string;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const last = useRef<OwnerDrawerExpense | null>(null);
  if (expense) last.current = expense;
  const shown = expense ?? last.current;
  const { succeeded, reloadFailed, reloadAfterConflict, refocus } =
    useCancelSheetState(expense?.id ?? null, client);
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState("");
  const cancel = useCancelOwnerExpense({
    mutation: {
      onSuccess: () => {
        succeeded.current = true;
        toast.success("Kas keluar dibatalkan");
        refreshShifts(client);
        setConfirm(false);
        onClose();
      },
      onError: (error) => {
        if (error instanceof ApiError && error.code === "IN_OPEN_SHIFT") {
          setConfirm(false);
          reloadAfterConflict();
          return;
        }
        refreshShifts(client);
      },
    },
  });

  if (!shown) return null;
  const errorText =
    cancel.isError &&
    !(cancel.error instanceof ApiError && cancel.error.code === "IN_OPEN_SHIFT")
      ? pesanError(cancel.error)
      : null;
  const canCancel =
    shown.cancellable && shown.cancelled === null && !reloadFailed;

  return (
    <Sheet
      open={expense !== null}
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
        <SheetTitle className="text-[20px] font-bold">{`Kas keluar ${formatRupiah(shown.amount)}`}</SheetTitle>
        <SheetDescription>
          {`${relativeDayTime(shown.at, Date.now())} · ${shown.kasirName}`}
        </SheetDescription>
        <p className="text-[15px] break-words">{shown.reason}</p>
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
            Batalkan kas keluar
          </Button>
        ) : reloadFailed ? (
          <p role="alert" className="text-[15px] font-medium text-danger">
            {RELOAD_FAILED}
          </p>
        ) : (
          <p className="text-[15px] text-muted">
            Masih di shift yang buka — batalkan dari kasir
          </p>
        )}
        <SheetClose asChild>
          <Button variant="outline" className="h-12 w-full text-[17px]">
            Tutup
          </Button>
        </SheetClose>
      </SheetContent>
      <Dialog
        open={confirm && expense !== null && canCancel}
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
            <DialogTitle>{`Batalkan kas keluar ${formatRupiah(shown.amount)}?`}</DialogTitle>
            <DialogDescription>
              {`Hitungan laci shift ${kasirName} tidak berubah karena shift sudah tutup.`}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <label
              htmlFor="alasan-batal-kas"
              className="text-[15px] font-semibold"
            >
              Alasan
            </label>
            <input
              id="alasan-batal-kas"
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
                  expenseId: shown.id,
                  data: { reason: reason.trim() },
                })
              }
            >
              Batalkan kas keluar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}
