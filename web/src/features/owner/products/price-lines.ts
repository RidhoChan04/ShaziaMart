import type {
  OwnerProduct,
  PriceHistoryEntry,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatQty } from "@/shared/lib/quantity";

export type PriceLineView = {
  key: string;
  unitId: string;
  tierMinQty: number | null;
  label: string;
  detail: string;
  unitSize: number;
  price: number;
  cost: number | null;
};

const capitalize = (s: string): string =>
  s.charAt(0).toLocaleUpperCase("id") + s.slice(1);

/** Baris harga barang: eceran, tier grosirnya (urut minQty), lalu satuan besar aktif. Dipakai detail dan lembar harga (Task 11). */
export function priceLines(p: OwnerProduct): PriceLineView[] {
  const eceran = p.units[0];
  if (!eceran) return [];
  const lines: PriceLineView[] = [
    {
      key: `${eceran.id}:eceran`,
      unitId: eceran.id,
      tierMinQty: null,
      label: "Eceran",
      detail: `per ${eceran.name}`,
      unitSize: eceran.unitSize,
      price: eceran.price,
      cost: eceran.cost,
    },
  ];
  for (const tier of [...eceran.wholesaleTiers].sort(
    (a, b) => a.minQty - b.minQty,
  )) {
    lines.push({
      key: `${eceran.id}:${tier.minQty}`,
      unitId: eceran.id,
      tierMinQty: tier.minQty,
      label: "Grosir",
      detail: `beli ${tier.minQty}+ ${eceran.name}`,
      unitSize: eceran.unitSize,
      price: tier.price,
      cost: eceran.cost,
    });
  }
  for (const big of p.units.slice(1)) {
    if (!big.active) continue;
    lines.push({
      key: `${big.id}:eceran`,
      unitId: big.id,
      tierMinQty: null,
      label: capitalize(big.name),
      detail: `isi ${formatQty(big.unitSize, eceran.unitSize, eceran.name)}`,
      unitSize: big.unitSize,
      price: big.price,
      cost: big.cost,
    });
  }
  return lines;
}

/** `Eceran` | `Grosir 40+` | `Dus` */
export function historyLabel(e: PriceHistoryEntry): string {
  if (!e.isEceran) return capitalize(e.unitName);
  return e.tierMinQty === null ? "Eceran" : `Grosir ${e.tierMinQty}+`;
}
