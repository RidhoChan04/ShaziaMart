import type { AttentionRules } from "../api/gen/shaziaMartAPI.schemas";
import { HOUR_MS } from "./business-day";

/**
 * Aturan murni Perlu perhatian (S2, S3, S6, K7), dipakai server palsu dan app (pratinjau,
 * pita kasir) agar ambang tidak ditulis dua kali. Semua ambang dibandingkan ketat dan dibaca dari
 * Pengaturan saat ini, bukan salinan saat kejadian.
 */
export const DEFAULT_ATTENTION_RULES: AttentionRules = {
  cashDiffMin: 5_000,
  smallShortageWeekMax: 20_000,
  expenseSingleMax: 50_000,
  expenseShiftMax: 150_000,
  shiftMaxHours: 12,
  // (M-2a) Pencocokan QRIS harian aktif; false = butir QRIS belum dicocokkan tidak pernah muncul.
  qrisDailyReconcile: true,
};

/** Selisih tutup shift yang menjadi kejadian `selisih_kas`: |d| ≥ cashDiffMin (0 tidak pernah). */
export const isCashDiffEvent = (
  difference: number,
  r: AttentionRules,
): boolean => difference !== 0 && Math.abs(difference) >= r.cashDiffMin;

/** Selisih kurang di bawah ambang (−cashDiffMin < d < 0); selisih lebih tidak dihitung. */
export const isSmallShortage = (
  difference: number,
  r: AttentionRules,
): boolean => difference < 0 && difference > -r.cashDiffMin;

/** Satu kas keluar yang menjadi kejadian `kas_keluar`: amount > expenseSingleMax. */
export const isLargeExpense = (amount: number, r: AttentionRules): boolean =>
  amount > r.expenseSingleMax;

/**
 * Jam kas keluar yang pertama membuat Σ kas keluar satu shift > expenseShiftMax (urut jam), null
 * bila tidak pernah. Pemanggil hanya memasukkan kas keluar yang tidak dibatalkan.
 */
export function shiftExpenseCrossing(
  amounts: readonly { at: number; amount: number }[],
  r: AttentionRules,
): number | null {
  let sum = 0;
  for (const e of [...amounts].sort((a, b) => a.at - b.at)) {
    sum += e.amount;
    if (sum > r.expenseShiftMax) return e.at;
  }
  return null;
}

/** Shift kelamaan (K5): `openedAt + shiftMaxHours` bila endAt − openedAt > shiftMaxHours jam. */
export function longShiftAt(
  openedAt: number,
  endAt: number,
  r: AttentionRules,
): number | null {
  const max = r.shiftMaxHours * HOUR_MS;
  return endAt - openedAt > max ? openedAt + max : null;
}
