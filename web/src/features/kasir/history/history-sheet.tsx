import { useQueryClient } from "@tanstack/react-query";
import { useMemo, useRef, useState } from "react";
import { toast } from "sonner";
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
import type {
  KasirCreditPayment,
  Sale,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
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
import { focusScanBox } from "../scan/scan-box";
import { BADGE, clockLabel } from "./clock";
import { CreditPaymentRow } from "./credit-payment-row";
import { OldSaleSearch } from "./old-sale-search";
import { VoidSaleDialog } from "./void-sale-dialog";

type Entry =
  | { kind: "sale"; at: number; sale: Sale }
  | { kind: "payment"; at: number; payment: KasirCreditPayment };

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
  const sales = useListShiftSales({ query: { enabled: open } });
  const [voiding, setVoiding] = useState<Sale | null>(null);
  // Setelah batal berhasil tombol `Batalkan` hilang; fokus ke judul, bukan ke body.
  const titleRef = useRef<HTMLHeadingElement>(null);
  const focusTitleAfterClose = useRef(false);
  const settleFocus = (e: Event) => {
    if (!focusTitleAfterClose.current) return;
    focusTitleAfterClose.current = false;
    e.preventDefault();
    titleRef.current?.focus();
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
      onSuccess: () => {
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
      ].sort((a, b) => b.at - a.at),
    [sales.data, payments.data],
  );
  const loaded = sales.data !== undefined && payments.data !== undefined;

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
                    onVoid={() => setVoiding(entry.sale)}
                  />
                ) : (
                  <CreditPaymentRow
                    key={`p-${entry.payment.id}`}
                    payment={entry.payment}
                    printing={printPayment.isPending}
                    onPrint={() =>
                      printPayment.mutate({ paymentId: entry.payment.id })
                    }
                    onCancel={() => setCancelling(entry.payment)}
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
