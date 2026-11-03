import type {
  DebtPayment,
  ReceiptPayment,
} from "../api/gen/shaziaMartAPI.schemas";
import { formatIsoDate } from "./business-day";

/** Label cara bayar & sumber uang barang masuk — satu sumber untuk app orang toko, pemilik, dan server palsu. */
export const PAYMENT_METHOD_LABEL = {
  tunai: "Tunai",
  transfer: "Transfer",
} as const;

export const CASH_SOURCE_LABEL = {
  laci: "Dari laci kasir",
  pemilik: "Uang pemilik",
} as const;

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
    return `Bayar nanti · jatuh tempo ${due}`;
  }
  const method = p.method ?? "tunai";
  return `Bayar sekarang · ${paidSummary({ method, cashSource: p.cashSource })}`;
}
