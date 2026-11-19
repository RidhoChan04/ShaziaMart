import { describe, expect, test } from "vitest";
import {
  type MockCashTake,
  type MockClosedShift,
  type MockDrawerExpense,
  type MockShift,
  type MockState,
  mockDb,
} from "../db";
import {
  cancellableTake,
  drawerTotals,
  openingSuggestion,
  shiftExpensesTotal,
  shiftOwnerTakesTotal,
} from "./drawer";

const OPEN = "sh-open";

const openShift = (patch: Partial<MockShift> = {}): MockShift => ({
  id: OPEN,
  kasirId: "u-rina",
  kasirName: "Rina",
  openedAt: 1_000,
  openingCash: 200_000,
  suggestedOpening: 200_000,
  openingNote: null,
  cashSales: 150_000,
  salesCount: 3,
  cashOuts: [
    { id: "c1", at: 1, amount: 50_000, receiptId: "r1", kind: "bayar" },
  ],
  creditCash: [
    { id: "k1", at: 1, amount: 75_000, paymentId: "p1", kind: "pelunasan" },
  ],
  saleRefunds: [{ id: "f1", at: 1, amount: 30_000, saleId: "s1" }],
  ...patch,
});

const expense = (patch: Partial<MockDrawerExpense>): MockDrawerExpense => ({
  id: "e",
  at: 2_000,
  amount: 10_000,
  reason: "Beli es batu",
  shiftId: OPEN,
  createdById: "u-rina",
  createdByName: "Rina",
  cancelledAt: null,
  cancelledById: null,
  cancelledByName: null,
  cancelledChannel: null,
  cancelReason: null,
  ...patch,
});

const take = (patch: Partial<MockCashTake>): MockCashTake => ({
  id: "t",
  at: 3_000,
  amount: 100_000,
  note: null,
  shiftId: OPEN,
  createdById: "u-owner",
  createdByName: "Pak Ahmad",
  consumedByShiftId: null,
  cancelledAt: null,
  cancelledById: null,
  cancelledByName: null,
  cancelReason: null,
  ...patch,
});

const closed = (patch: Partial<MockClosedShift>): MockClosedShift => ({
  shiftId: "sh-old",
  kasirId: "u-budi",
  kasirName: "Budi",
  openedAt: 0,
  closedAt: 500,
  openingCash: 0,
  cashSales: 0,
  supplierPayments: 0,
  creditPayments: 0,
  saleRefunds: 0,
  expenses: 0,
  ownerTakes: 0,
  expectedCash: 300_000,
  countedCash: 300_000,
  difference: 0,
  salesCount: 0,
  suggestedOpening: null,
  openingNote: null,
  ...patch,
});

/** State seed dengan laci kosong, ditimpa `patch`. */
function stateWith(patch: Partial<MockState>): MockState {
  const s = mockDb.get() as MockState;
  s.shift = null;
  s.closedShifts = [];
  s.drawerExpenses = [];
  s.cashTakes = [];
  Object.assign(s, patch);
  return s;
}

describe("drawerTotals (satu rumus laci)", () => {
  test("expectedCash = modal + tunai − supplier + pelunasan − pengembalian − kas keluar − diambil pemilik", () => {
    const shift = openShift();
    const state = stateWith({
      shift,
      drawerExpenses: [
        expense({ id: "e1", amount: 10_000 }),
        expense({ id: "e2", amount: 5_000 }),
        // Dibatalkan dan milik shift lain tidak ikut.
        expense({ id: "e3", amount: 7_000, cancelledAt: 2_500 }),
        expense({ id: "e4", amount: 9_000, shiftId: "sh-old" }),
      ],
      cashTakes: [
        take({ id: "t1", amount: 100_000 }),
        take({ id: "t2", amount: 40_000, cancelledAt: 3_500 }),
        take({ id: "t3", amount: 60_000, shiftId: null }),
        take({ id: "t4", amount: 20_000, shiftId: "sh-old" }),
      ],
    });
    expect(drawerTotals(state, shift)).toEqual({
      openingCash: 200_000,
      cashSales: 150_000,
      supplierPayments: 50_000,
      creditPayments: 75_000,
      saleRefunds: 30_000,
      expenses: 15_000,
      ownerTakes: 100_000,
      expectedCash: 230_000,
    });
    expect(shiftExpensesTotal(state, OPEN)).toBe(15_000);
    expect(shiftOwnerTakesTotal(state, OPEN)).toBe(100_000);
    expect(shiftExpensesTotal(state, "sh-old")).toBe(9_000);
    expect(shiftOwnerTakesTotal(state, "sh-old")).toBe(20_000);
  });

  test("tanpa kas keluar dan ambil uang → rumus F3c-1", () => {
    const shift = openShift();
    expect(drawerTotals(stateWith({ shift }), shift)).toMatchObject({
      expenses: 0,
      ownerTakes: 0,
      expectedCash: 345_000,
    });
  });
});

describe("openingSuggestion (K8, K22)", () => {
  test("tanpa shift tutup sebelumnya → saran null dan ownerTakes 0 (walau ada pengambilan sela)", () => {
    const state = stateWith({
      cashTakes: [take({ shiftId: null, amount: 50_000 })],
    });
    expect(openingSuggestion(state)).toEqual({
      suggestedCash: null,
      lastKasirName: null,
      lastClosedAt: null,
      lastCountedCash: null,
      ownerTakes: 0,
    });
  });

  test("shift tutup terakhir menurut closedAt − pengambilan sela aktif yang belum terpakai", () => {
    const state = stateWith({
      closedShifts: [
        closed({ closedAt: 500, countedCash: 300_000, kasirName: "Budi" }),
        closed({ closedAt: 400, countedCash: 999_000, kasirName: "Rina" }),
      ],
      cashTakes: [
        take({ id: "t1", shiftId: null, amount: 50_000 }),
        take({
          id: "t2",
          shiftId: null,
          amount: 20_000,
          consumedByShiftId: "x",
        }),
        take({ id: "t3", shiftId: null, amount: 30_000, cancelledAt: 9 }),
        take({ id: "t4", shiftId: "sh-old", amount: 40_000 }),
      ],
    });
    expect(openingSuggestion(state)).toEqual({
      suggestedCash: 250_000,
      lastKasirName: "Budi",
      lastClosedAt: 500,
      lastCountedCash: 300_000,
      ownerTakes: 50_000,
    });
  });

  test("pengambilan melebihi uang fisik → saran dijepit 0", () => {
    const state = stateWith({
      closedShifts: [closed({ countedCash: 300_000 })],
      cashTakes: [take({ shiftId: null, amount: 400_000 })],
    });
    expect(openingSuggestion(state)).toMatchObject({
      suggestedCash: 0,
      ownerTakes: 400_000,
    });
  });

  test("saran seed = Rp200.000 (setoran harian K17)", () => {
    expect(openingSuggestion(mockDb.get()).suggestedCash).toBe(200_000);
  });
});

describe("cancellableTake (K9)", () => {
  const state = () => stateWith({ shift: openShift() });

  test("di shift yang masih buka → bisa; shift tempatnya sudah tutup → terkunci", () => {
    expect(cancellableTake(state(), take({ shiftId: OPEN }))).toBe(true);
    expect(cancellableTake(state(), take({ shiftId: "sh-old" }))).toBe(false);
    expect(cancellableTake(stateWith({}), take({ shiftId: OPEN }))).toBe(false);
  });

  test("di sela shift: belum terpakai → bisa; sudah terpakai modal shift berikutnya → terkunci", () => {
    expect(cancellableTake(state(), take({ shiftId: null }))).toBe(true);
    expect(
      cancellableTake(
        state(),
        take({ shiftId: null, consumedByShiftId: OPEN }),
      ),
    ).toBe(false);
  });

  test("sudah dibatalkan → tidak bisa dibatalkan lagi", () => {
    expect(cancellableTake(state(), take({ cancelledAt: 9 }))).toBe(false);
    expect(
      cancellableTake(state(), take({ shiftId: null, cancelledAt: 9 })),
    ).toBe(false);
  });
});
