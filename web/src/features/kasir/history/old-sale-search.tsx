import { useQueryClient } from "@tanstack/react-query";
import { useEffect, useId, useRef, useState } from "react";
import { toast } from "sonner";
import {
  getListShiftSalesQueryKey,
  getLookupSalesQueryKey,
  useLookupSales,
  useVoidSale,
} from "@/shared/api/gen/sales/sales";
import type { KasirLookupSale } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { useScanGuard } from "@/shared/hooks/use-scan-guard";
import { pesanError } from "@/shared/lib/error-messages";
import { formatRupiah } from "@/shared/lib/money";
import { saleMethodLabel } from "@/shared/lib/payment-labels";
import { Button } from "@/shared/ui/button";
import { Input } from "@/shared/ui/input";
import { ScannedAlert } from "../common/scanned-alert";
import { BADGE, dayClockLabel } from "./clock";
import { VoidSaleDialog } from "./void-sale-dialog";

const DEBOUNCE_MS = 150;
const Q_MAX = 20;
const VALID_Q = /^[0-9-]{1,20}$/;

/**
 * Cari struk lama (ruling R12): transaksi shift sebelumnya, paling lama 7 hari. Batal lewat
 * dialog yang sama dengan Riwayat; uang laci dihitung server (tampilan di sini hanya kalimat).
 */
export function OldSaleSearch() {
  const client = useQueryClient();
  const inputId = useId();
  const noteId = useId();
  const [input, setInput] = useState("");
  const [q, setQ] = useState("");
  const [voiding, setVoiding] = useState<KasirLookupSale | null>(null);
  const guard = useScanGuard(setInput);
  const searchRef = useRef<HTMLInputElement>(null);
  const focusSearchAfterClose = useRef(false);

  useEffect(() => {
    const timer = setTimeout(() => setQ(input.trim()), DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [input]);

  const valid = VALID_Q.test(q);
  const lookup = useLookupSales({ q }, { query: { enabled: valid } });

  const voidSale = useVoidSale({
    mutation: {
      onSuccess: () => {
        focusSearchAfterClose.current = true;
        setVoiding(null);
        toast.success("Transaksi dibatalkan");
        void client.invalidateQueries({ queryKey: getLookupSalesQueryKey() });
        void client.invalidateQueries({
          queryKey: getListShiftSalesQueryKey(),
        });
      },
    },
  });

  const cancelVoid = () => {
    if (voidSale.isPending) return;
    voidSale.reset();
    setVoiding(null);
  };

  return (
    <section className="mt-6 grid gap-2" aria-labelledby={`${inputId}-h`}>
      <h3 id={`${inputId}-h`} className="text-sm font-semibold">
        Transaksi shift sebelumnya
      </h3>
      <Input
        ref={searchRef}
        id={inputId}
        aria-label="Cari nomor struk"
        aria-describedby={noteId}
        placeholder="Cari nomor struk"
        inputMode="numeric"
        autoComplete="off"
        maxLength={Q_MAX}
        value={input}
        onKeyDown={guard.onKeyDown}
        onChange={(e) => {
          setInput(e.target.value.replace(/[^0-9-]/g, ""));
          guard.reset();
        }}
      />
      <ScannedAlert show={guard.scanned} />
      <p id={noteId} className="text-xs text-muted">
        Maksimal 7 hari ke belakang
      </p>
      {lookup.isError && (
        <p role="alert" className="text-sm font-medium text-danger">
          {pesanError(lookup.error)}
        </p>
      )}
      {valid && lookup.isSuccess && lookup.data.length === 0 && (
        <p className="text-muted">
          Tidak ada transaksi dengan nomor itu dalam 7 hari
        </p>
      )}
      {valid && lookup.isSuccess && (
        <ul className="flex flex-col gap-2">
          {lookup.data.map((sale) => (
            <OldSaleRow
              key={sale.id}
              sale={sale}
              onVoid={() => setVoiding(sale)}
            />
          ))}
        </ul>
      )}
      <VoidSaleDialog
        sale={voiding}
        fromClosedShift
        pending={voidSale.isPending}
        error={voidSale.isError ? pesanError(voidSale.error) : undefined}
        onCancel={cancelVoid}
        onCloseAutoFocus={(e) => {
          // Tombol `Batalkan` baris itu sudah hilang; kembali ke kotak cari.
          if (!focusSearchAfterClose.current) return;
          focusSearchAfterClose.current = false;
          e.preventDefault();
          searchRef.current?.focus();
        }}
        onSubmit={(reason, qrisRefundSource) => {
          if (voiding) {
            voidSale.mutate({
              saleId: voiding.id,
              data: { reason, qrisRefundSource },
            });
          }
        }}
      />
    </section>
  );
}

function OldSaleRow({
  sale,
  onVoid,
}: {
  sale: KasirLookupSale;
  onVoid: () => void;
}) {
  const voided = sale.status === "dibatalkan";
  return (
    <li className="flex items-center justify-between gap-3 rounded-md border border-border p-3">
      <div className="min-w-0">
        <p className="num font-medium">
          {sale.number} ·{" "}
          <span className="font-normal text-muted">
            {dayClockLabel(sale.createdAt)}
          </span>
        </p>
        <p className="flex flex-wrap items-center gap-2 text-sm">
          <span className="text-muted">
            {saleMethodLabel(sale.payments)} · {sale.kasirName}
          </span>
          <span className={voided ? "num line-through" : "num"}>
            {formatRupiah(sale.total)}
          </span>
          {voided && <span className={BADGE}>Dibatalkan</span>}
        </p>
      </div>
      {!voided && (
        <Button
          variant="outline"
          className="shrink-0"
          aria-label={`Batalkan ${sale.number}`}
          onClick={onVoid}
        >
          Batalkan
        </Button>
      )}
    </li>
  );
}
