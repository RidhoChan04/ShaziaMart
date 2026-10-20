import type { PriceChange } from "@/shared/api/gen/shaziaMartAPI.schemas";
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
import type { CartLine } from "../cart/cart-store";

/** 409 PRICE_CHANGED: tampilkan harga lama → baru; konfirmasi menyimpan ulang dengan saleId yang sama. */
export function PriceChangedDialog({
  changes,
  lines,
  pending,
  onConfirm,
  onCancel,
}: {
  changes: PriceChange[] | null;
  lines: readonly CartLine[];
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const nameOf = (unitId: string) =>
    lines.find((l) => l.unitId === unitId)?.productName ?? unitId;

  return (
    <Dialog
      open={changes !== null}
      onOpenChange={(open) => {
        if (!open && !pending) onCancel();
      }}
    >
      <DialogContent className="max-w-md" showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>Harga berubah</DialogTitle>
          <DialogDescription>
            Periksa harga baru, lalu simpan ulang transaksi.
          </DialogDescription>
        </DialogHeader>
        <ul className="grid gap-1 tabular-nums">
          {changes?.map((c) => (
            <li key={c.unitId}>
              {`${nameOf(c.unitId)}: ${formatRupiah(c.oldUnitPrice)} → ${formatRupiah(c.newUnitPrice)}`}
            </li>
          ))}
        </ul>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            Batal
          </Button>
          <Button onClick={onConfirm} disabled={pending} aria-busy={pending}>
            Konfirmasi & simpan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
