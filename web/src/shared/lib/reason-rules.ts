/** Panjang maksimal alasan (batal transaksi, batal pelunasan, kasbon lewat limit) — kasir & server palsu. */
export const REASON_MAX = 200;

/** Alasan setelah trim bila 1..REASON_MAX karakter; selain itu (bukan string, kosong, kepanjangan) null. */
export function cleanReason(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  return trimmed.length >= 1 && trimmed.length <= REASON_MAX ? trimmed : null;
}
