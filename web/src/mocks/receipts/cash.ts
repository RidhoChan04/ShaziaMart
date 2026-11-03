import { newId } from "@/shared/lib/id";
import { laciPaidOf } from "@/shared/lib/payment-labels";
import type { MockCashOut, MockReceipt, MockShift, MockState } from "../db";
import { receiptTotalOf } from "./views";

/** Uang laci yang dipakai nota — aturan bersama `laciPaidOf` (app pemilik memakai yang sama). */
export const laciPaid = (r: MockReceipt): number =>
  laciPaidOf({ payment: r.payment, paid: r.paid, total: receiptTotalOf(r) });

/**
 * Uang keluar laci (`amount` > 0 keluar, < 0 kembali ke laci) di shift yang sedang buka.
 * Tanpa shift buka → false (tidak dicatat); `amount` 0 → tidak ditulis.
 */
export function addCashOut(
  state: MockState,
  amount: number,
  receiptId: string,
  kind: MockCashOut["kind"],
  now: number,
): boolean {
  if (state.shift === null) return false;
  if (amount !== 0) {
    state.shift.cashOuts.push({
      id: newId(now),
      at: now,
      amount,
      receiptId,
      kind,
    });
  }
  return true;
}

export const supplierPaymentsOf = (shift: MockShift): number =>
  shift.cashOuts.reduce((sum, c) => sum + c.amount, 0);
