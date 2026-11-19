/** Pembantu khusus tes; jangan diimpor dari kode produksi. */
import type { MockState } from "./db";

/**
 * (K20) Seed sengaja memuat contoh kejadian F3c-2a terbaru (kas keluar besar, shift kelamaan, serah
 * terima, selisih kecil berulang, selisih acak) agar Beranda contoh tidak kosong. Tes yang hanya
 * memeriksa butir yang dibuatnya sendiri menandai contoh itu sudah ditinjau pada `at` (jenis
 * F3c-1 tidak disentuh), sehingga kejadian sesudah `at` tetap muncul seperti biasa.
 */
export function reviewSeedSamples(s: MockState, at: number): void {
  for (const kind of [
    "batal_kas_keluar",
    "selisih_kas",
    "kas_keluar",
    "serah_terima",
    "shift_lama",
  ] as const) {
    s.exceptionReviews[kind] = at;
  }
  for (const u of s.users) s.smallShortageReviews[u.id] = at;
}
