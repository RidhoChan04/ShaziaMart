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

/** Waktu kasbon tertua yang belum lunas; pelunasan memakan kasbon terlama dulu (FIFO). */
export function oldestUnpaidAt(
  state: Readonly<Ledger>,
  customerId: string,
): number | null {
  const entries = entriesOf(state, customerId);
  let paid = entries.reduce((sum, e) => sum - Math.min(e.amount, 0), 0);
  const debts = entries.filter((e) => e.amount > 0).sort((a, b) => a.at - b.at);
  for (const debt of debts) {
    if (debt.amount > paid) return debt.at;
    paid -= debt.amount;
  }
  return null;
}
