import { useState } from "react";
import { formatRupiah } from "@/shared/lib/money";
import { Button } from "@/shared/ui/button";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/shared/ui/sheet";
import { useCart } from "../cart/cart-store";
import { cartSummary } from "../cart/cart-view";

const timeFormat = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: "Asia/Jakarta",
});

/** Tombol `Ditahan ({n})` + daftar keranjang ditahan; tampil hanya bila ada. */
export function HeldCartsSheet({ onClose }: { onClose: () => void }) {
  const held = useCart((s) => s.held);
  const [open, setOpen] = useState(false);
  if (held.length === 0) return null;

  return (
    <Sheet open={open} onOpenChange={setOpen}>
      <SheetTrigger asChild>
        <Button variant="outline">Ditahan ({held.length})</Button>
      </SheetTrigger>
      <SheetContent
        side="right"
        onCloseAutoFocus={(e) => {
          e.preventDefault();
          onClose();
        }}
      >
        <SheetHeader>
          <SheetTitle>Keranjang ditahan</SheetTitle>
          <SheetDescription>
            Lanjutkan untuk memindahkan ke layar kasir.
          </SheetDescription>
        </SheetHeader>
        <ul className="flex flex-col gap-2 overflow-y-auto px-4 pb-4">
          {held.map((h) => {
            const { itemCount, total } = cartSummary(h.lines);
            return (
              <li
                key={h.id}
                className="flex items-center justify-between gap-3 rounded-md border border-border p-3"
              >
                <div>
                  <p className="font-medium">{h.label}</p>
                  <p className="num text-sm text-muted">
                    {itemCount} barang · {formatRupiah(total)}
                  </p>
                  <p className="num text-xs text-muted">
                    Ditahan {timeFormat.format(h.heldAt)}
                  </p>
                </div>
                <Button
                  onClick={() => {
                    useCart.getState().resume(h.id);
                    setOpen(false);
                    // Daftar bisa kosong lalu sheet hilang sebelum onCloseAutoFocus.
                    onClose();
                  }}
                >
                  Lanjutkan
                </Button>
              </li>
            );
          })}
        </ul>
      </SheetContent>
    </Sheet>
  );
}
