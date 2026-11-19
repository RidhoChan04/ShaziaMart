import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/shared/api/fetcher";
import {
  getListShiftCreditPaymentsQueryKey,
  getSearchCustomersQueryKey,
  useCancelCreditPayment,
  useListShiftCreditPayments,
  usePrintCreditPayment,
} from "@/shared/api/gen/credit/credit";
import {
  getListShiftSalesQueryKey,
  useListShiftSales,
  usePrintSale,
  useVoidSale,
} from "@/shared/api/gen/sales/sales";
import { useGetKasirSettings } from "@/shared/api/gen/settings/settings";
import type {
  DrawerExpense,
  KasirCreditPayment,
  Sale,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  getListShiftExpensesQueryKey,
  useCancelShiftExpense,
  useListShiftExpenses,
} from "@/shared/api/gen/shift/shift";
import { pesanError } from "@/shared/lib/error-messages";
import { formatRupiah } from "@/shared/lib/money";
import { saleMethodLabel } from "@/shared/lib/payment-labels";
import { Button } from "@/shared/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui/sheet";
import { ReasonDialog } from "../common/reason-dialog";
import { clearPendingRepaymentId } from "../credit/pending-repayment-id";
import { focusScanBox } from "../scan/scan-box";
import { clearPendingExpenseId } from "../shift/pending-expense-id";
import { BADGE, clockLabel } from "./clock";
import { CreditPaymentRow } from "./credit-payment-row";
import { ExpenseRow } from "./expense-row";
import { OldSaleSearch } from "./old-sale-search";
import { VoidSaleDialog } from "./void-sale-dialog";

type Entry =
  | { kind: "sale"; at: number; sale: Sale }
  | { kind: "payment"; at: number; payment: KasirCreditPayment }
  | { kind: "expense"; at: number; expense: DrawerExpense };

/** OUTSIDE_SHIFT di sini = kas keluar (bukan pelunasan); selebihnya pesan umum. */
function pesanBatalKasKeluar(err: unknown): string {
  if (err instanceof ApiError && err.code === "OUTSIDE_SHIFT") {
    return "Kas keluar dari shift sebelumnya — batalkan dari app pemilik";
  }
  return pesanError(err);
}

/** Pelunasan tunai mengeluarkan uang dari laci saat dibatalkan; QRIS tidak. */
function cancelNote(p: KasirCreditPayment): string {
  const debt = `Kasbon ${p.customerName} bertambah lagi ${formatRupiah(p.amount)}`;
  return p.method === "tunai"
    ? `${debt} dan uang ${formatRupiah(p.amount)} dikeluarkan dari laci.`
    : `${debt}.`;
}

type Props = { open: boolean; onClose: () => void };

/**
 * Penjualan shift yang sedang buka (jawaban pemilik J0), terbaru dulu: cetak ulang struk dan
 * batalkan dengan alasan wajib (ruling R4, tanpa PIN pemilik).
 */
export function HistorySheet({ open, onClose }: Props) {
  const client = useQueryClient();
  const ownerPhone =
    useGetKasirSettings({ query: { staleTime: 60_000 } }).data?.ownerPhone ??
    null;
  const sales = useListShiftSales({ query: { enabled: open } });
  const [voiding, setVoiding] = useState<Sale | null>(null);
  // Setelah batal berhasil tombol `Batalkan` hilang; fokus ke judul, bukan ke body.
  const titleRef = useRef<HTMLHeadingElement>(null);
  const focusTitleAfterClose = useRef(false);
  // Dialog dibuka dari baris di dalam lembar, bukan dari Trigger: Radix tidak tahu ke mana kembali.
  const opener = useRef<HTMLElement | null>(null);
  const rememberOpener = () => {
    opener.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
  };
  const settleFocus = (e: Event) => {
    e.preventDefault();
    const succeeded = focusTitleAfterClose.current;
    focusTitleAfterClose.current = false;
    const target = succeeded ? titleRef.current : opener.current;
    if (target?.isConnected) target.focus();
  };
  const refresh = () =>
    client.invalidateQueries({ queryKey: getListShiftSalesQueryKey() });

  const print = usePrintSale({
    mutation: {
      onSuccess: ({ printStatus }) => {
        if (printStatus === "gagal") toast.error("Struk gagal dicetak");
        else toast.success("Struk dicetak");
      },
      onError: (err) => toast.error(pesanError(err)),
      onSettled: refresh,
    },
  });
  const voidSale = useVoidSale({
    mutation: {
      onSuccess: () => {
        focusTitleAfterClose.current = true;
        setVoiding(null);
        toast.success("Transaksi dibatalkan");
        refresh();
      },
    },
  });

  const cancelVoid = () => {
    if (voidSale.isPending) return;
    voidSale.reset();
    setVoiding(null);
  };

  const payments = useListShiftCreditPayments({ query: { enabled: open } });
  const [cancelling, setCancelling] = useState<KasirCreditPayment | null>(null);
  const refreshPayments = () => {
    void client.invalidateQueries({
      queryKey: getListShiftCreditPaymentsQueryKey(),
    });
  };
  const printPayment = usePrintCreditPayment({
    mutation: {
      onSuccess: ({ printStatus }) => {
        if (printStatus === "gagal") toast.error("Struk gagal dicetak");
        else toast.success("Struk dicetak");
      },
      onError: (err) => toast.error(pesanError(err)),
      onSettled: refreshPayments,
    },
  });
  const cancelPayment = useCancelCreditPayment({
    mutation: {
      onSuccess: (_, { paymentId }) => {
        // Id tertunda yang sama tidak boleh memutar ulang rekaman yang kini batal.
        clearPendingRepaymentId(paymentId);
        focusTitleAfterClose.current = true;
        setCancelling(null);
        toast.success("Pelunasan dibatalkan");
        refreshPayments();
        void client.invalidateQueries({
          queryKey: getSearchCustomersQueryKey(),
        });
      },
    },
  });
  const dismissCancelPayment = () => {
    if (cancelPayment.isPending) return;
    cancelPayment.reset();
    setCancelling(null);
  };

  const expenses = useListShiftExpenses({ query: { enabled: open } });
  const [cancellingExpense, setCancellingExpense] =
    useState<DrawerExpense | null>(null);
  const cancelExpense = useCancelShiftExpense({
    mutation: {
      onSuccess: (_, { expenseId }) => {
        // Id tertunda yang sama tidak boleh memutar ulang rekaman yang kini batal.
        clearPendingExpenseId(expenseId);
        focusTitleAfterClose.current = true;
        setCancellingExpense(null);
        toast.success("Kas keluar dibatalkan");
        void client.invalidateQueries({
          queryKey: getListShiftExpensesQueryKey(),
        });
      },
    },
  });
  const dismissCancelExpense = () => {
    if (cancelExpense.isPending) return;
    cancelExpense.reset();
    setCancellingExpense(null);
  };

  // Terbaru dulu; urutan stabil, jadi jam yang sama mempertahankan urutan server.
  const entries = useMemo<Entry[]>(
    () =>
      [
        ...(sales.data ?? []).map(
          (sale): Entry => ({
            kind: "sale",
            at: sale.createdAt,
            sale,
          }),
        ),
        ...(payments.data ?? []).map(
          (payment): Entry => ({
            kind: "payment",
            at: payment.createdAt,
            payment,
          }),
        ),
        ...(expenses.data ?? []).map(
          (expense): Entry => ({
            kind: "expense",
            at: expense.at,
            expense,
          }),
        ),
      ].sort((a, b) => b.at - a.at),
    [sales.data, payments.data, expenses.data],
  );
  const loaded =
    sales.data !== undefined &&
    payments.data !== undefined &&
    expenses.data !== undefined;

  return (
    <>
      <Sheet open={open} onOpenChange={(next) => !next && onClose()}>
        <SheetContent
          side="right"
          className="sm:max-w-lg"
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            focusScanBox();
          }}
        >
          <SheetHeader>
            <SheetTitle ref={titleRef} tabIndex={-1} className="outline-none">
              Riwayat shift ini
            </SheetTitle>
            <SheetDescription>
              Cetak ulang struk atau batalkan transaksi.
            </SheetDescription>
          </SheetHeader>
          <div className="overflow-y-auto px-4 pb-4">
            {sales.isError && (
              <p role="alert" className="text-sm font-medium text-danger">
                {pesanError(sales.error)}
              </p>
            )}
            {payments.isError && (
              <p role="alert" className="text-sm font-medium text-danger">
                {pesanError(payments.error)}
              </p>
            )}
            {expenses.isError && (
              <p role="alert" className="text-sm font-medium text-danger">
                {pesanError(expenses.error)}
              </p>
            )}
            {loaded && entries.length === 0 && (
              <p className="text-muted">Belum ada transaksi di shift ini</p>
            )}
            <ul className="flex flex-col gap-2">
              {entries.map((entry) =>
                entry.kind === "sale" ? (
                  <SaleRow
                    key={`s-${entry.sale.id}`}
                    sale={entry.sale}
                    printing={print.isPending}
                    onPrint={() => print.mutate({ saleId: entry.sale.id })}
                    onVoid={() => {
                      rememberOpener();
                      setVoiding(entry.sale);
                    }}
                  />
                ) : entry.kind === "expense" ? (
                  <ExpenseRow
                    key={`e-${entry.expense.id}`}
                    expense={entry.expense}
                    onCancel={() => {
                      rememberOpener();
                      setCancellingExpense(entry.expense);
                    }}
                  />
                ) : (
                  <CreditPaymentRow
                    key={`p-${entry.payment.id}`}
                    payment={entry.payment}
                    printing={printPayment.isPending}
                    onPrint={() =>
                      printPayment.mutate({ paymentId: entry.payment.id })
                    }
                    onCancel={() => {
                      rememberOpener();
                      setCancelling(entry.payment);
                    }}
                  />
                ),
              )}
            </ul>
            <OldSaleSearch />
          </div>
        </SheetContent>
      </Sheet>
      <VoidSaleDialog
        sale={voiding}
        fromClosedShift={false}
        ownerPhone={ownerPhone}
        pending={voidSale.isPending}
        error={voidSale.isError ? pesanError(voidSale.error) : undefined}
        onCancel={cancelVoid}
        onCloseAutoFocus={settleFocus}
        onSubmit={(reason, qrisRefundSource) => {
          if (voiding) {
            voidSale.mutate({
              saleId: voiding.id,
              data: { reason, qrisRefundSource },
            });
          }
        }}
      />
      <ReasonDialog
        open={cancelling !== null}
        title={
          cancelling
            ? `Batalkan pelunasan ${formatRupiah(cancelling.amount)}?`
            : ""
        }
        description={cancelling ? cancelNote(cancelling) : ""}
        confirmLabel="Batalkan pelunasan"
        confirmTone="danger"
        ownerPhone={ownerPhone}
        pending={cancelPayment.isPending}
        error={
          cancelPayment.isError ? pesanError(cancelPayment.error) : undefined
        }
        onCancel={dismissCancelPayment}
        onCloseAutoFocus={settleFocus}
        onSubmit={(reason) => {
          if (cancelling) {
            cancelPayment.mutate({
              paymentId: cancelling.id,
              data: { reason },
            });
          }
        }}
      />
      <ReasonDialog
        open={cancellingExpense !== null}
        title={
          cancellingExpense
            ? `Batalkan kas keluar ${formatRupiah(cancellingExpense.amount)}?`
            : ""
        }
        description={
          cancellingExpense
            ? `Uang seharusnya di laci kembali bertambah ${formatRupiah(cancellingExpense.amount)}.`
            : ""
        }
        confirmLabel="Batalkan kas keluar"
        confirmTone="danger"
        ownerPhone={ownerPhone}
        pending={cancelExpense.isPending}
        error={
          cancelExpense.isError
            ? pesanBatalKasKeluar(cancelExpense.error)
            : undefined
        }
        onCancel={dismissCancelExpense}
        onCloseAutoFocus={settleFocus}
        onSubmit={(reason) => {
          if (cancellingExpense) {
            cancelExpense.mutate({
              expenseId: cancellingExpense.id,
              data: { reason },
            });
          }
        }}
      />
    </>
  );
}

function SaleRow({
  sale,
  printing,
  onPrint,
  onVoid,
}: {
  sale: Sale;
  printing: boolean;
  onPrint: () => void;
  onVoid: () => void;
}) {
  const voided = sale.status === "dibatalkan";
  return (
    <li className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
      <div className="min-w-0">
        <p className="num font-medium">
          {sale.number} ·{" "}
          <span className="font-normal text-muted">
            {clockLabel(sale.createdAt)}
          </span>
        </p>
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">{saleMethodLabel(sale.payments)}</span>
          <span className={voided ? "num line-through" : "num"}>
            {formatRupiah(sale.total)}
          </span>
          {voided && <span className={BADGE}>Dibatalkan</span>}
          {sale.printStatus === "gagal" && (
            <span className={BADGE}>Struk gagal</span>
          )}
        </p>
      </div>
      <div className="flex shrink-0 gap-2">
        <Button
          variant="outline"
          aria-label={`Cetak ulang ${sale.number}`}
          disabled={voided || printing}
          onClick={onPrint}
        >
          Cetak ulang
        </Button>
        {!voided && (
          <Button
            variant="outline"
            aria-label={`Batalkan ${sale.number}`}
            onClick={onVoid}
          >
            Batalkan
          </Button>
        )}
      </div>
    </li>
  );
}
