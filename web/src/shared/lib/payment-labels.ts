import type {
  DebtPayment,
  ReceiptPayment,
} from "../api/gen/shaziaMartAPI.schemas";
import { formatIsoDate } from "./business-day";
import { formatRupiah } from "./money";

/** Label cara bayar & sumber uang barang masuk — satu sumber untuk app orang toko, pemilik, dan server palsu. */
export const PAYMENT_METHOD_LABEL = {
  tunai: "Tunai",
  transfer: "Transfer",
} as const;

export const PAYMENT_TIMING_LABEL = {
  sekarang: "Bayar sekarang",
  nanti: "Bayar nanti",
} as const;

export const CASH_SOURCE_LABEL = {
  laci: "Dari laci kasir",
  pemilik: "Uang pemilik",
} as const;

/** Keterangan di bawah "Dari laci kasir" yang nonaktif (R24). */
export const NO_SHIFT_NOTE = "Tidak ada shift buka";

/** "Tunai · Dari laci kasir" | "Tunai · Uang pemilik" | "Transfer". */
export function paidSummary(
  p: Pick<DebtPayment, "method" | "cashSource">,
): string {
  if (p.method === "transfer") return PAYMENT_METHOD_LABEL.transfer;
  const source = CASH_SOURCE_LABEL[p.cashSource ?? "pemilik"];
  return `${PAYMENT_METHOD_LABEL.tunai} · ${source}`;
}

/** "Bayar sekarang · Tunai · Dari laci kasir" | "Bayar sekarang · Transfer" | "Bayar nanti · jatuh tempo 16 Nov 2026". */
export function paymentSummary(p: ReceiptPayment): string {
  if (p.timing === "nanti") {
    const due = p.dueDate === null ? "—" : formatIsoDate(p.dueDate);
    return `${PAYMENT_TIMING_LABEL.nanti} · jatuh tempo ${due}`;
  }
  const method = p.method ?? "tunai";
  return `${PAYMENT_TIMING_LABEL.sekarang} · ${paidSummary({ method, cashSource: p.cashSource })}`;
}

/** Uang laci yang dipakai nota: total bila dibayar (sekarang atau lunas) tunai dari laci, selain itu 0. */
export function laciPaidOf(r: {
  payment: ReceiptPayment;
  paid: DebtPayment | null;
  total: number;
}): number {
  const { payment: p, paid } = r;
  const fromLaci =
    (p.timing === "sekarang" &&
      p.method === "tunai" &&
      p.cashSource === "laci") ||
    (paid !== null && paid.method === "tunai" && paid.cashSource === "laci");
  return fromLaci ? r.total : 0;
}

/** Keterangan konfirmasi batal nota; menyebut uang laci yang kembali (termasuk nota yang sudah dilunasi dari laci) bila ada. */
export function cancelNoteText(laci: number): string {
  const base = "Stok, HPP, dan utang nota ini dibalik. Tidak bisa diurungkan.";
  if (laci <= 0) return `${base} Tidak ada uang laci yang berubah.`;
  return `${base} Uang ${formatRupiah(laci)} yang tadi keluar dari laci dicatat masuk lagi ke shift kasir yang sedang berjalan. Kalau tidak ada shift berjalan, uang ini tidak dicatat ulang — sesuaikan uang laci sendiri.`;
}
