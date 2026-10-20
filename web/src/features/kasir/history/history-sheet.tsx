import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { toast } from "sonner";
import {
  getListTodaySalesQueryKey,
  useListTodaySales,
  usePrintSale,
  useVoidSale,
} from "@/shared/api/gen/sales/sales";
import type { Sale } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { pesanError } from "@/shared/lib/error-messages";
import { formatRupiah } from "@/shared/lib/money";
import { Button } from "@/shared/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui/sheet";
import { focusScanBox } from "../scan/scan-box";
import { OwnerPinDialog } from "../shared/owner-pin-dialog";

const timeFormat = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Asia/Jakarta",
});

const METHOD_LABEL = { cash: "Tunai", qris: "QRIS", credit: "Kasbon" } as const;

function methodLabel(sale: Sale): string {
  const [first] = sale.payments;
  if (!first || sale.payments.length > 1) return "Campuran";
  return METHOD_LABEL[first.method];
}

const badge =
  "rounded-full bg-danger/10 px-2 py-0.5 text-xs font-medium text-danger";

type Props = { open: boolean; onClose: () => void };

/** Penjualan hari ini (terbaru dulu): cetak ulang struk dan batalkan dengan PIN pemilik. */
export function HistorySheet({ open, onClose }: Props) {
  const client = useQueryClient();
  const sales = useListTodaySales({ query: { enabled: open } });
  const [voiding, setVoiding] = useState<Sale | null>(null);
  const refresh = () =>
    client.invalidateQueries({ queryKey: getListTodaySalesQueryKey() });

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
            <SheetTitle>Riwayat hari ini</SheetTitle>
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
              <p className="text-muted">Belum ada transaksi hari ini</p>
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
      <OwnerPinDialog
        open={voiding !== null}
        title="PIN pemilik"
        requireReason
        pending={voidSale.isPending}
        error={voidSale.isError ? pesanError(voidSale.error) : undefined}
        onCancel={cancelVoid}
        onSubmit={(ownerPin, reason) => {
          if (voiding && reason !== undefined) {
            voidSale.mutate({
              saleId: voiding.id,
              data: { ownerPin, reason },
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
          <span className="text-muted">{methodLabel(sale)}</span>
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
