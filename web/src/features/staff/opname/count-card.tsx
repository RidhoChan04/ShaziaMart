import { Check, EyeOff } from "lucide-react";
import type { StaffProduct } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { UnitCounter } from "@/shared/components/unit-counter";
import { jakartaTime } from "@/shared/lib/business-day";
import { Button } from "@/shared/ui/button";
import {
  type Current,
  counterBaseName,
  unitsLargestFirst,
} from "./count-model";

/** Kartu barang yang sedang dihitung (mockup 6): jam dibuka, penghitung dus + pcs, simpan. */
export function CountCard({
  product,
  current,
  onChange,
  onSave,
}: {
  product: StaffProduct;
  current: Current;
  onChange: (qtyBase: number) => void;
  onSave: () => void;
}) {
  const badge =
    current.source === "scan"
      ? `Ter-scan ${jakartaTime(current.openedAt)}`
      : `Dibuka ${jakartaTime(current.openedAt)}`;
  return (
    <>
      <section
        aria-label="Sedang dihitung"
        className="grid gap-3 rounded-lg bg-surface p-4 shadow-sm"
      >
        <div className="flex items-center justify-between gap-2">
          <span className="text-[13px] font-semibold tracking-wide text-muted uppercase">
            Sedang dihitung
          </span>
          <span className="inline-flex items-center gap-1 rounded-full bg-primary-soft px-2 py-0.5 text-[12px] font-semibold text-primary tabular-nums">
            <Check aria-hidden="true" className="size-3" />
            {badge}
          </span>
        </div>
        <h2 className="text-[20px] leading-tight font-bold">{product.name}</h2>
        {/* key: penghitung mulai dari jumlah barang ini, bukan sisa barang sebelumnya */}
        <UnitCounter
          key={`${current.productId}:${current.openedAt}`}
          units={unitsLargestFirst(product)}
          baseUnitName={counterBaseName(product)}
          isCurah={product.isCurah}
          value={current.qtyBase}
          onChange={onChange}
        />
      </section>
      <p className="mt-3 flex items-center gap-1.5 px-1 text-[13px] text-muted">
        <EyeOff aria-hidden="true" className="size-4 shrink-0" />
        Stok sistem disembunyikan sampai selesai
      </p>
      <Button size="lg" className="mt-3 w-full" onClick={onSave}>
        Simpan, lanjut barang berikutnya
      </Button>
    </>
  );
}
