import { expect, test } from "vitest";
import {
  DEFAULT_ATTENTION_RULES,
  isCashDiffEvent,
  isLargeExpense,
  isSmallShortage,
  longShiftAt,
  shiftExpenseCrossing,
} from "./attention-rules";
import { HOUR_MS } from "./business-day";

const r = DEFAULT_ATTENTION_RULES;

test("ambang bawaan (S2/S3/S6)", () => {
  expect(DEFAULT_ATTENTION_RULES).toEqual({
    cashDiffMin: 5_000,
    smallShortageWeekMax: 20_000,
    expenseSingleMax: 50_000,
    expenseShiftMax: 150_000,
    shiftMaxHours: 12,
    qrisDailyReconcile: true,
  });
});

test("kas keluar besar: lebih dari Rp50.000 (ketat), tepat 50.000 bukan", () => {
  expect(isLargeExpense(50_000, r)).toBe(false);
  expect(isLargeExpense(50_001, r)).toBe(true);
  expect(isLargeExpense(1, { ...r, expenseSingleMax: 0 })).toBe(true);
});

test("total kas keluar satu shift: jam kas keluar yang pertama membuat Σ > 150.000", () => {
  const two = [
    { at: 1, amount: 100_000 },
    { at: 2, amount: 50_000 },
  ];
  expect(shiftExpenseCrossing(two, r)).toBeNull();
  expect(shiftExpenseCrossing([...two, { at: 3, amount: 1 }], r)).toBe(3);
  expect(shiftExpenseCrossing([], r)).toBeNull();
  // Urut jam, bukan urutan masukan; kas keluar sesudah lewat tidak menggeser jamnya.
  expect(
    shiftExpenseCrossing(
      [
        { at: 9, amount: 40_000 },
        { at: 3, amount: 100_000 },
        { at: 5, amount: 60_000 },
      ],
      r,
    ),
  ).toBe(5);
});

test("selisih kas: |selisih| ≥ Rp5.000 adalah kejadian; −4.999 bukan", () => {
  expect(isCashDiffEvent(-4_999, r)).toBe(false);
  expect(isCashDiffEvent(-5_000, r)).toBe(true);
  expect(isCashDiffEvent(5_000, r)).toBe(true);
  expect(isCashDiffEvent(4_999, r)).toBe(false);
  expect(isCashDiffEvent(0, r)).toBe(false);
  expect(isCashDiffEvent(0, { ...r, cashDiffMin: 0 })).toBe(false);
});

test("selisih kecil: kurang di bawah ambang (−5.000 < d < 0); lebih tidak dihitung", () => {
  expect(isSmallShortage(-4_999, r)).toBe(true);
  expect(isSmallShortage(-1, r)).toBe(true);
  expect(isSmallShortage(0, r)).toBe(false);
  expect(isSmallShortage(-5_000, r)).toBe(false);
  expect(isSmallShortage(3_000, r)).toBe(false);
});

test("shift kelamaan: lebih dari 12 jam (ketat); jam kejadian = buka + 12 jam", () => {
  expect(longShiftAt(0, 12 * HOUR_MS, r)).toBeNull();
  expect(longShiftAt(0, 12 * HOUR_MS + 1, r)).toBe(12 * HOUR_MS);
  const opened = Date.UTC(2026, 10, 18, 6);
  expect(longShiftAt(opened, opened + 13 * HOUR_MS, r)).toBe(
    opened + 12 * HOUR_MS,
  );
  expect(
    longShiftAt(opened, opened + 11 * HOUR_MS, { ...r, shiftMaxHours: 10 }),
  ).toBe(opened + 10 * HOUR_MS);
});
