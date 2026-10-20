import type { Sale } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatRupiah } from "@/shared/lib/money";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";

/**
 * saleId ini sudah tersimpan dengan isi lain (jawaban sebelumnya hilang, lalu keranjang
 * diubah). Yang tersimpan adalah kebenaran; jendela ini wajib diakui lewat Mengerti.
 */
export function ReplayedSaleDialog({
  sale,
  onAccept,
}: {
  sale: Sale | null;
  onAccept: () => void;
}) {
  return (
    <Dialog open={sale !== null}>
      <DialogContent
        role="alertdialog"
        className="max-w-md"
        showCloseButton={false}
        onEscapeKeyDown={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <DialogTitle>Transaksi ini sudah tersimpan sebelumnya</DialogTitle>
          <DialogDescription>
            Keranjang diselesaikan sesuai data yang tersimpan di server.
          </DialogDescription>
        </DialogHeader>
        {sale && (
          <div className="grid gap-1 tabular-nums">
            <p className="font-semibold">{`No. ${sale.number}`}</p>
            <p>{`Total tersimpan ${formatRupiah(sale.total)}`}</p>
          </div>
        )}
        <DialogFooter>
          <Button onClick={onAccept}>Mengerti</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
