import type { OwnerProduct } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { markup, suggestedPrice, unitCost } from "@/shared/lib/product-rules";
import { type PriceLineView, priceLines } from "../price-lines";

export type CostLine = PriceLineView & {
  oldCost: number;
  newCost: number;
  profitBefore: number;
  profitAfter: number;
  percentBefore: number | null;
  percentAfter: number | null;
  /** Null bila modal baris tidak berubah (setelah pembulatan) atau modal lama 0. */
  suggested: number | null;
};

/** Satu blok per baris harga (eceran, grosir, satuan besar aktif); kosong tanpa peringatan atau tanpa modal sekarang. */
export function costLines(p: OwnerProduct): CostLine[] {
  const alert = p.costAlert;
  // Barang menunggu harga jual tidak punya harga yang bisa disarankan; harganya hanya diisi lewat form (R20).
  if (alert === null || p.cost === null || p.status === "menunggu_harga")
    return [];
  const lines: CostLine[] = [];
  for (const line of priceLines(p)) {
    const oldCost = unitCost(alert.fromCost, line.unitSize);
    const newCost = unitCost(p.cost, line.unitSize);
    if (oldCost === null || newCost === null) continue;
    lines.push({
      ...line,
      oldCost,
      newCost,
      profitBefore: line.price - oldCost,
      profitAfter: line.price - newCost,
      percentBefore: markup(line.price, oldCost)?.percent ?? null,
      percentAfter: markup(line.price, newCost)?.percent ?? null,
      suggested:
        oldCost === newCost
          ? null
          : suggestedPrice(line.price, oldCost, newCost),
    });
  }
  return lines;
}

/** Arah modal eceran; dari rasio HPP persis, jadi tetap benar saat modal eceran terbulatkan sama. */
export function costDirection(p: OwnerProduct): "naik" | "turun" {
  const from = p.costAlert?.fromCost;
  const to = p.cost;
  if (!from || !to) return "naik";
  return to.amount * from.qtyBase < from.amount * to.qtyBase ? "turun" : "naik";
}
