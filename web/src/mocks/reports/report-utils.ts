import { addIsoDays } from "@/shared/lib/business-day";
import { roundHalfUp } from "@/shared/lib/quantity";
import type { IsoRange } from "@/shared/lib/report-period";

/** Urut nama (abjad Indonesia), dipakai semua laporan. */
export const byName = (a: string, b: string): number =>
  a.localeCompare(b, "id");

/** Negatif bila hanya `b` null: nilai null selalu di belakang. */
export const nullsLast = (a: unknown, b: unknown): number =>
  (a === null ? 1 : 0) - (b === null ? 1 : 0);

/**
 * Margin dalam permil bertanda: tanda(laba) × round_half_up(|laba| × 1000 / harga); null bila
 * harga/omzet ≤ 0 (jawaban pemilik Q5, K18). Dipakai laporan penjualan dan untung tipis.
 */
export function marginPermille(revenue: number, profit: number): number | null {
  if (revenue <= 0) return null;
  const permille = roundHalfUp(Math.abs(profit) * 1000, revenue);
  return profit < 0 ? -permille : permille;
}

/** 00.00 Asia/Jakarta tanggal `iso` (UTC ms). */
export const dayStart = (iso: string): number =>
  Date.parse(`${iso}T00:00:00+07:00`);

/** Jendela waktu setengah terbuka [start, end). */
export type Window = { start: number; end: number };

/** Rentang tanggal WIB (kedua ujung ikut) sebagai jendela jam. */
export const windowOf = (range: IsoRange): Window => ({
  start: dayStart(range.from),
  end: dayStart(addIsoDays(range.to, 1)),
});
