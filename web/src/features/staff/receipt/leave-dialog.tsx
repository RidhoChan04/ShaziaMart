import { useRef, useState } from "react";
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
 * Batal saat ubah nota: tanpa perubahan langsung keluar; dengan perubahan yang belum disimpan
 * minta konfirmasi (alertdialog). Fokus kembali ke tombol Batal bila pengguna tetap di halaman.
 */
export function LeaveButton({
  dirty,
  onLeave,
}: {
  dirty: boolean;
  onLeave: () => void;
}) {
  const [open, setOpen] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  return (
    <>
      <Button
        ref={opener}
        variant="outline"
        onClick={() => (dirty ? setOpen(true) : onLeave())}
      >
        Batal
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent
          role="alertdialog"
          showCloseButton={false}
          onInteractOutside={(e) => e.preventDefault()}
          onCloseAutoFocus={(e) => {
            e.preventDefault();
            opener.current?.focus();
          }}
        >
          <DialogHeader>
            <DialogTitle>Buang perubahan?</DialogTitle>
            <DialogDescription>
              Perubahan pada nota ini belum disimpan.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>
              Lanjut mengubah
            </Button>
            <Button variant="danger" onClick={onLeave}>
              Buang perubahan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
