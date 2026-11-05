import type { OwnerOpnameItem } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { Button } from "@/shared/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/shared/ui/dialog";
import { signedQty } from "./opname-model";

/** `Setujui selisih ini?` / `Stok {barang} disesuaikan −40 pcs.`; stok baru berubah setelah `Setujui`. */
export function ApproveDialog({
  item,
  pending,
  error,
  onCloseAutoFocus,
  onApprove,
  onClose,
}: {
  item: OwnerOpnameItem | null;
  pending: boolean;
  error: string | null;
  onCloseAutoFocus: (e: Event) => void;
  onApprove: (item: OwnerOpnameItem) => void;
  onClose: () => void;
}) {
  return (
    <Dialog
      open={item !== null}
      onOpenChange={(next) => {
        if (!next && !pending) onClose();
      }}
    >
      <DialogContent
        role="alertdialog"
        showCloseButton={false}
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <DialogHeader>
          <DialogTitle>Setujui selisih ini?</DialogTitle>
          <DialogDescription>
            {item
              ? `Stok ${item.productName} disesuaikan ${signedQty(item.diffQtyBase, item.unitSize, item.unitName)}.`
              : ""}
          </DialogDescription>
        </DialogHeader>
        {error !== null && (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        )}
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={onClose}>
            Kembali
          </Button>
          <Button
            disabled={pending || item === null}
            onClick={() => item && onApprove(item)}
          >
            Setujui
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
