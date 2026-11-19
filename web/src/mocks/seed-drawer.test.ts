import { describe, expect, test } from "vitest";
import {
  addIsoDays,
  businessDay,
  DAY_MS,
  HOUR_MS,
  jakartaIsoDate,
} from "@/shared/lib/business-day";
import type { MockClosedShift, MockState } from "./db";
import { HISTORY_DAYS } from "./history";
import { createSeedState } from "./seed-data";
import { SEED_OPENING_CASH } from "./seed-drawer";

/** Kamis 19 Nov 2026 15.20 WIB. */
const NOW = Date.UTC(2026, 10, 19, 8, 20);
const state = createSeedState(NOW);
const reviewedAt = NOW - 2 * DAY_MS;
const byClose = [...state.closedShifts].sort((a, b) => a.closedAt - b.closedAt);

/** Saran modal (K8) dari state: uang fisik shift tutup terakhir − setoran sela yang belum terpakai. */
function suggestion(s: Readonly<MockState>): number | null {
  const last = [...s.closedShifts].sort((a, b) => b.closedAt - a.closedAt)[0];
  if (!last) return null;
  const takes = s.cashTakes
    .filter(
      (t) =>
        t.shiftId === null &&
        t.consumedByShiftId === null &&
        t.cancelledAt === null,
    )
    .reduce((sum, t) => sum + t.amount, 0);
  return Math.max(0, last.countedCash - takes);
}

const expensesOf = (c: MockClosedShift) =>
  state.drawerExpenses.filter((e) => e.shiftId === c.shiftId);

describe("(K17) setoran pemilik di sela shift riwayat", () => {
  test(`saran modal seed = Rp200.000 dan setiap shift riwayat punya setoran, untuk ${HISTORY_DAYS} hari bisnis berturut-turut (seluruh rentang riwayat)`, () => {
    for (let i = 0; i < HISTORY_DAYS; i++) {
      // createSeedState melempar bila satu shift tutup dengan uang fisik ≤ modal (setoran hilang).
      const s = createSeedState(NOW + i * DAY_MS);
      expect(suggestion(s)).toBe(SEED_OPENING_CASH);
      const closed = [...s.closedShifts].sort(
        (a, b) => a.closedAt - b.closedAt,
      );
      expect(s.cashTakes.filter((t) => t.shiftId === null)).toHaveLength(
        closed.length,
      );
      for (const c of closed.slice(1)) {
        expect(c.suggestedOpening).toBe(SEED_OPENING_CASH);
      }
    }
  }, 60_000);

  test("setiap shift tutup diikuti setoran countedCash − 200.000; terpakai shift berikutnya, yang terakhir belum", () => {
    const handover = state.cashTakes.filter((t) => t.shiftId === null);
    expect(handover).toHaveLength(byClose.length);
    byClose.forEach((c, i) => {
      const take = handover[i];
      expect(take).toMatchObject({
        at: c.closedAt,
        amount: c.countedCash - SEED_OPENING_CASH,
        note: "Setoran harian",
        createdByName: "Pak Ahmad",
        consumedByShiftId: byClose[i + 1]?.shiftId ?? null,
        cancelledAt: null,
      });
      // Setoran tercatat setelah shift tutup dan sebelum (paling lambat bersamaan) shift berikutnya buka.
      const next = byClose[i + 1];
      if (next) expect(take?.at).toBeLessThanOrEqual(next.openedAt);
    });
    // Tidak ada dua shift yang buka bersamaan.
    byClose.slice(1).forEach((c, i) => {
      expect(c.openedAt).toBeGreaterThanOrEqual(byClose[i]?.closedAt ?? 0);
    });
  });

  test("modal shift = saran (uang fisik sebelumnya − setoran), kecuali contoh serah terima; shift pertama tanpa saran", () => {
    expect(byClose[0]).toMatchObject({
      suggestedOpening: null,
      openingNote: null,
      openingCash: SEED_OPENING_CASH,
    });
    const different = byClose.filter(
      (c) =>
        c.suggestedOpening !== null && c.openingCash !== c.suggestedOpening,
    );
    expect(different).toHaveLength(1);
    for (const c of byClose.slice(1)) {
      expect(c.suggestedOpening).toBe(SEED_OPENING_CASH);
      if (c.openingNote === null) expect(c.openingCash).toBe(SEED_OPENING_CASH);
    }
    // Semua shift tutup menyimpan kasirId (K18).
    const ids = Object.fromEntries(state.users.map((u) => [u.name, u.id]));
    for (const c of byClose) expect(c.kasirId).toBe(ids[c.kasirName]);
  });
});

describe("(K20) contoh Perlu perhatian di 2 hari terakhir, setelah penanda tinjau seed", () => {
  test("serah terima: Rina kemarin modal Rp190.000 dari saran Rp200.000 dengan alasan", () => {
    const noted = byClose.filter((c) => c.openingNote !== null);
    expect(noted).toHaveLength(1);
    expect(noted[0]).toMatchObject({
      kasirName: "Rina",
      openingNote: "Salah hitung kemarin",
      suggestedOpening: 200_000,
      openingCash: 190_000,
    });
    expect(noted[0]?.openedAt).toBeGreaterThan(reviewedAt);
  });

  test("kas keluar besar Rp75.000 dan satu shift Σ Rp160.000 (4 × Rp40.000)", () => {
    const big = state.drawerExpenses.filter((e) => e.amount > 50_000);
    expect(big.map((e) => [e.amount, e.createdByName])).toEqual([
      [75_000, "Rina"],
    ]);
    expect(big[0]?.at).toBeGreaterThan(reviewedAt);
    const heavy = byClose.filter(
      (c) => expensesOf(c).reduce((sum, e) => sum + e.amount, 0) > 150_000,
    );
    expect(heavy).toHaveLength(1);
    const items = heavy[0] ? expensesOf(heavy[0]) : [];
    expect(items.map((e) => e.amount)).toEqual([
      40_000, 40_000, 40_000, 40_000,
    ]);
    expect(heavy[0]?.kasirName).toBe("Budi");
    expect(items[3]?.at).toBeGreaterThan(reviewedAt);
    // Kas keluar kecil di shift lain tidak membuat kejadian.
    for (const c of byClose) {
      for (const e of expensesOf(c)) {
        expect(e.at).toBeGreaterThan(c.openedAt);
        expect(e.at).toBeLessThan(c.closedAt);
        expect(e.reason.length).toBeGreaterThan(0);
        expect(e.cancelledAt).toBeNull();
      }
      expect(c.expenses).toBe(
        expensesOf(c).reduce((sum, e) => sum + e.amount, 0),
      );
    }
    expect(
      byClose.filter((c) => c.expenses > 0 && c.expenses <= 40_000).length,
    ).toBeGreaterThan(5);
  });

  test("shift kelamaan: satu shift Budi 13 jam, jam kejadian (buka + 12 jam) setelah penanda", () => {
    const long = byClose.filter((c) => c.closedAt - c.openedAt > 12 * HOUR_MS);
    expect(long).toHaveLength(1);
    expect(long[0]?.kasirName).toBe("Budi");
    expect((long[0]?.closedAt ?? 0) - (long[0]?.openedAt ?? 0)).toBe(
      13 * HOUR_MS,
    );
    expect((long[0]?.openedAt ?? 0) + 12 * HOUR_MS).toBeGreaterThan(reviewedAt);
  });

  test("selisih kecil Rina: 6 shift × −4.000 dalam 7 hari (Σ 24.000); tanpa penanda tinjau per kasir", () => {
    const small = byClose.filter(
      (c) => c.difference < 0 && c.difference > -5_000,
    );
    expect(small.map((c) => [c.kasirName, c.difference])).toEqual(
      Array.from({ length: 6 }, () => ["Rina", -4_000]),
    );
    for (const c of small) expect(c.closedAt).toBeGreaterThan(NOW - 7 * DAY_MS);
    expect(state.smallShortageReviews).toEqual({});
  });

  test("satu pengambilan pemilik di dalam shift yang sudah tutup masuk ownerTakes shift itu", () => {
    const inShift = state.cashTakes.filter((t) => t.shiftId !== null);
    expect(inShift).toHaveLength(1);
    const shift = byClose.find((c) => c.shiftId === inShift[0]?.shiftId);
    expect(shift?.ownerTakes).toBe(inShift[0]?.amount);
    expect(inShift[0]?.consumedByShiftId).toBeNull();
    expect(inShift[0]?.at).toBeGreaterThan(shift?.openedAt ?? Infinity);
    expect(inShift[0]?.at).toBeLessThan(shift?.closedAt ?? -Infinity);
    expect(
      byClose.filter((c) => c.ownerTakes > 0).map((c) => c.shiftId),
    ).toEqual([shift?.shiftId]);
  });
});

describe("(K11) QRIS harian seed", () => {
  test("mulai 3 hari sebelum hari seed; hari ber-QRIS sebelumnya ditandai cocok dengan total saat ditandai", () => {
    const today = businessDay(NOW).date;
    expect(state.qrisSince).toBe(addIsoDays(today, -3));
    const totals = new Map<string, number>();
    for (const sale of state.sales) {
      const qris = sale.payments
        .filter((p) => p.method === "qris")
        .reduce((sum, p) => sum + p.amount, 0);
      if (qris > 0) {
        const date = jakartaIsoDate(sale.createdAt);
        totals.set(date, (totals.get(date) ?? 0) + qris);
      }
    }
    const before = [...totals].filter(([d]) => d < state.qrisSince);
    expect(Object.keys(state.qrisDays).sort()).toEqual(
      before.map(([d]) => d).sort(),
    );
    for (const [date, total] of before) {
      expect(state.qrisDays[date]).toMatchObject({
        date,
        status: "cocok",
        note: null,
        markedByName: "Pak Ahmad",
        markedTotal: total,
      });
      expect(state.qrisDays[date]?.markedAt).toBeLessThan(NOW);
    }
    // Tiga hari terakhir sebelum hari ini ber-QRIS dan belum dicocokkan.
    for (let back = 1; back <= 3; back++) {
      const date = addIsoDays(today, -back);
      expect(totals.get(date) ?? 0).toBeGreaterThan(0);
      expect(state.qrisDays[date]).toBeUndefined();
    }
  });

  test("pengaturan bawaan F3c-2a", () => {
    expect(state.attentionRules).toEqual({
      cashDiffMin: 5_000,
      smallShortageWeekMax: 20_000,
      expenseSingleMax: 50_000,
      expenseShiftMax: 150_000,
      shiftMaxHours: 12,
      qrisDailyReconcile: true,
    });
    expect(state.defaultCreditLimit).toBe(500_000);
    expect(state.settings.ownerPhone).toBe("0812-3456-7890");
    expect(state.storeProfile).toEqual({
      address: "Jl. Kenanga No. 8, Sukamaju",
      receiptFooter: "Terima kasih, selamat belanja kembali",
    });
    expect(state.users.map((u) => [u.name, u.active])).toEqual([
      ["Rina", true],
      ["Budi", true],
      ["Pak Ahmad", true],
    ]);
  });
});
