import { Search } from "lucide-react";
import { useState } from "react";
import type { StaffProduct } from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/shared/ui/sheet";
import { searchProducts } from "./count-model";

const SHOWN_MAX = 50;
const LABEL = "Cari nama barang";

/** Cari di salinan daftar hitung (tanpa server, jadi bisa offline); memilih membuka barang itu. */
export function CountSearchSheet({
  open,
  products,
  onPick,
  onClose,
}: {
  open: boolean;
  products: readonly StaffProduct[];
  onPick: (product: StaffProduct) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState("");
  const found = searchProducts(products, text);
  return (
    <Sheet open={open} onOpenChange={(o) => !o && onClose()}>
      <SheetContent
        side="bottom"
        className="max-h-[85dvh] overflow-y-auto rounded-t-2xl pb-[env(safe-area-inset-bottom)]"
        onCloseAutoFocus={(e) => e.preventDefault()}
      >
        <SheetHeader>
          <SheetTitle>Cari barang</SheetTitle>
          <SheetDescription className="sr-only">
            Ketik nama atau barcode, lalu pilih barang yang akan dihitung.
          </SheetDescription>
        </SheetHeader>
        <div className="grid gap-2 px-4 pb-4">
          <div className="relative">
            <Search
              aria-hidden="true"
              className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-muted"
            />
            <input
              type="search"
              aria-label={LABEL}
              placeholder={LABEL}
              autoComplete="off"
              value={text}
              onChange={(e) => setText(e.target.value)}
              className="h-11 w-full min-w-0 rounded-md border border-border bg-surface pr-3 pl-9 text-[17px] outline-none focus-visible:border-primary focus-visible:ring-2 focus-visible:ring-primary"
            />
          </div>
          {found.length === 0 ? (
            <p role="status" className="text-[15px] text-muted">
              Tidak ada barang yang cocok
            </p>
          ) : (
            <ul className="grid gap-1">
              {found.slice(0, SHOWN_MAX).map((p) => (
                <li key={p.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setText("");
                      onPick(p);
                    }}
                    className="flex min-h-12 w-full min-w-0 items-center rounded-lg bg-bg px-3 py-1.5 text-left text-[17px] font-medium outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  >
                    <span className="truncate">{p.name}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
          {found.length > SHOWN_MAX && (
            <p className="text-[13px] text-muted">
              Ketik lebih banyak untuk mempersempit
            </p>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
