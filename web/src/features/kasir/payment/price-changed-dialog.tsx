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

/** Satu baris per satuan walau server mengirim ganda (kontrak: satu per unitId). */
const perUnit = (changes: readonly PriceChange[]) =>
  changes.filter(
    (c, i) => changes.findIndex((x) => x.unitId === c.unitId) === i,
  );

/** 409 PRICE_CHANGED: harga lama → baru dan total lama → baru; konfirmasi menerapkan harga baru. */
export function PriceChangedDialog({
  prompt,
  lines,
  pending,
  onConfirm,
  onCancel,
}: {
  /** Total dihitung saat 409 diterima, agar tidak bergeser setelah harga diterapkan. */
  prompt: { changes: PriceChange[]; oldTotal: number; newTotal: number } | null;
  lines: readonly CartLine[];
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const nameOf = (unitId: string) =>
    lines.find((l) => l.unitId === unitId)?.productName ?? unitId;

  return (
    <Dialog
      open={prompt !== null}
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
          {prompt &&
            perUnit(prompt.changes).map((c) => (
              <li key={c.unitId}>
                {`${nameOf(c.unitId)}: ${formatRupiah(c.oldUnitPrice)} → ${formatRupiah(c.newUnitPrice)}`}
              </li>
            ))}
        </ul>
        {prompt && (
          <p className="flex flex-wrap gap-x-2 tabular-nums">
            <span className="text-muted">{`Total lama ${formatRupiah(prompt.oldTotal)}`}</span>
            <span aria-hidden>→</span>
            <span className="font-bold">{`Total baru ${formatRupiah(prompt.newTotal)}`}</span>
          </p>
        )}
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
