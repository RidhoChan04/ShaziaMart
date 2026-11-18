import { describe, expect, test } from "vitest";
import type {
  ProductSales,
  ReportPeriod,
  SaleItem,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { roundHalfUp } from "@/shared/lib/quantity";
import type { MockProduct, MockSale, MockState } from "../db";
import { ownerTodaySummary } from "../owner-summary";
import { formatSaleNumber } from "../sale-number";
import { saleLineCosts, sumLineCosts } from "../sale-rules";
import { createSeedState } from "../seed-data";
import { productSales, salesReport } from "./sales-report";

/** Jam dinding Asia/Jakarta → epoch ms UTC. */
const wib = (iso: string, h: number, m = 0, s = 0): number =>
  Date.parse(
    `${iso}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}+07:00`,
  );

/** Kamis 5 Nov 2026 14.30 WIB. */
const NOW = wib("2026-11-05", 14, 30);
const SEED = createSeedState(NOW);
/** Seed tanpa riwayat penjualan: angka laporan hanya dari penjualan test. */
const fresh = (): MockState => ({ ...structuredClone(SEED), sales: [] });

const BIMOLI = "Minyak Goreng Bimoli 2 L";
const BERAS_5KG = "Beras Pandan Wangi 5 kg";
const KOPI = "Kopi Kapal Api 165 g";

function product(s: MockState, name: string): MockProduct {
  const p = s.products.find((x) => x.name === name);
  if (!p) throw new Error(`seed tanpa ${name}`);
  return p;
}

type LineSpec = { name: string; unit?: string; qtyBase: number };

function lineOf(s: MockState, spec: LineSpec): SaleItem {
  const p = product(s, spec.name);
  const u = p.units.find(
    (x) => spec.unit === undefined || x.name === spec.unit,
  );
  if (!u) throw new Error(`${spec.name} tanpa ${spec.unit}`);
  return {
    unitId: u.id,
    productName: p.name,
    unitName: u.name,
    isCurah: p.isCurah,
    baseUnit: p.baseUnit,
    unitSize: u.unitSize,
    qtyBase: spec.qtyBase,
    unitPrice: u.price,
    subtotal: roundHalfUp(spec.qtyBase * u.price, u.unitSize),
    wholesale: false,
  };
}

let seq = 0;
/** Penjualan selesai dari baris barang seed; HPP per baris disalin dari HPP sekarang. */
function addSale(
  s: MockState,
  at: number,
  lines: LineSpec[],
  o: Partial<MockSale> & { credit?: number } = {},
): MockSale {
  seq += 1;
  const { credit = 0, ...rest } = o;
  const items = lines.map((l) => lineOf(s, l));
  const lineCosts = saleLineCosts(s.products, items);
  const total = items.reduce((a, i) => a + i.subtotal, 0);
  const sale: MockSale = {
    id: `t-${seq}`,
    number: formatSaleNumber(at, seq),
    createdAt: at,
    kasirName: "Rina",
    shiftId: "shift-x",
    items,
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
    costTotal: sumLineCosts(lineCosts),
    lineCosts,
    voidedAt: null,
    voidedById: null,
    voidedByName: null,
    voidReason: null,
    voidChannel: null,
    voidRefund: null,
    creditOverLimit: null,
    ...rest,
  };
  s.sales.push(sale);
  return sale;
}

/** Penjualan tanpa baris dengan total & HPP langsung (untuk angka total). */
const addRaw = (
  s: MockState,
  at: number,
  total: number,
  costTotal: number,
  o: Partial<MockSale> = {},
): MockSale =>
  addSale(s, at, [], {
    total,
    costTotal,
    payments: [{ method: "cash", amount: total }],
    cashReceived: total,
    ...o,
  });

const q = (period: ReportPeriod, from: string, to: string) => ({
  period,
  from,
  to,
});
const MONTH = q("bulan", "2026-11-01", "2026-11-30");

describe("salesReport", () => {
  test("Hari ini = Beranda: current = ownerTodaySummary; previousTotals.revenue = lastWeekRevenue", () => {
    const s = structuredClone(SEED); // dengan riwayat 63 hari (minggu lalu terisi)
    addSale(s, wib("2026-11-05", 8, 15), [{ name: BIMOLI, qtyBase: 3 }], {
      credit: 50_000,
    });
    addSale(s, wib("2026-11-05", 11), [
      { name: "Gula Pasir", qtyBase: 1500 },
      { name: "Indomie Goreng", unit: "dus", qtyBase: 40 },
    ]);
    addSale(s, wib("2026-11-05", 12), [{ name: KOPI, qtyBase: 2 }], {
      status: "dibatalkan",
    });
    const r = salesReport(s, q("hari", "2026-11-05", "2026-11-05"), NOW);
    const b = ownerTodaySummary(s, NOW);
    expect(b.lastWeekRevenue).toBeGreaterThan(0);
    expect(r.current).toEqual({
      revenue: b.revenue,
      grossProfit: b.grossProfit,
      salesCount: b.salesCount,
      avgTicket: b.avgTicket,
      newCredit: b.newCredit,
      marginPermille: expect.any(Number),
    });
    expect(r.previousTotals.revenue).toBe(b.lastWeekRevenue);
    expect(r).toMatchObject({
      period: "hari",
      range: { from: "2026-11-05", to: "2026-11-05" },
      previous: { from: "2026-10-29", to: "2026-10-29" },
      running: true,
    });
    expect(r.series.buckets.slice(0, 15).map((x) => x.revenue)).toEqual(
      b.hourly.slice(0, 15).map((h) => h.revenue),
    );
  });

  test("bulan berjalan 1–5 Nov 14.30: penjualan 5 Okt 14.30:59 masuk pembanding, 14.31:00 tidak", () => {
    const s = fresh();
    addRaw(s, wib("2026-10-01", 0), 1_000, 0);
    addRaw(s, wib("2026-10-05", 14, 30, 59), 20_000, 0);
    addRaw(s, wib("2026-10-05", 14, 31, 0), 300_000, 0);
    addRaw(s, wib("2026-09-30", 23, 59, 59), 4_000_000, 0);
    addRaw(s, wib("2026-10-06", 9), 50_000_000, 0);
    const r = salesReport(s, MONTH, NOW);
    expect(r.range).toEqual({ from: "2026-11-01", to: "2026-11-05" });
    expect(r.previous).toEqual({ from: "2026-10-01", to: "2026-10-05" });
    expect(r.running).toBe(true);
    expect(r.previousTotals.revenue).toBe(21_000);
    expect(r.previousTotals.salesCount).toBe(2);
  });

  test("(jawaban pemilik Q7) berjalan 30 Mar 14.30 → 1–28 Feb dengan 28 Feb PENUH; berjalan 28 Mar 14.30 → 28 Feb dipotong 14.30 (sejajar)", () => {
    const s = fresh();
    addRaw(s, wib("2026-02-01", 7), 1_000, 0);
    addRaw(s, wib("2026-02-28", 14, 30, 59), 20_000, 0);
    addRaw(s, wib("2026-02-28", 20), 300_000, 0);
    addRaw(s, wib("2026-03-01", 0), 4_000_000, 0);
    const march = q("bulan", "2026-03-01", "2026-03-31");

    const clamped = salesReport(s, march, wib("2026-03-30", 14, 30));
    expect(clamped.range).toEqual({ from: "2026-03-01", to: "2026-03-30" });
    expect(clamped.previous).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(clamped.previousTotals.revenue).toBe(321_000);

    const aligned = salesReport(s, march, wib("2026-03-28", 14, 30));
    expect(aligned.range).toEqual({ from: "2026-03-01", to: "2026-03-28" });
    expect(aligned.previous).toEqual({ from: "2026-02-01", to: "2026-02-28" });
    expect(aligned.previousTotals.revenue).toBe(21_000);

    // Bulan lewat: Februari penuh vs Januari penuh, tanpa potongan.
    const feb = salesReport(
      s,
      q("bulan", "2026-02-01", "2026-02-28"),
      wib("2026-03-28", 14, 30),
    );
    expect(feb.running).toBe(false);
    expect(feb.previous).toEqual({ from: "2026-01-01", to: "2026-01-31" });
    expect(feb.current.revenue).toBe(321_000);
  });

  test("(jawaban pemilik Q7) hari terakhir bulan berjalan 30 Nov 14.30 → 1–30 Okt dipotong 14.30 (bukan Oktober penuh)", () => {
    const s = fresh();
    addRaw(s, wib("2026-10-01", 7), 1_000, 0);
    addRaw(s, wib("2026-10-30", 14, 30, 59), 20_000, 0);
    addRaw(s, wib("2026-10-30", 14, 31, 0), 300_000, 0);
    addRaw(s, wib("2026-10-31", 9), 4_000_000, 0);
    const r = salesReport(s, MONTH, wib("2026-11-30", 14, 30));
    expect(r.running).toBe(true);
    expect(r.range).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(r.previous).toEqual({ from: "2026-10-01", to: "2026-10-30" });
    expect(r.previousTotals.revenue).toBe(21_000);
    expect(r.previousTotals.salesCount).toBe(2);
  });

  test("bulan yang sudah lewat (November selesai, dilihat 5 Des) → Oktober penuh tanpa potongan", () => {
    const s = fresh();
    addRaw(s, wib("2026-10-30", 20), 300_000, 0);
    addRaw(s, wib("2026-10-31", 23, 59, 59), 4_000_000, 0);
    addRaw(s, wib("2026-11-01", 0), 50_000_000, 0);
    const r = salesReport(s, MONTH, wib("2026-12-05", 14, 30));
    expect(r.running).toBe(false);
    expect(r.range).toEqual({ from: "2026-11-01", to: "2026-11-30" });
    expect(r.previous).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(r.previousTotals.revenue).toBe(4_300_000);
  });

  test("(jawaban pemilik Q7) berjalan 28 Feb 2026 14.30 → 1–28 Jan dipotong 14.30; 29 Feb 2028 14.30 → 1–29 Jan dipotong 14.30", () => {
    const s = fresh();
    addRaw(s, wib("2026-01-28", 14, 30, 59), 20_000, 0);
    addRaw(s, wib("2026-01-28", 14, 31, 0), 300_000, 0);
    addRaw(s, wib("2026-01-29", 9), 4_000_000, 0);
    addRaw(s, wib("2026-01-31", 9), 4_000_000, 0);
    const feb26 = salesReport(
      s,
      q("bulan", "2026-02-01", "2026-02-28"),
      wib("2026-02-28", 14, 30),
    );
    expect(feb26.running).toBe(true);
    expect(feb26.previous).toEqual({ from: "2026-01-01", to: "2026-01-28" });
    expect(feb26.previousTotals.revenue).toBe(20_000);

    addRaw(s, wib("2028-01-29", 14, 30, 59), 7_000, 0);
    addRaw(s, wib("2028-01-29", 14, 31, 0), 300_000, 0);
    addRaw(s, wib("2028-01-30", 9), 4_000_000, 0);
    const feb28 = salesReport(
      s,
      q("bulan", "2028-02-01", "2028-02-29"),
      wib("2028-02-29", 14, 30),
    );
    expect(feb28.running).toBe(true);
    expect(feb28.previous).toEqual({ from: "2028-01-01", to: "2028-01-29" });
    expect(feb28.previousTotals.revenue).toBe(7_000);
  });

  test("(jawaban pemilik Q5) marginPermille: omzet 48.215.500 laba 7.912.300 → 164; omzet 0 → null; laba minus → negatif", () => {
    const s = fresh();
    addRaw(s, wib("2026-11-03", 10), 48_215_500, 40_303_200);
    addRaw(s, wib("2026-11-02", 10), 10_000, 10_210);
    const big = salesReport(s, q("hari", "2026-11-03", "2026-11-03"), NOW);
    expect(big.current).toMatchObject({
      revenue: 48_215_500,
      grossProfit: 7_912_300,
      marginPermille: 164,
    });
    const empty = salesReport(s, q("hari", "2026-11-04", "2026-11-04"), NOW);
    expect(empty.current).toEqual({
      revenue: 0,
      grossProfit: 0,
      salesCount: 0,
      avgTicket: 0,
      newCredit: 0,
      marginPermille: null,
    });
    const loss = salesReport(s, q("hari", "2026-11-02", "2026-11-02"), NOW);
    expect(loss.current).toMatchObject({
      grossProfit: -210,
      marginPermille: -21,
    });
  });

  test("marginPermille per bucket: aturan sama dengan total (164, minus −21, omzet 0 / belum terjadi → null)", () => {
    const s = fresh();
    addRaw(s, wib("2026-11-03", 10), 48_215_500, 40_303_200);
    addRaw(s, wib("2026-11-02", 10), 10_000, 10_210);
    const days = salesReport(s, MONTH, NOW).series.buckets;
    expect(days.slice(0, 6)).toEqual([
      { key: "2026-11-01", revenue: 0, grossProfit: 0, marginPermille: null },
      {
        key: "2026-11-02",
        revenue: 10_000,
        grossProfit: -210,
        marginPermille: -21,
      },
      {
        key: "2026-11-03",
        revenue: 48_215_500,
        grossProfit: 7_912_300,
        marginPermille: 164,
      },
      { key: "2026-11-04", revenue: 0, grossProfit: 0, marginPermille: null },
      { key: "2026-11-05", revenue: 0, grossProfit: 0, marginPermille: null },
      {
        key: "2026-11-06",
        revenue: null,
        grossProfit: null,
        marginPermille: null,
      },
    ]);
    const hours = salesReport(s, q("hari", "2026-11-03", "2026-11-03"), NOW)
      .series.buckets;
    expect(hours[10]).toEqual({
      key: "10",
      revenue: 48_215_500,
      grossProfit: 7_912_300,
      marginPermille: 164,
    });
  });

  test("batas WIB: 17.30 UTC 4 Nov (00.30 WIB) masuk 5 Nov; 16.59 UTC 4 Nov masuk 4 Nov", () => {
    const s = fresh();
    addRaw(s, Date.UTC(2026, 10, 4, 17, 30), 7_000, 0);
    addRaw(s, Date.UTC(2026, 10, 4, 16, 59), 900, 0);
    const nov5 = salesReport(s, q("hari", "2026-11-05", "2026-11-05"), NOW);
    expect(nov5.current.revenue).toBe(7_000);
    expect(nov5.series.buckets[0]).toEqual({
      key: "0",
      revenue: 7_000,
      grossProfit: 7_000,
      marginPermille: 1_000,
    });
    const nov4 = salesReport(s, q("hari", "2026-11-04", "2026-11-04"), NOW);
    expect(nov4.current.revenue).toBe(900);
    expect(nov4.series.buckets[23]?.revenue).toBe(900);
    const days = salesReport(s, MONTH, NOW).series.buckets;
    expect(days[3]).toMatchObject({ key: "2026-11-04", revenue: 900 });
    expect(days[4]).toMatchObject({ key: "2026-11-05", revenue: 7_000 });
  });

  test("dibatalkan 5 Nov untuk jualan 3 Nov → keluar dari omzet 1–5 Nov; Per kasir voidedCount +1 untuk kasir penjualnya", () => {
    const s = fresh();
    addSale(s, wib("2026-11-02", 9), [{ name: BIMOLI, qtyBase: 1 }]);
    addSale(s, wib("2026-11-03", 10), [{ name: BERAS_5KG, qtyBase: 1 }], {
      kasirName: "Budi",
      status: "dibatalkan",
      voidedAt: wib("2026-11-05", 9),
    });
    addSale(s, wib("2026-10-30", 10), [{ name: KOPI, qtyBase: 1 }], {
      kasirName: "Budi",
      status: "dibatalkan",
      voidedAt: wib("2026-11-05", 9),
    });
    const r = salesReport(s, MONTH, NOW);
    expect(r.current).toMatchObject({ revenue: 36_000, salesCount: 1 });
    expect(r.kasir).toEqual([
      { kasirName: "Rina", revenue: 36_000, salesCount: 1, voidedCount: 0 },
      { kasirName: "Budi", revenue: 0, salesCount: 0, voidedCount: 1 },
    ]);
    expect(r.topProducts.map((p) => p.productName)).toEqual([BIMOLI]);
    expect(r.categories.map((c) => c.category)).toEqual(["Minyak Goreng"]);
  });

  test("seri bulan November: 30 bucket 2026-11-01..30, tanggal sesudah hari ini null; Hari: 24 bucket, jam sesudah sekarang null", () => {
    const s = fresh();
    addSale(s, wib("2026-11-05", 14, 10), [
      { name: "Gula Pasir", qtyBase: 1000 },
    ]);
    const days = salesReport(s, MONTH, NOW).series;
    expect(days.kind).toBe("hari");
    expect(days.buckets).toHaveLength(30);
    expect(days.buckets[0]).toEqual({
      key: "2026-11-01",
      revenue: 0,
      grossProfit: 0,
      marginPermille: null,
    });
    expect(days.buckets[29]?.key).toBe("2026-11-30");
    expect(days.buckets[4]).toEqual({
      key: "2026-11-05",
      revenue: 18_000,
      grossProfit: 1_500,
      marginPermille: 83,
    });
    expect(days.buckets.slice(5).every((x) => x.revenue === null)).toBe(true);
    expect(days.buckets.slice(5).every((x) => x.grossProfit === null)).toBe(
      true,
    );

    const hours = salesReport(
      s,
      q("hari", "2026-11-05", "2026-11-05"),
      NOW,
    ).series;
    expect(hours.kind).toBe("jam");
    expect(hours.buckets.map((x) => x.key)).toEqual(
      Array.from({ length: 24 }, (_, h) => String(h)),
    );
    expect(hours.buckets[14]).toEqual({
      key: "14",
      revenue: 18_000,
      grossProfit: 1_500,
      marginPermille: 83,
    });
    expect(hours.buckets[3]).toEqual({
      key: "3",
      revenue: 0,
      grossProfit: 0,
      marginPermille: null,
    });
    expect(hours.buckets.slice(15).every((x) => x.revenue === null)).toBe(true);
    // Hari lampau: semua jam sudah terjadi.
    const past = salesReport(
      s,
      q("hari", "2026-11-04", "2026-11-04"),
      NOW,
    ).series;
    expect(past.buckets.every((x) => x.revenue === 0)).toBe(true);
    // Minggu berjalan: Senin–Minggu penuh, Jumat–Minggu null.
    const week = salesReport(s, q("minggu", "2026-11-02", "2026-11-08"), NOW);
    expect(week.range).toEqual({ from: "2026-11-02", to: "2026-11-05" });
    expect(week.series.buckets.map((x) => x.revenue)).toEqual([
      0,
      0,
      0,
      18_000,
      null,
      null,
      null,
    ]);
  });
});

describe("productSales", () => {
  const sorted = (s: MockState, sort: "omzet" | "jumlah" | "laba") =>
    productSales(s, { ...MONTH, sort }, NOW);

  test("2 dus Indomie (isi 40) + 5 pcs → qtyBase 85; curah 1.500 gram → qtyBase 1500", () => {
    const s = fresh();
    addSale(s, wib("2026-11-02", 9), [
      { name: "Indomie Goreng", unit: "dus", qtyBase: 80 },
    ]);
    addSale(s, wib("2026-11-03", 9), [
      { name: "Indomie Goreng", unit: "pcs", qtyBase: 5 },
      { name: "Gula Pasir", qtyBase: 1500 },
    ]);
    const rows = sorted(s, "omzet");
    const indomie = product(s, "Indomie Goreng");
    expect(rows).toEqual([
      {
        productId: indomie.id,
        productName: "Indomie Goreng",
        unitName: "pcs",
        unitSize: 1,
        isCurah: false,
        qtyBase: 85,
        revenue: 224_000 + 15_500,
        // HPP {104.000 / 40}: 80 → 208.000, 5 → 13.000
        grossProfit: 239_500 - 221_000,
      },
      {
        productId: product(s, "Gula Pasir").id,
        productName: "Gula Pasir",
        unitName: "kg",
        unitSize: 1000,
        isCurah: true,
        qtyBase: 1500,
        revenue: 27_000,
        grossProfit: 27_000 - 24_750,
      },
    ] satisfies ProductSales[]);
  });

  test("urut jumlah memakai qtyBase ÷ unitSize eceran; seri → omzet lebih besar dulu; laba null terakhir di urut laba", () => {
    const s = fresh();
    product(s, KOPI).cost = { amount: 12_000, qtyBase: 1 };
    addSale(s, wib("2026-11-02", 9), [
      { name: KOPI, qtyBase: 3 }, // 3 pcs, Rp43.500, laba 7.500
      { name: "Gula Pasir", qtyBase: 2000 }, // 2 kg, Rp36.000, laba 3.000
    ]);
    product(s, BERAS_5KG).cost = null;
    addSale(s, wib("2026-11-03", 9), [{ name: BERAS_5KG, qtyBase: 2 }]); // 2 pcs, Rp156.000, laba null
    const names = (rows: ProductSales[]) => rows.map((r) => r.productName);
    expect(names(sorted(s, "omzet"))).toEqual([BERAS_5KG, KOPI, "Gula Pasir"]);
    expect(names(sorted(s, "jumlah"))).toEqual([KOPI, BERAS_5KG, "Gula Pasir"]);
    expect(names(sorted(s, "laba"))).toEqual([KOPI, "Gula Pasir", BERAS_5KG]);
  });

  test("HPP diubah setelah penjualan → grossProfit periode itu tidak berubah (lineCosts)", () => {
    const s = fresh();
    addSale(s, wib("2026-11-02", 9), [{ name: "Gula Pasir", qtyBase: 1000 }]);
    const before = sorted(s, "omzet");
    const totals = salesReport(s, MONTH, NOW).current;
    expect(before[0]?.grossProfit).toBe(1_500);
    product(s, "Gula Pasir").cost = { amount: 20_000, qtyBase: 1000 };
    expect(sorted(s, "omzet")).toEqual(before);
    expect(salesReport(s, MONTH, NOW).current).toEqual(totals);
  });

  test("barang dengan satu baris tanpa HPP → ProductSales.grossProfit null; total grossProfit memakai null = 0", () => {
    const s = fresh();
    product(s, KOPI).cost = { amount: 12_000, qtyBase: 1 };
    addSale(s, wib("2026-11-02", 9), [{ name: KOPI, qtyBase: 1 }]);
    product(s, KOPI).cost = null;
    addSale(s, wib("2026-11-03", 9), [{ name: KOPI, qtyBase: 1 }]);
    expect(sorted(s, "omzet")[0]).toMatchObject({
      productName: KOPI,
      qtyBase: 2,
      revenue: 29_000,
      grossProfit: null,
    });
    const r = salesReport(s, MONTH, NOW);
    expect(r.current.grossProfit).toBe(29_000 - 12_000);
    expect(r.categories).toEqual([
      {
        category: "Kopi & Teh",
        revenue: 29_000,
        grossProfit: 17_000,
        productCount: 1,
      },
    ]);
  });

  test("kategori null & barang terhapus → category null; topProducts maks. 3 urut omzet", () => {
    const s = fresh();
    product(s, KOPI).category = null;
    const gone = s.products[30];
    if (!gone) throw new Error("seed kurang barang");
    addSale(s, wib("2026-11-02", 9), [
      { name: KOPI, qtyBase: 1 }, // 14.500, tanpa kategori
      { name: gone.name, qtyBase: 100 }, // barang yang nanti dihapus
      { name: BERAS_5KG, qtyBase: 1 }, // 78.000, Beras
      { name: "Beras", qtyBase: 1000 }, // 14.000, Beras
      { name: BIMOLI, qtyBase: 1 }, // 36.000, Minyak Goreng
    ]);
    const goneLine = s.sales[0]?.items[1];
    s.products = s.products.filter((p) => p.id !== gone.id);
    const r = salesReport(s, MONTH, NOW);
    expect(r.topProducts).toHaveLength(3);
    const all = sorted(s, "omzet");
    expect(r.topProducts).toEqual(all.slice(0, 3));
    expect(all.map((p) => p.revenue)).toEqual(
      [...all.map((p) => p.revenue)].sort((a, b) => b - a),
    );
    const orphan = all.find((p) => p.productName === gone.name);
    expect(orphan).toMatchObject({
      productId: null,
      unitName: goneLine?.unitName,
      unitSize: goneLine?.unitSize,
      qtyBase: 100,
      revenue: goneLine?.subtotal,
    });
    expect(r.categories.map((c) => [c.category, c.productCount])).toEqual([
      ["Beras", 2],
      ["Minyak Goreng", 1],
      [null, 2],
    ]);
    expect(r.categories[2]?.revenue).toBe(14_500 + (goneLine?.subtotal ?? 0));
  });
});
