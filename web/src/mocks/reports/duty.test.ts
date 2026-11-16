import { describe, expect, test } from "vitest";
import type { MockState } from "../db";
import { dutyBetween } from "./duty";
import { opnameProductReport } from "./opname-report";
import {
  addClosedShift,
  addCount,
  addExpiry,
  addReceipt,
  BIMOLI,
  blankState,
  KOPI,
  productNamed,
  wib,
} from "./report-fixtures";

const FROM = wib("2026-11-02", 10);
const TO = wib("2026-11-03", 10);

function state(): MockState {
  const s = blankState([KOPI, BIMOLI]);
  productNamed(s, KOPI).cost = { amount: 3_000, qtyBase: 1 };
  return s;
}
const kopi = (s: MockState) => productNamed(s, KOPI).id;

describe("dutyBetween (K20, P11)", () => {
  test("shift yang tumpang dengan jeda (closedShifts + shift buka) dihitung; shift di luar jeda tidak", () => {
    const s = state();
    addClosedShift(s, "Rina", wib("2026-11-02", 6), wib("2026-11-02", 13, 5)); // memuat awal jeda
    addClosedShift(s, "Budi", wib("2026-11-02", 13), wib("2026-11-02", 21, 5));
    addClosedShift(s, "Rina", wib("2026-11-03", 6), wib("2026-11-03", 13, 5)); // memuat akhir jeda
    addClosedShift(s, "Budi", wib("2026-11-01", 13), wib("2026-11-01", 21, 5)); // sebelum
    addClosedShift(s, "Rina", wib("2026-11-02", 6), wib("2026-11-02", 10)); // tutup tepat di awal jeda
    addClosedShift(s, "Budi", wib("2026-11-03", 10, 1), wib("2026-11-03", 21)); // sesudah
    expect(dutyBetween(s, kopi(s), FROM, TO, "S")).toEqual([
      { name: "Budi", shifts: 1, records: 0 },
      { name: "Rina", shifts: 2, records: 0 },
    ]);
    s.shift = {
      id: "open",
      kasirId: "u-x",
      kasirName: "Sari",
      openedAt: wib("2026-11-03", 9),
      openingCash: 0,
      cashSales: 0,
      salesCount: 0,
      cashOuts: [],
      creditCash: [],
      saleRefunds: [],
    };
    expect(dutyBetween(s, kopi(s), FROM, TO, "S")).toContainEqual({
      name: "Sari",
      shifts: 1,
      records: 0,
    });
    s.shift.openedAt = wib("2026-11-03", 10, 30);
    expect(
      dutyBetween(s, kopi(s), FROM, TO, "S").map((d) => d.name),
    ).not.toContain("Sari");
  });

  test("orang toko: nota barang masuk berisi barang itu, keluarkan kedaluwarsa, sesi opname lain → records; sesi hitungan ini sendiri tidak", () => {
    const s = state();
    const inside = wib("2026-11-02", 15);
    addReceipt(s, { id: "n1", by: "Dedi", at: inside, product: KOPI });
    addReceipt(s, { id: "n2", by: "Dedi", at: inside, product: BIMOLI }); // barang lain
    addReceipt(s, {
      id: "n3",
      by: "Dedi",
      at: inside,
      product: KOPI,
      status: "dibatalkan",
    });
    addReceipt(s, {
      id: "n4",
      by: "Dedi",
      at: wib("2026-11-01", 15),
      product: KOPI,
    }); // di luar
    addExpiry(s, { by: "Dedi", at: inside, product: KOPI });
    addExpiry(s, { by: "Dedi", at: inside, product: KOPI, kind: "ubah_ed" });
    addCount(s, {
      session: "lain",
      by: "Dedi",
      product: KOPI,
      at: inside,
      diff: 0,
    });
    addCount(s, {
      session: "lain-barang",
      by: "Dedi",
      product: BIMOLI,
      at: inside,
      diff: 0,
    });
    // Hitungan ini sendiri (sesi S) dan hitungan sebelumnya (tepat di awal jeda) tidak dihitung.
    addCount(s, { session: "S", by: "Dedi", product: KOPI, at: TO, diff: -1 });
    addCount(s, {
      session: "awal",
      by: "Dedi",
      product: KOPI,
      at: FROM,
      diff: 0,
    });
    // Pemilik bukan orang toko.
    addReceipt(s, { id: "n5", by: "Pak Ahmad", at: inside, product: KOPI });
    expect(dutyBetween(s, kopi(s), FROM, TO, "S")).toEqual([
      { name: "Dedi", shifts: 0, records: 3 },
    ]);
  });

  test("Rina kasir sekaligus pencatat → satu entri {Rina, shifts, records}; daftar urut nama (Dedi sebelum Rina)", () => {
    const s = state();
    addClosedShift(s, "Rina", wib("2026-11-02", 13), wib("2026-11-02", 21));
    addReceipt(s, {
      id: "n1",
      by: "Rina",
      at: wib("2026-11-02", 14),
      product: KOPI,
    });
    addReceipt(s, {
      id: "n2",
      by: "Dedi",
      at: wib("2026-11-02", 14),
      product: KOPI,
    });
    expect(dutyBetween(s, kopi(s), FROM, TO, "S")).toEqual([
      { name: "Dedi", shifts: 0, records: 1 },
      { name: "Rina", shifts: 1, records: 1 },
    ]);
  });
});

describe("opnameProductReport — bertugas per hitungan", () => {
  test("jeda mulai dari hitungan sebelum periode; hitungan pertama → previousCountedAt null, duty []", () => {
    const s = state();
    addCount(s, {
      session: "awal",
      product: KOPI,
      at: wib("2026-10-30", 8),
      diff: 5,
    });
    addCount(s, {
      session: "S1",
      product: KOPI,
      at: wib("2026-11-02", 8),
      diff: -1,
    });
    addClosedShift(s, "Rina", wib("2026-10-31", 6), wib("2026-10-31", 13));
    const range = { from: "2026-11-01", to: "2026-11-05" };
    const detail = opnameProductReport(s, kopi(s), range);
    expect(detail?.counts).toEqual([
      expect.objectContaining({
        sessionId: "S1",
        previousCountedAt: wib("2026-10-30", 8),
        duty: [{ name: "Rina", shifts: 1, records: 0 }],
      }),
    ]);
    const first = opnameProductReport(s, kopi(s), {
      from: "2026-10-30",
      to: "2026-10-30",
    });
    expect(first?.counts).toEqual([
      expect.objectContaining({
        sessionId: "awal",
        previousCountedAt: null,
        duty: [],
      }),
    ]);
  });

  test("dutyOnShort: Rina 3 dari 3, Dedi 1 dari 3, urut nama", () => {
    const s = state();
    const day = (d: number) => `2026-11-0${d}`;
    // Hitungan 1–4 Nov pukul 08.00: cocok lalu tiga kali kurang; Rina shift tiap hari.
    addCount(s, { session: "S1", product: KOPI, at: wib(day(1), 8), diff: 0 });
    for (const d of [2, 3, 4]) {
      addCount(s, {
        session: `S${d}`,
        product: KOPI,
        at: wib(day(d), 8),
        diff: -1,
      });
    }
    for (const d of [1, 2, 3]) {
      addClosedShift(s, "Rina", wib(day(d), 13), wib(day(d), 21));
    }
    addExpiry(s, { by: "Dedi", at: wib(day(3), 12), product: KOPI });
    const detail = opnameProductReport(s, kopi(s), {
      from: "2026-11-01",
      to: "2026-11-05",
    });
    expect(detail?.shortCount).toBe(3);
    expect(detail?.dutyOnShort).toEqual([
      { name: "Dedi", intervals: 1 },
      { name: "Rina", intervals: 3 },
    ]);
  });
});
