import { formatAngka } from "../../../shared/lib/money";
import { cartTotal, priceLine } from "../../../shared/lib/pricing";
import { formatGram } from "../../../shared/lib/quantity";
import type { CartLine } from "./cart-store";

export interface CartLineView {
  no: number;
  qtyLabel: string;
  priceLabel: string;
  unitPrice: number;
  subtotal: number;
  wholesale: boolean;
}

function priced(line: CartLine) {
  const unit = {
    price: line.listPrice,
    unitSize: line.unitSize,
    wholesaleTiers: line.wholesaleTiers,
  };
  // Baris nominal: subtotal tetap sebesar nominal yang dimasukkan.
  return priceLine(
    unit,
    line.amount === null ? { qtyBase: line.qtyBase } : { amount: line.amount },
  );
}

export function cartLineView(line: CartLine, index: number): CartLineView {
  const p = priced(line);
  if (line.isCurah) {
    const unit = line.baseUnit === "ml" ? "L" : "kg";
    return {
      no: index + 1,
      // Baris nominal: jumlah dari harga terkini, sama dengan yang dicatat server.
      qtyLabel: formatGram(p.qtyBase, unit),
      priceLabel: `${formatAngka(line.listPrice)}/${line.unitName}`,
      unitPrice: p.unitPrice,
      subtotal: p.subtotal,
      wholesale: p.wholesale,
    };
  }
  return {
    no: index + 1,
    qtyLabel: `${line.qtyBase / line.unitSize} ${line.unitName}`,
    priceLabel: formatAngka(p.unitPrice),
    unitPrice: p.unitPrice,
    subtotal: p.subtotal,
    wholesale: p.wholesale,
  };
}

export function cartSummary(lines: readonly CartLine[]): {
  itemCount: number;
  total: number;
} {
  return {
    itemCount: lines.length,
    total: cartTotal(lines.map((l, i) => cartLineView(l, i).subtotal)),
  };
}
