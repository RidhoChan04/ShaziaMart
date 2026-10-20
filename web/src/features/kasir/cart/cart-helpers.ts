import type {
  CatalogMatch,
  PriceChange,
} from "../../../shared/api/gen/shaziaMartAPI.schemas";
import { newId } from "../../../shared/lib/id";
import { unitPriceFor } from "../../../shared/lib/pricing";
import type { CartData, CartLine } from "./cart-store";

export function findUnit(match: CatalogMatch) {
  const unit = match.product.units.find((u) => u.id === match.unitId);
  if (!unit) {
    throw new Error(
      `Satuan ${match.unitId} tidak ada pada ${match.product.id}`,
    );
  }
  return unit;
}

export function newLine(
  match: CatalogMatch,
  qtyBase: number,
  amount: number | null,
): CartLine {
  const unit = findUnit(match);
  return {
    lineId: newId(),
    unitId: unit.id,
    productId: match.product.id,
    productName: match.product.name,
    unitName: unit.name,
    isCurah: match.product.isCurah,
    baseUnit: match.product.baseUnit,
    unitSize: unit.unitSize,
    listPrice: unit.price,
    wholesaleTiers: unit.wholesaleTiers,
    qtyBase,
    amount,
  };
}

/** Tahan keranjang aktif (bila berisi) ke daftar `held`. */
export function withActiveHeld(
  d: CartData,
): Pick<CartData, "held" | "heldSeq"> {
  if (d.lines.length === 0) return { held: d.held, heldSeq: d.heldSeq };
  const n = d.heldSeq + 1;
  return {
    held: [
      ...d.held,
      {
        id: newId(),
        label: `Keranjang ${n}`,
        heldAt: Date.now(),
        saleId: d.saleId,
        lines: d.lines,
      },
    ],
    heldSeq: n,
  };
}

export function step(d: CartData, dir: 1 | -1): string | null {
  if (d.lines.length === 0) return null;
  const cur = d.lines.findIndex((l) => l.lineId === d.selectedLineId);
  const next =
    cur === -1
      ? dir === 1
        ? 0
        : d.lines.length - 1
      : Math.min(d.lines.length - 1, Math.max(0, cur + dir));
  return d.lines[next]?.lineId ?? null;
}

/** Harga baru dari 409 PRICE_CHANGED. Baris grosir: tier tetap; listPrice berubah hanya bila harga lama cocok. */
export function withPriceChanges(
  lines: readonly CartLine[],
  changes: readonly PriceChange[],
): CartLine[] {
  return lines.map((l) => {
    const c = changes.find((x) => x.unitId === l.unitId);
    if (!c) return l;
    const { wholesale } = unitPriceFor(
      {
        price: l.listPrice,
        unitSize: l.unitSize,
        wholesaleTiers: l.wholesaleTiers,
      },
      l.qtyBase,
    );
    return !wholesale || c.oldUnitPrice === l.listPrice
      ? { ...l, listPrice: c.newUnitPrice }
      : l;
  });
}
