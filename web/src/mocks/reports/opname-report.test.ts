import { describe, expect, test } from "vitest";
import type { MockState } from "../db";
import { opnameProductReport, opnameReport } from "./opname-report";
import {
  addCount,
  BIMOLI,
  blankState,
  INDOMIE,
  KOPI,
  NOW,
  productNamed,
  wib,
} from "./report-fixtures";
import { applySampleOpname, KECAP, ROKOK } from "./sample-opname";

const NOV = { from: "2026-11-01", to: "2026-11-05" };

function sampleState(): MockState {
  const s = blankState();
  applySampleOpname(s, NOW);
  return s;
}

describe("opnameReport (K19) dengan applySampleOpname", () => {
  test("kartu: Kurang = Σ nilai kurang, Lebih = Σ nilai lebih, jumlah barang berbeda", () => {
    const report = opnameReport(sampleState(), NOV);
    expect(report).toMatchObject({
      range: NOV,
      lossValue: 294_000,
      lossCount: 1,
      gainValue: 38_000,
      gainCount: 1,
      unknownValueCount: 0,
    });
    expect(report.items.map((i) => i.productName)).toEqual([ROKOK, KECAP]);
  });

  test("Rokok: 4 hitungan, kurang 3 berurutan → repeated; −14 bks; nilai kurang −294.000", () => {
    const s = sampleState();
    const rokok = opnameReport(s, NOV).items[0];
    expect(rokok).toEqual({
      productId: productNamed(s, ROKOK).id,
      productName: ROKOK,
      unitName: "bks",
      unitSize: 1,
      isCurah: false,
      countTotal: 4,
      shortCount: 3,
      overCount: 0,
      repeated: true,
      shortQtyBase: 14,
      overQtyBase: 0,
      lossValue: 294_000,
      gainValue: 0,
    });
    const kecap = opnameReport(s, NOV).items[1];
    expect(kecap).toMatchObject({
      countTotal: 1,
      overCount: 1,
      overQtyBase: 2,
      repeated: false,
      lossValue: 0,
      gainValue: 38_000,
    });
  });

  test("rentang tanpa hitungan → kosong; hitungan 1 Nov tidak ikut rentang 2–5 Nov", () => {
    const s = sampleState();
    const empty = opnameReport(s, { from: "2026-10-01", to: "2026-10-27" });
    expect(empty).toEqual({
      range: { from: "2026-10-01", to: "2026-10-27" },
      lossValue: 0,
      lossCount: 0,
      gainValue: 0,
      gainCount: 0,
      unknownValueCount: 0,
      items: [],
    });
    const late = opnameReport(s, { from: "2026-11-02", to: "2026-11-05" });
    expect(late.items[0]).toMatchObject({ countTotal: 3, shortCount: 3 });
  });

  test("detail: hitungan terbaru dulu, pencatat & pembanding sebelumnya; stok awal sebelum rentang = patokan", () => {
    const s = sampleState();
    const detail = opnameProductReport(s, productNamed(s, ROKOK).id, NOV);
    expect(detail).not.toBeNull();
    expect(
      detail?.counts.map((c) => [
        c.countedAt,
        c.counterName,
        c.diffQtyBase,
        c.value,
        c.state,
        c.reason,
        c.previousCountedAt,
      ]),
    ).toEqual([
      [
        wib("2026-11-04", 10, 5),
        "Rina",
        -6,
        126_000,
        "disetujui",
        "hilang",
        wib("2026-11-03", 16, 20),
      ],
      [
        wib("2026-11-03", 16, 20),
        "Budi",
        -5,
        105_000,
        "disetujui",
        "tidak_diketahui",
        wib("2026-11-02", 9, 15),
      ],
      [
        wib("2026-11-02", 9, 15),
        "Rina",
        -3,
        63_000,
        "disesuaikan",
        "tidak_diketahui",
        wib("2026-11-01", 8, 50),
      ],
      [
        wib("2026-11-01", 8, 50),
        "Budi",
        0,
        0,
        "cocok",
        null,
        wib("2026-10-28", 8, 30),
      ],
    ]);
    expect(detail?.range).toEqual(NOV);
  });
});

describe("opnameReport (K19) aturan hitungan final", () => {
  test("ditahan, menunggu_alasan, diganti tidak ikut; dihitung_ulang memakai recount; stok_awal hanya patokan", () => {
    const s = blankState([KOPI, BIMOLI, INDOMIE]);
    productNamed(s, KOPI).cost = { amount: 3_000, qtyBase: 1 };
    const kopi = productNamed(s, KOPI).id;
    addCount(s, {
      session: "S0",
      product: KOPI,
      at: wib("2026-10-30", 8),
      diff: 50,
      state: "stok_awal",
    });
    addCount(s, {
      session: "S1",
      product: KOPI,
      at: wib("2026-11-02", 8),
      diff: -2,
      state: "ditahan",
    });
    addCount(s, {
      session: "S2",
      product: KOPI,
      at: wib("2026-11-02", 9),
      diff: -3,
      state: "menunggu_alasan",
    });
    addCount(s, {
      session: "S3",
      product: KOPI,
      at: wib("2026-11-02", 10),
      diff: -4,
      state: "diganti",
    });
    addCount(s, {
      session: "S4",
      product: KOPI,
      at: wib("2026-11-03", 8),
      diff: -40,
      state: "dihitung_ulang",
      recount: { at: wib("2026-11-03", 15), diff: -1, by: "Pak Ahmad" },
    });
    addCount(s, {
      session: "S5",
      product: BIMOLI,
      at: wib("2026-11-03", 9),
      diff: 4,
      state: "stok_awal",
    });
    addCount(s, {
      session: "S6",
      product: INDOMIE,
      at: wib("2026-11-04", 9),
      diff: 0,
    });
    const report = opnameReport(s, NOV);
    expect(report.items.map((i) => [i.productName, i.countTotal])).toEqual([
      [KOPI, 1],
    ]);
    expect(report.items[0]).toMatchObject({
      shortQtyBase: 1,
      lossValue: 3_000,
      repeated: false,
    });
    const detail = opnameProductReport(s, kopi, NOV);
    expect(detail?.counts).toEqual([
      expect.objectContaining({
        sessionId: "S4",
        countedAt: wib("2026-11-03", 15),
        counterName: "Pak Ahmad",
        diffQtyBase: -1,
        value: 3_000,
        state: "dihitung_ulang",
        previousCountedAt: wib("2026-10-30", 8),
      }),
    ]);
    // Barang tanpa selisih tetap punya detail (cocok); stok_awal saja → 404.
    expect(
      opnameReport(s, NOV).items.some((i) => i.productName === INDOMIE),
    ).toBe(false);
    expect(
      opnameProductReport(s, productNamed(s, INDOMIE).id, NOV)?.countTotal,
    ).toBe(1);
    expect(opnameProductReport(s, productNamed(s, BIMOLI).id, NOV)).toBeNull();
    expect(opnameProductReport(s, "tidak-ada", NOV)).toBeNull();
  });

  test("hitungan tanpa HPP: lossValue null tidak dijumlah, unknownValueCount +1", () => {
    const s = blankState([KOPI, BIMOLI]);
    productNamed(s, KOPI).cost = { amount: 3_000, qtyBase: 1 };
    addCount(s, {
      session: "A",
      product: KOPI,
      at: wib("2026-11-02", 8),
      diff: -2,
    });
    addCount(s, {
      session: "A",
      product: BIMOLI,
      at: wib("2026-11-02", 8),
      diff: -1,
      value: null,
    });
    addCount(s, {
      session: "B",
      product: KOPI,
      at: wib("2026-11-03", 8),
      diff: -1,
      value: null,
    });
    addCount(s, {
      session: "B",
      product: BIMOLI,
      at: wib("2026-11-03", 8),
      diff: 2,
      value: null,
    });
    const report = opnameReport(s, NOV);
    expect(report).toMatchObject({
      lossValue: 6_000,
      lossCount: 2,
      gainValue: 0,
      gainCount: 1,
      unknownValueCount: 3,
    });
    expect(
      report.items.map((i) => [
        i.productName,
        i.lossValue,
        i.gainValue,
        i.repeated,
      ]),
    ).toEqual([
      // Kopi: satu dari dua hitungan kurang ber-HPP; tetap berulang.
      [KOPI, 6_000, 0, true],
      // Bimoli: semua hitungan tanpa HPP → null, di belakang.
      [BIMOLI, null, null, false],
    ]);
  });

  test("urut kerugian terbesar, seri → keuntungan terbesar, lalu nama", () => {
    const s = blankState([KOPI, BIMOLI, INDOMIE]);
    for (const name of [KOPI, BIMOLI, INDOMIE]) {
      productNamed(s, name).cost = { amount: 1_000, qtyBase: 1 };
    }
    addCount(s, {
      session: "A",
      product: KOPI,
      at: wib("2026-11-02", 8),
      diff: 3,
    });
    addCount(s, {
      session: "A",
      product: BIMOLI,
      at: wib("2026-11-02", 8),
      diff: 1,
    });
    addCount(s, {
      session: "A",
      product: INDOMIE,
      at: wib("2026-11-02", 8),
      diff: -1,
    });
    expect(opnameReport(s, NOV).items.map((i) => i.productName)).toEqual([
      INDOMIE,
      KOPI,
      BIMOLI,
    ]);
  });
});
