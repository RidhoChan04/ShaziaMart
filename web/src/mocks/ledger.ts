import type { CreditEntry, MockState } from "./db";
import { KIND, makeId } from "./seed";

type Ledger = Pick<MockState, "creditLedger">;

const entriesOf = (state: Readonly<Ledger>, customerId: string) =>
  state.creditLedger.filter((e) => e.customerId === customerId);

export function balanceOf(state: Readonly<Ledger>, customerId: string): number {
  return entriesOf(state, customerId).reduce((sum, e) => sum + e.amount, 0);
}

/**
 * Satu-satunya jalan mengubah saldo kasbon: catat entri lalu samakan `customer.balance`.
 * ID dari urutan entri (buku append-only), agar seed tetap deterministik.
 */
export function appendCredit(
  state: Pick<MockState, "creditLedger" | "customers">,
  entry: Omit<CreditEntry, "id">,
): void {
  const id = makeId(KIND.credit, state.creditLedger.length + 1);
  state.creditLedger.push({ id, ...entry });
  const customer = state.customers.find((c) => c.id === entry.customerId);
  if (customer) customer.balance = balanceOf(state, entry.customerId);
}

/**
 * Waktu kasbon tertua yang belum lunas (FIFO, R6). Batal (entri negatif ber-saleId) membatalkan
 * kasbon penjualannya sendiri; pelunasan (saleId null) memakan utang terlama dulu. Entri positif
 * ber-paymentId adalah pembalik batal pelunasan: mengurangi yang sudah dibayar, bukan kasbon baru,
 * sehingga umur lama kembali. Lebih bayar (saldo minus) memotong kasbon berikutnya dulu (Q8).
 */
export function oldestUnpaidAt(
  state: Readonly<Ledger>,
  customerId: string,
): number | null {
  const entries = entriesOf(state, customerId);
  const debts = entries
    .filter((e) => e.amount > 0 && e.paymentId === null)
    .map((e) => ({ at: e.at, saleId: e.saleId, left: e.amount }))
    .sort((a, b) => a.at - b.at);
  let paid = 0;
  for (const e of entries) {
    if (e.amount >= 0) {
      if (e.paymentId !== null) paid -= e.amount;
      continue;
    }
    let rest = -e.amount;
    for (const debt of debts) {
      if (e.saleId === null || debt.saleId !== e.saleId) continue;
      const take = Math.min(debt.left, rest);
      debt.left -= take;
      rest -= take;
    }
    paid += rest;
  }
  for (const debt of debts) {
    if (debt.left > paid) return debt.at;
    paid -= debt.left;
  }
  return null;
}
