import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  getListShiftSalesQueryKey,
  useListShiftSales,
  usePrintSale,
  useVoidSale,
} from "@/shared/api/gen/sales/sales";
import type { Sale } from "@/shared/api/gen/shaziaMartAPI.schemas";
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
import { focusScanBox } from "../scan/scan-box";
import { VoidSaleDialog } from "./void-sale-dialog";

const timeFormat = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Asia/Jakarta",
});

const badge =
  "rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger";

type Props = { open: boolean; onClose: () => void };

/**
 * Penjualan shift yang sedang buka (jawaban pemilik J0), terbaru dulu: cetak ulang struk dan
 * batalkan dengan alasan wajib (ruling R4, tanpa PIN pemilik).
 */
export function HistorySheet({ open, onClose }: Props) {
  const client = useQueryClient();
  const sales = useListShiftSales({ query: { enabled: open } });
  const [voiding, setVoiding] = useState<Sale | null>(null);
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
            <SheetTitle>Riwayat shift ini</SheetTitle>
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
            {sales.data?.length === 0 && (
              <p className="text-muted">Belum ada transaksi di shift ini</p>
            )}
            <ul className="flex flex-col gap-2">
              {sales.data?.map((sale) => (
                <SaleRow
                  key={sale.id}
                  sale={sale}
                  printing={print.isPending}
                  onPrint={() => print.mutate({ saleId: sale.id })}
                  onVoid={() => setVoiding(sale)}
                />
              ))}
            </ul>
          </div>
        </SheetContent>
      </Sheet>
      <VoidSaleDialog
        sale={voiding}
        fromClosedShift={false}
        pending={voidSale.isPending}
        error={voidSale.isError ? pesanError(voidSale.error) : undefined}
        onCancel={cancelVoid}
        onSubmit={(reason, qrisRefundSource) => {
          if (voiding) {
            voidSale.mutate({
              saleId: voiding.id,
              data: { reason, qrisRefundSource },
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
            {timeFormat.format(sale.createdAt).replace(":", ".")}
          </span>
        </p>
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">{saleMethodLabel(sale.payments)}</span>
          <span className={voided ? "num line-through" : "num"}>
            {formatRupiah(sale.total)}
          </span>
          {voided && <span className={badge}>Dibatalkan</span>}
          {sale.printStatus === "gagal" && (
            <span className={badge}>Struk gagal</span>
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
