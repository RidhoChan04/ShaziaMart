import type { ProductCost } from "@/shared/api/gen/shaziaMartAPI.schemas";
import type { MockCostAlert, MockProduct, MockState } from "../db";

/** Rasio HPP sama (amount/qtyBase), bukan bentuk penulisannya. */
export function sameCost(
  a: ProductCost | null,
  b: ProductCost | null,
): boolean {
  if (a === null || b === null) return a === b;
  return a.amount * b.qtyBase === b.amount * a.qtyBase;
}

/**
 * C12: butir modal tampil bila HPP sekarang (rasio persis) berbeda dari `fromCost`,
 * walau modal eceran terbulatkan sama. Satu aturan untuk Beranda dan detail barang.
 */
export function meaningfulCostAlert(
  state: Readonly<MockState>,
  p: MockProduct,
): MockCostAlert | null {
  const alert = state.costAlerts[p.id];
  if (alert === undefined || p.cost === null) return null;
  return sameCost(alert.fromCost, p.cost) ? null : alert;
}
