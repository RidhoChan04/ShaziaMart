import { roundHalfUp } from "./quantity";

/**
 * Margin dalam permil bertanda (jawaban pemilik Q5, K18): tanda(laba) × round_half_up(|laba| ×
 * 1000 / harga); `null` bila harga/omzet ≤ 0. Satu-satunya aturan margin: server palsu memakainya
 * untuk total & bucket laporan penjualan serta untung tipis; app hanya menampilkan hasilnya.
 */
export function marginPermille(revenue: number, profit: number): number | null {
  if (revenue <= 0) return null;
  const permille = roundHalfUp(Math.abs(profit) * 1000, revenue);
  return profit < 0 ? -permille : permille;
}

/** Permil bertanda → persen satu desimal: `164` → `16,4%`, `-21` → `−2,1%` (U+2212), `0` → `0,0%`. */
export function formatPermille(permille: number): string {
  const abs = Math.abs(permille);
  return `${permille < 0 ? "−" : ""}${Math.floor(abs / 10)},${abs % 10}%`;
}
