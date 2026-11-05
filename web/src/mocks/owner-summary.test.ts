import { describe, expect, test } from "vitest";
import type {
  ProductStatus,
  StockAlert,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { businessDay, DAY_MS, HOUR_MS } from "@/shared/lib/business-day";
import type {
  MockOpnameItem,
  MockOpnameSession,
  MockSale,
  MockState,
} from "./db";
import { ownerTodaySummary } from "./owner-summary";
import { stockAlertOf, toOwnerProduct } from "./products/views";
import { formatSaleNumber } from "./sale-number";
import { createSeedState } from "./seed-data";
import { applySampleStock } from "./stock/sample";

/** Jumat 23 Okt 2026 14.30 WIB. */
const NOW = Date.UTC(2026, 9, 23, 7, 30);
const TODAY = businessDay(NOW).start;
const LAST_WEEK = TODAY - 7 * DAY_MS;

let n = 0;
function addSale(
  s: MockState,
  at: number,
  total: number,
  o: Partial<MockSale> & { credit?: number } = {},
): void {
  n += 1;
  const { credit = 0, ...rest } = o;
  s.sales.push({
    id: `t-${n}`,
    number: formatSaleNumber(at, n),
    createdAt: at,
    kasirName: "Rina",
    items: [],
    total,
    payments: [
      { method: "cash" as const, amount: total - credit },
      ...(credit > 0 ? [{ method: "credit" as const, amount: credit }] : []),
    ].filter((p) => p.amount > 0),
    cashReceived: total - credit,
    change: 0,
    customerId: null,
    status: "selesai",
    printStatus: "tercetak",
    costTotal: Math.round(total * 0.9),
    voidedAt: null,
    ...rest,
  });
}

const fresh = () => createSeedState(NOW);
const at = (day: number, h: number, m = 0) => day + h * HOUR_MS + m * 60_000;

describe("ownerTodaySummary", () => {
  test("revenue/salesCount/avgTicket/grossProfit/newCredit dari penjualan selesai hari ini saja", () => {
    const s = fresh();
    addSale(s, at(TODAY, 7), 10_001, { costTotal: 9_000, credit: 3_000 });
    addSale(s, at(TODAY, 9), 10_000, { costTotal: 8_500 });
    addSale(s, at(TODAY, 10), 99_999, { status: "dibatalkan" });
    addSale(s, at(TODAY - DAY_MS, 10), 77_777);
    const r = ownerTodaySummary(s, NOW);
    expect(r).toMatchObject({
      date: "2026-10-23",
      weekdayLastWeek: "Jumat",
      revenue: 20_001,
      salesCount: 2,
      grossProfit: 20_001 - 17_500,
      newCredit: 3_000,
      avgTicket: 10_001, // 10000,5 dibulatkan ke atas
    });
  });

  test("hari tanpa penjualan -> avgTicket 0, hourly 24 bucket nol (riwayat seed tidak mengisi hari ini)", () => {
    const r = ownerTodaySummary(fresh(), NOW);
    expect([r.revenue, r.salesCount, r.avgTicket, r.grossProfit]).toEqual([
      0, 0, 0, 0,
    ]);
    expect(r.hourly.map((b) => b.hour)).toEqual([...Array(24).keys()]);
    expect(r.hourly.every((b) => b.revenue === 0)).toBe(true);
  });

  test("hourly.lastWeekRevenue = omzet jam penuh yang sama 7 hari lalu (selesai saja)", () => {
    const base = ownerTodaySummary(fresh(), NOW).hourly;
    const s = fresh();
    addSale(s, at(LAST_WEEK, 15, 59), 5_000);
    addSale(s, at(LAST_WEEK, 15, 1), 2_000);
    addSale(s, at(LAST_WEEK, 15, 2), 9_999, { status: "dibatalkan" });
    const h = ownerTodaySummary(s, NOW).hourly;
    expect(
      (h[15]?.lastWeekRevenue ?? 0) - (base[15]?.lastWeekRevenue ?? 0),
    ).toBe(7_000);
  });

  test("lastWeekRevenue berhenti di jam:menit yang sama (R4), bukan satu hari penuh", () => {
    const base = ownerTodaySummary(fresh(), NOW).lastWeekRevenue;
    const s = fresh();
    addSale(s, at(LAST_WEEK, 14, 30), 1_000); // menit yang sama: ikut
    addSale(s, at(LAST_WEEK, 14, 31), 20_000); // setelahnya: tidak
    addSale(s, at(LAST_WEEK, 20), 300_000);
    addSale(s, at(LAST_WEEK, 3), 40_000);
    expect(ownerTodaySummary(s, NOW).lastWeekRevenue - base).toBe(41_000);
  });

  test("penjualan dibatalkan tidak dihitung (omzet turun saat dibatalkan)", () => {
    const s = fresh();
    addSale(s, at(TODAY, 8), 50_000);
    addSale(s, at(LAST_WEEK, 8), 30_000);
    const before = ownerTodaySummary(s, NOW);
    for (const x of s.sales.slice(-2)) x.status = "dibatalkan";
    const after = ownerTodaySummary(s, NOW);
    expect(before.revenue - after.revenue).toBe(50_000);
    expect(before.lastWeekRevenue - after.lastWeekRevenue).toBe(30_000);
    expect(after.salesCount).toBe(0);
  });

  test("overdueCredit menghitung Bu Sari, Pak Udin, Bu Tini (> 30 hari)", () => {
    expect(ownerTodaySummary(fresh(), NOW).attention.overdueCredit).toEqual({
      count: 3,
      total: 120_000 + 50_000 + 640_000,
    });
  });

  test("stok menipis dan minus dihitung terpisah", () => {
    const s = fresh();
    expect(ownerTodaySummary(s, NOW).attention).toMatchObject({
      lowStockCount: 7,
      negativeStockCount: 0,
    });
    const [a, b] = s.products.slice(0, 2);
    s.stock[a?.id ?? ""] = -3;
    s.stock[b?.id ?? ""] = 0;
    expect(ownerTodaySummary(s, NOW).attention).toMatchObject({
      lowStockCount: 8,
      negativeStockCount: 1,
    });
  });

  test("cashDifferences: hanya hari ini, tidak nol, terbaru dulu", () => {
    const s = fresh();
    const shift = (id: string, closedAt: number, difference: number) => ({
      shiftId: id,
      kasirName: id,
      closedAt,
      difference,
      openingCash: 0,
      cashSales: 0,
      supplierPayments: 0,
      expectedCash: 0,
      countedCash: 0,
      salesCount: 0,
    });
    s.closedShifts.push(
      shift("lama", at(TODAY - DAY_MS, 21), -9_000),
      shift("pagi", at(TODAY, 13), -5_000),
      shift("pas", at(TODAY, 14), 0),
      shift("sore", at(TODAY, 14, 10), 2_000),
    );
    expect(
      ownerTodaySummary(s, NOW).attention.cashDifferences.map((c) => [
        c.shiftId,
        c.difference,
      ]),
    ).toEqual([
      ["sore", 2_000],
      ["pagi", -5_000],
    ]);
  });
});

describe("Perlu perhatian: stok (K5), modal berubah, dan habis", () => {
  type Flags = {
    status: ProductStatus;
    scarce: boolean;
    stockCounted: boolean;
  };
  const AKTIF: Flags = { status: "aktif", scarce: false, stockCounted: true };

  test.each<[Partial<Flags>, number, StockAlert]>([
    [{}, -1, "minus"],
    [{}, 0, "menipis"],
    [{}, 9, "menipis"],
    [{}, 10, "none"],
    [{ scarce: true }, 5, "none"],
    [{ scarce: true }, -1, "minus"],
    [{ status: "tidak_diambil" }, 5, "none"],
    [{ status: "tidak_diambil" }, -1, "minus"],
    [{ stockCounted: false }, 5, "none"],
    [{ stockCounted: false }, -3, "none"],
    [{ status: "nonaktif" }, 5, "none"],
    [{ status: "nonaktif" }, -1, "none"],
    // Barang menunggu harga jual diperlakukan seperti aktif.
    [{ status: "menunggu_harga" }, 5, "menipis"],
    [{ status: "menunggu_harga" }, -1, "minus"],
  ])("stockAlertOf %o stok %i (batas 10) → %s", (flags, stock, alert) => {
    const s = fresh();
    const p = s.products.find((x) => x.name === "Kopi Kapal Api 165 g");
    if (!p) throw new Error("seed tanpa Kapal Api");
    Object.assign(p, AKTIF, flags);
    s.stock[p.id] = stock;
    expect(s.minStock[p.id]).toBe(10);
    expect(stockAlertOf(s, p)).toBe(alert);
    const before = ownerTodaySummary(fresh(), NOW).attention;
    const after = ownerTodaySummary(s, NOW).attention;
    expect([
      after.lowStockCount - before.lowStockCount,
      after.negativeStockCount - before.negativeStockCount,
    ]).toEqual([alert === "menipis" ? 1 : 0, alert === "minus" ? 1 : 0]);
  });

  test("tanpa batas (minStock tidak ada) → tidak pernah menipis", () => {
    const s = fresh();
    const p = s.products[0];
    if (!p) throw new Error("seed kosong");
    delete s.minStock[p.id];
    s.stock[p.id] = 0;
    expect(stockAlertOf(s, p)).toBe("none");
  });

  test("costChanges: modal eceran lama → baru, terbaru dulu; HPP sama (rasio) atau kosong dilewati", () => {
    const s = fresh();
    const named = (name: string) => {
      const p = s.products.find((x) => x.name === name);
      if (!p) throw new Error(`seed tanpa ${name}`);
      return p;
    };
    const indomie = named("Indomie Goreng");
    const gula = named("Gula Pasir");
    const beras = named("Beras Pandan Wangi 5 kg");
    const kopi = named("Kopi Kapal Api 165 g");
    indomie.cost = { amount: 108000, qtyBase: 40 };
    s.costAlerts[indomie.id] = {
      fromCost: { amount: 104000, qtyBase: 40 },
      changedAt: NOW - 2 * HOUR_MS,
      source: "pemilik",
    };
    gula.cost = { amount: 16000, qtyBase: 1000 };
    s.costAlerts[gula.id] = {
      fromCost: { amount: 16500, qtyBase: 1000 },
      changedAt: NOW - HOUR_MS,
      source: "impor",
    };
    // Peringatan dengan HPP sama (Beras) atau modal kosong (Kopi) tidak tampil.
    beras.cost = { amount: 71000, qtyBase: 1 };
    s.costAlerts[beras.id] = {
      fromCost: { amount: 71000, qtyBase: 1 },
      changedAt: NOW,
      source: "pemilik",
    };
    kopi.cost = null;
    s.costAlerts[kopi.id] = {
      fromCost: { amount: 12000, qtyBase: 1 },
      changedAt: NOW,
      source: "pemilik",
    };
    expect(ownerTodaySummary(s, NOW).attention.costChanges).toEqual([
      {
        productId: gula.id,
        productName: "Gula Pasir",
        unitName: "kg",
        oldCost: 16500,
        newCost: 16000,
        price: 18000,
        changedAt: NOW - HOUR_MS,
        source: "impor",
      },
      {
        productId: indomie.id,
        productName: "Indomie Goreng",
        unitName: "pcs",
        oldCost: 2600,
        newCost: 2700,
        price: 3100,
        changedAt: NOW - 2 * HOUR_MS,
        source: "pemilik",
      },
    ]);
    // C12: HPP berbeda walau modal eceran terbulatkan sama → tetap tampil, sama dengan detail.
    indomie.cost = { amount: 104010, qtyBase: 40 };
    const shown = () =>
      ownerTodaySummary(s, NOW).attention.costChanges.map((c) => c.productName);
    expect(shown()).toEqual(["Gula Pasir", "Indomie Goreng"]);
    expect(toOwnerProduct(s, indomie).costAlert).toEqual(
      s.costAlerts[indomie.id],
    );
    // Rasio sama dengan fromCost dalam bentuk lain ({2600,1} = {104000,40}) → tidak tampil di mana pun.
    indomie.cost = { amount: 2600, qtyBase: 1 };
    expect(shown()).toEqual(["Gula Pasir"]);
    expect(toOwnerProduct(s, indomie).costAlert).toBeNull();
    expect(toOwnerProduct(s, beras).costAlert).toBeNull();
    expect(toOwnerProduct(s, kopi).costAlert).toBeNull();
    expect(toOwnerProduct(s, gula).costAlert).toEqual(s.costAlerts[gula.id]);
  });

  test("stockOuts: tidak_diambil, sudah dihitung, stok ≤ 0; urut nama", () => {
    const s = fresh();
    const [a, b, c, d] = s.products.slice(4, 8);
    if (!a || !b || !c || !d) throw new Error("seed kurang");
    for (const p of [a, b, c, d]) p.status = "tidak_diambil";
    s.stock[a.id] = 0;
    s.stock[b.id] = -2;
    s.stock[c.id] = 0;
    c.stockCounted = false;
    s.stock[d.id] = 1;
    const expected = [a, b]
      .map((p) => ({ productId: p.id, productName: p.name }))
      .sort((x, y) => x.productName.localeCompare(y.productName, "id"));
    expect(ownerTodaySummary(s, NOW).attention.stockOuts).toEqual(expected);
  });
});

describe("Perlu perhatian: barang menunggu harga jual dan utang supplier", () => {
  test("awaitingPriceCount = jumlah barang menunggu_harga; seed 0", () => {
    const s = fresh();
    expect(ownerTodaySummary(s, NOW).attention.awaitingPriceCount).toBe(0);
    for (const p of s.products.slice(0, 2)) p.status = "menunggu_harga";
    expect(ownerTodaySummary(s, NOW).attention.awaitingPriceCount).toBe(2);
  });

  test("supplierDebts: seed tanpa utang → semua nol", () => {
    expect(ownerTodaySummary(fresh(), NOW).attention.supplierDebts).toEqual({
      overdueCount: 0,
      overdueTotal: 0,
      dueSoonCount: 0,
      dueSoonTotal: 0,
    });
  });
});

describe("Perlu perhatian: kedaluwarsa (K19)", () => {
  test("perhatian expiry: barang berbeda per tahap", () => {
    const state = fresh();
    expect(ownerTodaySummary(state, NOW).attention.expiry).toEqual({
      expiredCount: 0,
      soonCount: 0,
      soonDays: 30,
    });
    applySampleStock(state, NOW);
    expect(ownerTodaySummary(state, NOW).attention.expiry).toEqual({
      expiredCount: 1,
      soonCount: 3,
      soonDays: 30,
    });
  });
});

describe("Perlu perhatian: opname (K19)", () => {
  const item = (
    productId: string,
    state: MockOpnameItem["state"],
    diffQtyBase: number,
    value: number | null,
  ): MockOpnameItem => ({
    productId,
    productName: productId,
    unitName: "pcs",
    unitSize: 1,
    isCurah: false,
    countedQtyBase: 0,
    countedAt: NOW,
    clockEstimated: false,
    systemQtyBase: 0,
    diffQtyBase,
    value,
    state,
    reason: "hilang",
    receiptRefId: null,
    resolvedByName: null,
    resolvedAt: null,
    replacedBySessionId: null,
    recount: null,
  });
  const session = (
    id: string,
    finishedAt: number,
    o: Partial<MockOpnameSession>,
  ): MockOpnameSession => ({
    id,
    scope: { kind: "kategori", category: id },
    createdById: "u",
    createdByName: "Rina",
    submittedAt: finishedAt - 60_000,
    finishedAt,
    status: "selesai",
    flagged: false,
    reviewedByName: null,
    reviewedAt: null,
    items: [],
    ...o,
  });

  test("opnameHeldCount = barang ditahan; opnameFlags = sesi flagged belum ditinjau, terbaru dulu, total = loss + gain", () => {
    const s = fresh();
    expect(ownerTodaySummary(s, NOW).attention).toMatchObject({
      opnameHeldCount: 0,
      opnameFlags: [],
    });
    s.opnameSessions.push(
      session("Lama", at(TODAY, 8), {
        flagged: true,
        items: [
          item("a", "ditahan", -100, 150_000),
          item("b", "disesuaikan", 40, 90_000),
          item("c", "stok_awal", 5, null),
        ],
      }),
      session("Baru", at(TODAY, 10), {
        flagged: true,
        items: [
          item("d", "ditahan", -1, null),
          item("e", "diganti", -300, 300_000),
          item("f", "disetujui", -260, 260_000),
        ],
      }),
      session("Ditinjau", at(TODAY, 11), {
        flagged: true,
        reviewedByName: "Pak Ahmad",
        reviewedAt: at(TODAY, 12),
        items: [item("g", "ditahan", -200, 200_000)],
      }),
      session("Kecil", at(TODAY, 12), {
        items: [item("h", "cocok", 0, 0)],
      }),
    );
    expect(ownerTodaySummary(s, NOW).attention).toMatchObject({
      opnameHeldCount: 3,
      opnameFlags: [
        {
          sessionId: "Baru",
          scope: { kind: "kategori", category: "Baru" },
          finishedAt: at(TODAY, 10),
          totalValue: 260_000,
        },
        {
          sessionId: "Lama",
          scope: { kind: "kategori", category: "Lama" },
          finishedAt: at(TODAY, 8),
          totalValue: 240_000,
        },
      ],
    });
  });
});
