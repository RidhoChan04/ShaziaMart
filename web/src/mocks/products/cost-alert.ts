import type {
  PriceSource,
  ProductCost,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import type { MockCostAlert, MockProduct, MockState } from "../db";

/**
 * Rasio HPP sama (amount/qtyBase), bukan bentuk penulisannya. Perkalian silang bisa melewati
 * 2^53 (amount & qtyBase masing-masing bilangan bulat aman) → dibandingkan dengan BigInt.
 */
export function sameCost(
  a: ProductCost | null,
  b: ProductCost | null,
): boolean {
  if (a === null || b === null) return a === b;
  const left = a.amount * b.qtyBase;
  const right = b.amount * a.qtyBase;
  if (Number.isSafeInteger(left) && Number.isSafeInteger(right)) {
    return left === right;
  }
  return (
    BigInt(a.amount) * BigInt(b.qtyBase) ===
    BigInt(b.amount) * BigInt(a.qtyBase)
  );
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

/**
 * Butir modal untuk HPP `prev.cost` → `next` (pemanggil memastikan rasio berubah): kembali ke
 * `fromCost` atau HPP dihapus → butir hilang; butir lama → waktu & sumber diperbarui; belum ada
 * → butir baru dari HPP lama (barang tanpa HPP lama tidak membuat butir).
 */
export function noteCostChange(
  state: MockState,
  prev: MockProduct,
  next: ProductCost | null,
  source: PriceSource,
  now: number,
): void {
  const alert = state.costAlerts[prev.id];
  if (next === null || (alert && sameCost(alert.fromCost, next))) {
    delete state.costAlerts[prev.id];
  } else if (alert) {
    alert.changedAt = now;
    alert.source = source;
  } else if (prev.cost !== null) {
    state.costAlerts[prev.id] = { fromCost: prev.cost, changedAt: now, source };
  }
}
