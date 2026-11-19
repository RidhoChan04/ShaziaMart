import type { OpeningSuggestion } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { creditPaymentsOf } from "../credit/payments";
import type { MockCashTake, MockShift, MockState } from "../db";
import { supplierPaymentsOf } from "../receipts/cash";

/**
 * Satu-satunya rumus laci (shift buka & tutup; tutup shift kasir dan rincian shift pemilik):
 * `expectedCash = openingCash + cashSales − supplierPayments + creditPayments − saleRefunds −
 * expenses − ownerTakes`.
 */
export type DrawerTotals = {
  openingCash: number;
  cashSales: number;
  supplierPayments: number;
  creditPayments: number;
  saleRefunds: number;
  expenses: number;
  ownerTakes: number;
  expectedCash: number;
};

const isActive = (x: { cancelledAt: number | null }): boolean =>
  x.cancelledAt === null;

const sumAmount = (rows: readonly { amount: number }[]): number =>
  rows.reduce((sum, r) => sum + r.amount, 0);

/** Σ kas keluar shift `shiftId` yang tidak dibatalkan (`ShiftClosure.expenses`). */
export const shiftExpensesTotal = (
  state: Readonly<MockState>,
  shiftId: string,
): number =>
  sumAmount(
    state.drawerExpenses.filter((e) => e.shiftId === shiftId && isActive(e)),
  );

/** Σ ambil uang pemilik di dalam shift `shiftId` yang tidak dibatalkan (`ShiftClosure.ownerTakes`). */
export const shiftOwnerTakesTotal = (
  state: Readonly<MockState>,
  shiftId: string,
): number =>
  sumAmount(
    state.cashTakes.filter((t) => t.shiftId === shiftId && isActive(t)),
  );

/** Pengambilan di sela shift (`shiftId` null) yang belum dibatalkan dan belum terpakai shift berikutnya. */
export const pendingBetweenTakes = (
  state: Readonly<MockState>,
): MockCashTake[] =>
  state.cashTakes.filter(
    (t) => t.shiftId === null && t.consumedByShiftId === null && isActive(t),
  );

/** Angka laci shift yang sedang buka (rumus tunggal). */
export function drawerTotals(
  state: Readonly<MockState>,
  shift: MockShift,
): DrawerTotals {
  // Uang keluar laci ke supplier (barang masuk, koreksi nota, pelunasan) mengurangi kas seharusnya.
  const supplierPayments = supplierPaymentsOf(shift);
  // Hanya pelunasan kasbon Tunai shift ini (bukan uang diterima) yang masuk laci.
  const creditPayments = creditPaymentsOf(shift);
  // (ruling R12) Tunai yang keluar laci untuk transaksi yang dibatalkan kasir di shift ini.
  const saleRefunds = sumAmount(shift.saleRefunds);
  const expenses = shiftExpensesTotal(state, shift.id);
  const ownerTakes = shiftOwnerTakesTotal(state, shift.id);
  return {
    openingCash: shift.openingCash,
    cashSales: shift.cashSales,
    supplierPayments,
    creditPayments,
    saleRefunds,
    expenses,
    ownerTakes,
    expectedCash:
      shift.openingCash +
      shift.cashSales -
      supplierPayments +
      creditPayments -
      saleRefunds -
      expenses -
      ownerTakes,
  };
}

/**
 * (S4, K8, K22) Saran modal: uang fisik shift tutup terakhir (closedAt terbaru) − Σ pengambilan
 * sela yang masih aktif, dijepit ≥ 0. Tanpa shift tutup sebelumnya → tanpa saran.
 */
export function openingSuggestion(
  state: Readonly<MockState>,
): OpeningSuggestion {
  let last: MockState["closedShifts"][number] | null = null;
  for (const c of state.closedShifts) {
    if (last === null || c.closedAt >= last.closedAt) last = c;
  }
  if (last === null) {
    return {
      suggestedCash: null,
      lastKasirName: null,
      lastClosedAt: null,
      lastCountedCash: null,
      ownerTakes: 0,
    };
  }
  const ownerTakes = sumAmount(pendingBetweenTakes(state));
  return {
    suggestedCash: Math.max(0, last.countedCash - ownerTakes),
    lastKasirName: last.kasirName,
    lastClosedAt: last.closedAt,
    lastCountedCash: last.countedCash,
    ownerTakes,
  };
}

/**
 * (K9) Pengambilan masih bisa dibatalkan: belum dibatalkan dan efeknya masih bisa dibalik — di
 * dalam shift yang masih buka, atau di sela shift dan belum terpakai modal shift berikutnya.
 */
export function cancellableTake(
  state: Readonly<MockState>,
  take: MockCashTake,
): boolean {
  if (!isActive(take)) return false;
  return take.shiftId === null
    ? take.consumedByShiftId === null
    : state.shift?.id === take.shiftId;
}
