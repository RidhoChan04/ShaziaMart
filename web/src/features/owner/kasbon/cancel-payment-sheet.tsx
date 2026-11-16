import { useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { toast } from "sonner";
import {
  getGetOwnerCustomerQueryKey,
  useCancelOwnerCreditPayment,
} from "@/shared/api/gen/owner/owner";
import type {
  CreditHistoryEntry,
  OwnerCustomer,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
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
import { dayTime, paymentLabel } from "./history-row";

/** Saldo setelah pelunasan dibatalkan: kasbon bertambah lagi sebesar pelunasan. */
function balanceAfterCancel(balance: number, amount: number): string {
  const next = balance + amount;
  return next < 0
    ? `Lebih bayar menjadi ${formatRupiah(-next)}.`
    : `Sisa kasbon menjadi ${formatRupiah(next)}.`;
}

/**
 * Lembar `Pelunasan {Rp}` dari baris pelunasan aktif, lalu dialog alasan wajib. Dari app pemilik
 * laci kasir tidak pernah berubah. `entry` null = tertutup (isi terakhir tetap tampil selama animasi).
 * 409 IN_OPEN_SHIFT (shift dibuka di sela): pesan di dialog dan data dimuat ulang. Setelah berhasil
 * fokus pindah ke judul halaman (pemicu sudah menjadi baris dibatalkan).
 */
export function CancelPaymentSheet({
  entry,
  customer,
  onDone,
  onClose,
}: {
  entry: CreditHistoryEntry | null;
  customer: OwnerCustomer;
  onDone: (saved: OwnerCustomer) => void;
  onClose: () => void;
}) {
  const client = useQueryClient();
  const last = useRef<CreditHistoryEntry | null>(null);
  if (entry) last.current = entry;
  const shown = entry ?? last.current;
  const succeeded = useRef(false);
  const [confirm, setConfirm] = useState(false);
  const [reason, setReason] = useState("");
  const cancel = useCancelOwnerCreditPayment({
    mutation: {
      onSuccess: (saved) => {
        succeeded.current = true;
        toast.success("Pelunasan dibatalkan");
        onDone(saved);
        setConfirm(false);
        onClose();
      },
      onError: () => {
        void client.invalidateQueries({
          queryKey: getGetOwnerCustomerQueryKey(customer.id),
        });
      },
    },
  });

  const payment = shown?.payment ?? null;
  if (!shown || !payment) return null;
  const refocus = (e: Event) => {
    if (!succeeded.current) return;
    e.preventDefault();
    document.querySelector<HTMLElement>("main h1")?.focus();
  };
  const cashFromKasir =
    payment.channel === "kasir" && payment.method === "tunai";
  const errorText = cancel.isError ? pesanError(cancel.error) : null;

  return (
    <Sheet
      open={entry !== null}
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
        <SheetTitle className="text-[20px] font-bold">{`Pelunasan ${formatRupiah(shown.amount)}`}</SheetTitle>
        <SheetDescription>
          {`${paymentLabel(payment)} · ${dayTime(shown.at)} · ${payment.byName}`}
        </SheetDescription>
        {payment.inOpenShift ? (
          <p className="text-[15px] text-muted">
            Masih di shift yang buka — batalkan dari kasir
          </p>
        ) : (
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
            Batalkan pelunasan
          </Button>
        )}
        <SheetClose asChild>
          <Button variant="outline" className="h-12 w-full text-[17px]">
            Tutup
          </Button>
        </SheetClose>
      </SheetContent>
      <Dialog
        open={confirm && entry !== null && !payment.inOpenShift}
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
            <DialogTitle>Batalkan pelunasan ini?</DialogTitle>
            <DialogDescription>
              {`${formatRupiah(shown.amount)} dari ${customer.name}, ${dayTime(shown.at)}. ${balanceAfterCancel(customer.balance, shown.amount)}`}
              {cashFromKasir &&
                " Uang dikembalikan pemilik; laci kasir tidak berubah."}
            </DialogDescription>
          </DialogHeader>
          <div className="grid gap-1.5">
            <label htmlFor="alasan-batal" className="text-[15px] font-semibold">
              Alasan
            </label>
            <input
              id="alasan-batal"
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
                  paymentId: payment.id,
                  data: { reason: reason.trim() },
                })
              }
            >
              Batalkan pelunasan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Sheet>
  );
}
