import { useQueryClient } from "@tanstack/react-query";
import { useId, useRef, useState } from "react";
import { toast } from "sonner";
import {
  getGetOwnerCustomerQueryKey,
  getGetOwnerSaleQueryKey,
  getGetOwnerTodaySummaryQueryKey,
  getListOwnerCustomersQueryKey,
  getListOwnerSalesQueryKey,
  useGetOwnerCustomer,
  useVoidOwnerSale,
} from "@/shared/api/gen/owner/owner";
import type { OwnerSale } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { pesanError } from "@/shared/lib/error-messages";
import { formatRupiah } from "@/shared/lib/money";
import { cleanReason, REASON_MAX } from "@/shared/lib/reason-rules";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/shared/ui/dialog";
import { Input } from "@/shared/ui/input";
import { partOf } from "./sales-model";

/** Setelah batal: transaksi tersimpan, daftar, ringkasan Beranda, saldo kasbon, dan stok barang dimuat ulang. */
function useRefreshAfterVoid() {
  const client = useQueryClient();
  return (saved: OwnerSale) => {
    client.setQueryData(getGetOwnerSaleQueryKey(saved.id), saved);
    void client.invalidateQueries({ queryKey: getListOwnerSalesQueryKey() });
    void client.invalidateQueries({
      queryKey: getGetOwnerTodaySummaryQueryKey(),
    });
    void client.invalidateQueries({
      queryKey: getListOwnerCustomersQueryKey(),
    });
    if (saved.customerId !== null) {
      void client.invalidateQueries({
        queryKey: getGetOwnerCustomerQueryKey(saved.customerId),
      });
    }
    void client.invalidateQueries({
      predicate: (q) =>
        typeof q.queryKey[0] === "string" &&
        q.queryKey[0].startsWith("/api/owner/products"),
    });
  };
}

/** (jawaban pemilik Q8) Kalimat tambahan bila membatalkan kasbon membuat saldo pelanggan minus; selain itu kosong. */
function overpaidNote(
  sale: OwnerSale,
  balance: number | undefined,
): string | null {
  const credit = partOf(sale, "credit");
  if (credit <= 0 || balance === undefined || !sale.customerName) return null;
  const after = balance - credit;
  return after < 0
    ? `Saldo ${sale.customerName} menjadi lebih bayar ${formatRupiah(-after)}.`
    : null;
}

/** Tombol `Batalkan transaksi` + dialog alasan (ruling R4): hanya untuk transaksi shift yang sudah tutup; laci tidak pernah berubah. */
export function VoidSaleSheet({ sale }: { sale: OwnerSale }) {
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const succeeded = useRef(false);
  const reasonId = useId();
  const refresh = useRefreshAfterVoid();
  const credit = partOf(sale, "credit");
  // Kalimat Q8 butuh saldo terkini: selama saldo belum dimuat (atau gagal), konfirmasi ditahan.
  const needsBalance = credit > 0 && sale.customerId !== null;
  const customer = useGetOwnerCustomer(sale.customerId ?? "", {
    query: { enabled: open && needsBalance },
  });
  const balanceReady =
    !needsBalance || (customer.isSuccess && !customer.isFetching);
  const note = overpaidNote(sale, customer.data?.balance);
  const voidSale = useVoidOwnerSale({
    mutation: {
      onSuccess: (saved) => {
        succeeded.current = true;
        refresh(saved);
        toast.success("Transaksi dibatalkan");
        setOpen(false);
      },
    },
  });
  const clean = cleanReason(reason);
  const ready = clean !== null && !voidSale.isPending && balanceReady;

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (voidSale.isPending) return;
        setOpen(next);
        if (next) {
          setReason("");
          voidSale.reset();
        }
      }}
    >
      <DialogTrigger asChild>
        <Button
          variant="outline"
          className="h-12 w-full text-[17px] text-danger"
        >
          Batalkan transaksi
        </Button>
      </DialogTrigger>
      <DialogContent
        onInteractOutside={(e) => e.preventDefault()}
        onCloseAutoFocus={(e) => {
          if (!succeeded.current) return;
          // Tombol pemicu sudah hilang: fokus ke judul halaman.
          e.preventDefault();
          document.querySelector<HTMLElement>("main h1")?.focus();
        }}
      >
        <DialogHeader>
          <DialogTitle>{`Batalkan ${sale.number}?`}</DialogTitle>
          <DialogDescription>
            Stok dikembalikan dan kasbon dibatalkan. Uang dikembalikan pemilik;
            laci kasir tidak berubah.
          </DialogDescription>
        </DialogHeader>
        {note && <p className="text-sm font-semibold tabular-nums">{note}</p>}
        {needsBalance && customer.isError && (
          <div className="grid justify-items-start gap-2">
            <p role="alert" className="text-sm font-medium text-danger">
              {`Saldo pelanggan belum bisa dimuat. ${pesanError(customer.error)}`}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => void customer.refetch()}
            >
              Coba lagi
            </Button>
          </div>
        )}
        <form
          className="grid gap-3"
          onSubmit={(e) => {
            e.preventDefault();
            if (clean !== null && ready) {
              voidSale.mutate({ saleId: sale.id, data: { reason: clean } });
            }
          }}
        >
          <label htmlFor={reasonId} className="text-sm font-medium">
            Alasan
          </label>
          <Input
            id={reasonId}
            autoComplete="off"
            maxLength={REASON_MAX}
            value={reason}
            onChange={(e) => setReason(e.target.value)}
          />
          {voidSale.isError && (
            <p role="alert" className="text-sm font-medium text-danger">
              {pesanError(voidSale.error)}
            </p>
          )}
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              disabled={voidSale.isPending}
              onClick={() => setOpen(false)}
            >
              Kembali
            </Button>
            <Button
              type="submit"
              variant="danger"
              disabled={!ready}
              aria-busy={voidSale.isPending}
            >
              Batalkan transaksi
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
