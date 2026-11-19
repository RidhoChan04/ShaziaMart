import { useId, useState } from "react";
import { useGetSession } from "@/shared/api/gen/auth/auth";
import { useGetKasirSettings } from "@/shared/api/gen/settings/settings";
import { useGetCurrentShift } from "@/shared/api/gen/shift/shift";
import { formatRupiah, parseRupiah } from "@/shared/lib/money";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { OwnerPhoneLine } from "../common/owner-phone-line";
import { ScannedAlert } from "../common/scanned-alert";
import { useReasonField } from "../common/use-reason-field";
import { MoneyField } from "../payment/tunai-tab";
import { focusScanBox } from "../scan/scan-box";
import { pendingExpenseId } from "./pending-expense-id";
import { useSubmitExpense } from "./use-submit-expense";

function ExpenseSession({ onClose }: { onClose: () => void }) {
  const reasonId = useId();
  // Cache gerbang (sesi & shift sudah dimuat); mengikat id ke kasir dan shift.
  const userId = useGetSession({
    query: { staleTime: Number.POSITIVE_INFINITY },
  }).data?.user.id;
  const shiftId = useGetCurrentShift({
    query: { staleTime: Number.POSITIVE_INFINITY },
  }).data?.shift?.id;
  const ownerPhone =
    useGetKasirSettings({ query: { staleTime: 60_000 } }).data?.ownerPhone ??
    null;
  const [amountText, setAmountText] = useState("");
  const field = useReasonField();
  const expense = useSubmitExpense(onClose);

  const amount = parseRupiah(amountText);
  const trimmed = field.trimmed;
  const ready =
    amount !== null &&
    amount >= 1 &&
    trimmed !== "" &&
    !expense.pending &&
    Boolean(userId && shiftId);

  function submit() {
    if (!ready || amount === null || !userId || !shiftId) return;
    // Id bertahan lintas buka-tutup dialog sampai simpan berhasil (terikat kasir, shift, 10 menit).
    const { id, reused } = pendingExpenseId(
      { userId, shiftId },
      amount,
      trimmed,
    );
    expense.submit({ id, amount, reason: trimmed }, reused);
  }

  return (
    <Dialog
      open
      onOpenChange={(next) => {
        if (!next && !expense.pending) onClose();
      }}
    >
      <DialogContent
        className="sm:max-w-[400px]"
        aria-describedby={undefined}
        showCloseButton={!expense.pending}
        onOpenAutoFocus={(e) => {
          // Isian Nominal, bukan tombol tutup.
          e.preventDefault();
          (e.currentTarget as HTMLElement)
            .querySelector<HTMLElement>("input")
            ?.focus();
        }}
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          focusScanBox();
        }}
      >
        <DialogHeader>
          <DialogTitle>Kas keluar dari laci</DialogTitle>
        </DialogHeader>
        <form
          className="grid gap-3"
          {...field.formProps}
          onSubmit={(e) => {
            e.preventDefault();
            submit();
          }}
        >
          <div className="grid gap-1">
            <MoneyField
              label="Nominal"
              value={amountText}
              onChange={setAmountText}
            />
            {amount !== null && amount >= 1 && (
              <p className="text-sm text-muted tabular-nums">
                {`Uang seharusnya di laci berkurang ${formatRupiah(amount)}.`}
              </p>
            )}
          </div>
          <label htmlFor={reasonId} className="text-sm font-medium">
            Alasan
          </label>
          <Input
            id={reasonId}
            {...field.inputProps}
            placeholder="Beli es batu"
          />
          <ScannedAlert
            show={field.scanned}
            text="Itu hasil scan barcode, bukan alasan"
          />
          {expense.error && !field.scanned && (
            <p role="alert" className="text-sm font-medium text-danger">
              {expense.error}
            </p>
          )}
          <OwnerPhoneLine phone={ownerPhone} />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={onClose}
              disabled={expense.pending}
            >
              Kembali
            </Button>
            <Button
              type="submit"
              variant="primary"
              disabled={!ready}
              aria-busy={expense.pending}
            >
              Catat kas keluar
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Kas keluar dari laci (S2): nominal + alasan wajib. Boleh dibuka walau keranjang berisi
 * (keranjang tidak disentuh). Esc/Kembali menutup kecuali saat menyimpan; fokus kembali ke kotak scan.
 */
export function ExpenseDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  return open ? <ExpenseSession onClose={onClose} /> : null;
}
