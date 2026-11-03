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

/** Batal: buang draf atau simpan sebagai draf. Fokus kembali ke tombol Batal saat ditutup. */
export function CancelDialog({
  onDiscard,
  onKeep,
}: {
  onDiscard: () => void;
  onKeep: () => void;
}) {
  return (
    <Dialog>
      <DialogTrigger asChild>
        <Button variant="outline">Batal</Button>
      </DialogTrigger>
      <DialogContent showCloseButton={false}>
        <DialogHeader>
          <DialogTitle>Buang draf ini?</DialogTitle>
          <DialogDescription>
            Draf barang masuk ini akan dihapus dari HP.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={onKeep}>
            Simpan draf
          </Button>
          <Button variant="danger" onClick={onDiscard}>
            Buang draf
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
