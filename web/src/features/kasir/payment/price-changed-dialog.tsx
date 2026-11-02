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

/** 409 PRICE_CHANGED: keranjang sudah memakai harga baru; kasir hanya melihat ringkasan total. */
export function PriceChangedDialog({
  prompt,
  pending,
  onConfirm,
  onCancel,
}: {
  /** Total dihitung saat 409 diterima, sebelum dan sesudah harga baru diterapkan. */
  prompt: { count: number; oldTotal: number; newTotal: number } | null;
  pending: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  return (
    <Dialog
      open={prompt !== null}
      onOpenChange={(open) => {
        if (!open && !pending) onCancel();
      }}
    >
      <DialogContent className="max-w-md" showCloseButton={!pending}>
        <DialogHeader>
          <DialogTitle>Harga diperbarui</DialogTitle>
          <DialogDescription className="tabular-nums">
            {prompt &&
              `Harga ${prompt.count} barang diperbarui. Total sekarang ${formatRupiah(prompt.newTotal)} (sebelumnya ${formatRupiah(prompt.oldTotal)}).`}
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel} disabled={pending}>
            Kembali
          </Button>
          <Button onClick={onConfirm} disabled={pending} aria-busy={pending}>
            Simpan dengan harga baru
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
