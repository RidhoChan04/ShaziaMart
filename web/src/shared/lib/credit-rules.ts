import type {
  CreditAge,
  CreditPaymentMethod,
} from "../api/gen/shaziaMartAPI.schemas";
import { DAY_MS } from "./business-day";
import { formatRupiah } from "./money";

export const CREDIT_METHOD_LABEL: Record<CreditPaymentMethod, string> = {
  tunai: "Tunai",
  qris: "QRIS",
  transfer: "Transfer",
  titip: "Tunai ke pemilik",
};

/**
 * Umur kasbon belum lunas tertua dalam hari penuh, dibulatkan ke atas (K6):
 * `ageDays > 30` ⇔ `now − oldest > 30 × DAY_MS`, sama dengan aturan Beranda.
 */
export function creditAgeDays(
  oldestUnpaidAt: number | null,
  now: number,
): number | null {
  if (oldestUnpaidAt === null) return null;
  return Math.ceil((now - oldestUnpaidAt) / DAY_MS);
}

export function creditAge(ageDays: number | null): CreditAge | null {
  if (ageDays === null) return null;
  if (ageDays > 30) return "lebih_30_hari";
  if (ageDays >= 8) return "hari_8_30";
  return "hari_0_7";
}

/** Galat jumlah pelunasan (urutan: saldo ≤ 0, < 1, > saldo); null bila boleh. */
export function repaymentProblem(
  amount: number | null,
  balance: number,
): string | null {
  if (balance <= 0) return "Pelanggan ini tidak punya kasbon";
  if (amount === null || amount < 1) return "Jumlah minimal Rp1";
  if (amount > balance) return `Melebihi sisa kasbon ${formatRupiah(balance)}`;
  return null;
}
