import { useState } from "react";
import type { OwnerOpnameItem } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { UnitCounter } from "@/shared/components/unit-counter";
import { Button } from "@/shared/ui/button";
import {
  Sheet,
  SheetClose,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from "@/shared/ui/sheet";

/** Satuan dasar barang curah dari nama satuan eceran: liter -> ml, selain itu gram. */
const baseUnitOf = (unitName: string): string =>
  /^(l|liter)$/i.test(unitName) ? "ml" : "gram";

function RecountForm({
  item,
  pending,
  onSave,
}: {
  item: OwnerOpnameItem;
  pending: boolean;
  onSave: (item: OwnerOpnameItem, qtyBase: number) => void;
}) {
  const [qty, setQty] = useState(item.countedQtyBase);
  return (
    <>
      <UnitCounter
        // Penghitung mengharapkan satuan besar dulu; server memberi eceran dulu.
        units={[...item.units].reverse()}
        baseUnitName={baseUnitOf(item.unitName)}
        isCurah={item.isCurah}
        value={qty}
        onChange={setQty}
      />
      <Button
        className="h-12 w-full text-[17px]"
        disabled={pending}
        onClick={() => onSave(item, qty)}
      >
        Simpan hitungan
      </Button>
    </>
  );
}

/** Lembar bawah `Hitung ulang` / `{barang}`: pemilik menghitung lagi, stok langsung disesuaikan bila disimpan. */
export function RecountSheet({
  item,
  pending,
  error,
  onCloseAutoFocus,
  onSave,
  onClose,
}: {
  item: OwnerOpnameItem | null;
  pending: boolean;
  error: string | null;
  onCloseAutoFocus: (e: Event) => void;
  onSave: (item: OwnerOpnameItem, qtyBase: number) => void;
  onClose: () => void;
}) {
  return (
    <Sheet
      open={item !== null}
      onOpenChange={(next) => {
        if (!next && !pending) onClose();
      }}
    >
      <SheetContent
        side="bottom"
        showCloseButton={false}
        onCloseAutoFocus={onCloseAutoFocus}
        className="max-h-[90dvh] gap-3 overflow-y-auto rounded-t-lg p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] lg:mx-auto lg:max-w-md"
      >
        <SheetTitle className="text-[20px] font-bold">Hitung ulang</SheetTitle>
        <SheetDescription>{item?.productName ?? ""}</SheetDescription>
        {item && (
          <RecountForm
            key={item.productId}
            item={item}
            pending={pending}
            onSave={onSave}
          />
        )}
        {error !== null && (
          <p role="alert" className="text-sm font-medium text-danger">
            {error}
          </p>
        )}
        <SheetClose asChild>
          <Button
            variant="outline"
            className="h-12 w-full text-[17px]"
            disabled={pending}
          >
            Batal
          </Button>
        </SheetClose>
      </SheetContent>
    </Sheet>
  );
}
