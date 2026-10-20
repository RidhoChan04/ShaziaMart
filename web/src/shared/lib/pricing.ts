import type { ProductUnit } from "../api/gen/shaziaMartAPI.schemas";
import { lineSubtotal, qtyBaseFromAmount } from "./quantity";

type PricedUnit = Pick<ProductUnit, "price" | "unitSize" | "wholesaleTiers">;

export interface PricedLine {
  qtyBase: number;
  unitPrice: number;
  subtotal: number;
  wholesale: boolean;
}

function assertPositiveSafeInt(value: number, name: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new RangeError(`${name} harus bilangan bulat positif yang aman`);
  }
}

/**
 * Harga satuan untuk `qtyBase`. Tier grosir hanya berlaku bila `qtyBase`
 * kelipatan `unitSize`; dipilih tier dengan `minQty` terbesar yang ≤ jumlah.
 */
export function unitPriceFor(
  unit: PricedUnit,
  qtyBase: number,
): { unitPrice: number; wholesale: boolean } {
  if (qtyBase % unit.unitSize === 0) {
    const count = qtyBase / unit.unitSize;
    let best: { minQty: number; price: number } | undefined;
    for (const tier of unit.wholesaleTiers) {
      if (tier.minQty <= count && (!best || tier.minQty > best.minQty)) {
        best = tier;
      }
    }
    if (best) return { unitPrice: best.price, wholesale: true };
  }
  return { unitPrice: unit.price, wholesale: false };
}

export function priceLine(
  unit: PricedUnit,
  input: { qtyBase: number } | { amount: number },
): PricedLine {
  if ("amount" in input) {
    assertPositiveSafeInt(input.amount, "amount");
    return {
      qtyBase: qtyBaseFromAmount(input.amount, unit.price, unit.unitSize),
      unitPrice: unit.price,
      subtotal: input.amount,
      wholesale: false,
    };
  }
  assertPositiveSafeInt(input.qtyBase, "qtyBase");
  const { unitPrice, wholesale } = unitPriceFor(unit, input.qtyBase);
  return {
    qtyBase: input.qtyBase,
    unitPrice,
    subtotal: lineSubtotal(unitPrice, input.qtyBase, unit.unitSize),
    wholesale,
  };
}

export function cartTotal(subtotals: readonly number[]): number {
  let total = 0;
  for (const s of subtotals) {
    total += s;
    if (!Number.isSafeInteger(total)) {
      throw new RangeError("Total keranjang di luar rentang aman");
    }
  }
  return total;
}
