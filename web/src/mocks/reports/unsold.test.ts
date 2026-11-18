import { describe, expect, test } from "vitest";
import type { MockState } from "../db";
import {
  BERAS5,
  BIMOLI,
  blankState,
  GULA,
  INDOMIE,
  KOPI,
  NOW,
  productNamed,
  soldAt,
  wib,
} from "./report-fixtures";
import { unsoldReport } from "./unsold";

/** Stok positif pertama barang `name` pada jam `at` (barang masuk). */
function stockedAt(s: MockState, name: string, at: number, qtyBase = 10) {
  const p = productNamed(s, name);
  s.stockEntries.push({
    id: `se-${s.stockEntries.length + 1}`,
    productId: p.id,
    at,
    effectiveAt: at,
    qtyBase,
    actorName: "Rina",
    kind: "masuk",
    receiptId: null,
    lineId: null,
    opnameId: null,
    reason: null,
  });
}

const namesOf = (s: MockState, sort: "modal" | "lama" = "modal") =>
  unsoldReport(s, NOW, sort).items.map((i) => i.productName);

describe("unsoldReport (K17, P8)", () => {
  test("terakhir terjual 4 Okt → 32 hari, tampil; 7 Okt → 29 hari, tidak", () => {
    const s = blankState([INDOMIE, BIMOLI]);
    soldAt(s, INDOMIE, wib("2026-09-20", 9));
    soldAt(s, INDOMIE, wib("2026-10-04", 23, 30));
    soldAt(s, BIMOLI, wib("2026-10-07", 0, 5));
    const report = unsoldReport(s, NOW, "modal");
    expect(report.minDays).toBe(30);
    expect(report.items).toHaveLength(1);
    expect(report.items[0]).toMatchObject({
      productName: INDOMIE,
      lastSoldAt: wib("2026-10-04", 23, 30),
      sinceDate: "2026-10-04",
      days: 32,
    });
  });

  test("tidak pernah terjual, stok pertama 1 Okt → 'belum terjual' 35 hari; pernah terjual 25 Sep → patokan penjualan walau stok pertama 20 Okt", () => {
    const s = blankState([INDOMIE, BIMOLI, KOPI]);
    // Entri negatif (koreksi) lebih dulu bukan stok pertama.
    const p = productNamed(s, INDOMIE);
    // Stok sekarang = dua kiriman: sebelum 1 Okt stok 0 → barang baru sejak 1 Okt.
    s.stock[p.id] = 20;
    s.stockEntries.push({
      id: "se-neg",
      productId: p.id,
      at: wib("2026-09-01", 8),
      effectiveAt: wib("2026-09-01", 8),
      qtyBase: -5,
      actorName: "Rina",
      kind: "batal_masuk",
      receiptId: null,
      lineId: null,
      opnameId: null,
      reason: null,
    });
    stockedAt(s, INDOMIE, wib("2026-10-01", 8));
    stockedAt(s, INDOMIE, wib("2026-10-25", 8));
    stockedAt(s, BIMOLI, wib("2026-10-20", 8));
    // (ruling pengendali) Pernah terjual → tidak pernah "baru"; patokan = penjualan terakhir.
    soldAt(s, BIMOLI, wib("2026-09-25", 8));
    // KOPI tanpa entri stok → patokan awal katalog.
    const report = unsoldReport(s, NOW, "modal");
    const byName = new Map(report.items.map((i) => [i.productName, i]));
    expect(byName.get(INDOMIE)).toMatchObject({
      lastSoldAt: null,
      sinceDate: "2026-10-01",
      days: 35,
    });
    expect(byName.get(BIMOLI)).toMatchObject({
      lastSoldAt: wib("2026-09-25", 8),
      sinceDate: "2026-09-25",
      days: 41,
    });
    expect(byName.get(KOPI)).toMatchObject({
      lastSoldAt: null,
      sinceDate: "2026-09-03",
      days: 63,
    });
  });

  test("barang seed baru diisi ulang 1 Nov, terakhir terjual 50 hari lalu → ikut (50 hari)", () => {
    const s = blankState([KOPI]);
    stockedAt(s, KOPI, wib("2026-11-01", 8));
    soldAt(s, KOPI, wib("2026-09-16", 9));
    expect(
      unsoldReport(s, NOW, "modal").items.map((i) => [i.productName, i.days]),
    ).toEqual([[KOPI, 50]]);
  });

  test("barang seed belum pernah terjual, diisi ulang 1 Nov: stok sudah ada sebelumnya → patokan awal katalog", () => {
    const s = blankState([KOPI]);
    stockedAt(s, KOPI, wib("2026-11-01", 8));
    expect(unsoldReport(s, NOW, "modal").items[0]).toMatchObject({
      productName: KOPI,
      lastSoldAt: null,
      sinceDate: "2026-09-03",
      days: 63,
    });
  });

  test("barang baru (stok pertama 10 hari lalu, sebelumnya stok 0), belum pernah terjual → tidak ikut", () => {
    const s = blankState([KOPI]);
    s.stock[productNamed(s, KOPI).id] = 10;
    stockedAt(s, KOPI, wib("2026-10-26", 8), 10);
    expect(unsoldReport(s, NOW, "modal").items).toEqual([]);
  });

  test.each(["nonaktif", "menunggu_harga"] as const)(
    "status %s tidak ikut",
    (status) => {
      const s = blankState([INDOMIE, BIMOLI]);
      productNamed(s, BIMOLI).status = status;
      expect(namesOf(s)).toEqual([INDOMIE]);
    },
  );

  test("tidak_diambil tetap ikut (masih dijual sampai habis)", () => {
    const s = blankState([INDOMIE]);
    productNamed(s, INDOMIE).status = "tidak_diambil";
    expect(namesOf(s)).toEqual([INDOMIE]);
  });

  test("stok 0 dan stok −3 tidak ikut; penjualan dibatalkan tidak dihitung sebagai terjual", () => {
    const s = blankState([INDOMIE, BIMOLI, KOPI]);
    s.stock[productNamed(s, BIMOLI).id] = 0;
    s.stock[productNamed(s, KOPI).id] = -3;
    soldAt(s, INDOMIE, wib("2026-10-04", 9));
    soldAt(s, INDOMIE, wib("2026-11-04", 9), "dibatalkan");
    const report = unsoldReport(s, NOW, "modal");
    expect(report.items.map((i) => [i.productName, i.days])).toEqual([
      [INDOMIE, 32],
    ]);
  });

  test("heldValue = unitCost(HPP, stok): HPP {104000, 40}, stok 18 → 46.800; tanpa HPP → null, noCostCount +1, tidak dijumlah", () => {
    const s = blankState([INDOMIE, BIMOLI, GULA]);
    s.stock[productNamed(s, INDOMIE).id] = 18;
    productNamed(s, BIMOLI).cost = null;
    s.stock[productNamed(s, GULA).id] = 2500;
    const report = unsoldReport(s, NOW, "modal");
    const byName = new Map(report.items.map((i) => [i.productName, i]));
    expect(byName.get(INDOMIE)).toMatchObject({
      stockQtyBase: 18,
      heldValue: 46_800,
      unitName: "pcs",
      unitSize: 1,
      isCurah: false,
    });
    expect(byName.get(BIMOLI)?.heldValue).toBeNull();
    // Gula {16500 / 1000 g}, 2.500 g → 41.250; satuan eceran kg.
    expect(byName.get(GULA)).toMatchObject({
      heldValue: 41_250,
      unitName: "kg",
      unitSize: 1000,
      isCurah: true,
    });
    expect(report).toMatchObject({
      count: 3,
      heldValue: 46_800 + 41_250,
      noCostCount: 1,
    });
  });

  test("urut modal: heldValue terbesar, null terakhir; urut lama: hari terbanyak, seri → heldValue, lalu nama", () => {
    const s = blankState([INDOMIE, BIMOLI, BERAS5, KOPI]);
    s.stock[productNamed(s, INDOMIE).id] = 18; // 46.800
    s.stock[productNamed(s, BERAS5).id] = 1; // 71.000
    productNamed(s, KOPI).cost = null;
    productNamed(s, BIMOLI).cost = { amount: 30_000, qtyBase: 1 };
    s.stock[productNamed(s, BIMOLI).id] = 1; // 30.000
    soldAt(s, BERAS5, wib("2026-10-01", 9)); // 35 hari
    soldAt(s, BIMOLI, wib("2026-10-01", 15)); // 35 hari
    // INDOMIE & KOPI belum terjual: 63 hari.
    expect(namesOf(s, "modal")).toEqual([BERAS5, INDOMIE, BIMOLI, KOPI]);
    expect(namesOf(s, "lama")).toEqual([INDOMIE, KOPI, BERAS5, BIMOLI]);
  });
});
