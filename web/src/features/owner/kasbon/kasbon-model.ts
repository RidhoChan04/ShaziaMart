import type {
  CreditAge,
  OwnerCustomerRow,
} from "@/shared/api/gen/shaziaMartAPI.schemas";

/** Label kelompok umur kasbon (urutan tampil mengikuti `ages` dari server). */
export const AGE_LABEL: Record<CreditAge, string> = {
  hari_0_7: "0–7 hari",
  hari_8_30: "8–30 hari",
  lebih_30_hari: "Lebih dari 30 hari",
};

const digits = (s: string) => s.replace(/\D/g, "");

/**
 * Daftar yang ditampilkan: tanpa pencarian hanya saldo ≠ 0 (pelanggan lunas disembunyikan);
 * dengan pencarian cocok nama atau nomor HP (angka saja, jadi `0812-34` cocok dengan `081234…`).
 * Urutan tetap dari server; uang tidak dihitung di sini.
 */
export function visibleCustomers(
  rows: readonly OwnerCustomerRow[],
  query: string,
): OwnerCustomerRow[] {
  const q = query.trim().toLowerCase();
  if (!q) return rows.filter((r) => r.balance !== 0);
  const qDigits = digits(q);
  return rows.filter(
    (r) =>
      r.name.toLowerCase().includes(q) ||
      r.phone.includes(q) ||
      (qDigits !== "" && digits(r.phone).includes(qDigits)),
  );
}
