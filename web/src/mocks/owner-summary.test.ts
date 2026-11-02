import { describe, expect, test } from "vitest";
import { businessDay, DAY_MS, HOUR_MS } from "@/shared/lib/business-day";
import type { MockSale, MockState } from "./db";
import { ownerTodaySummary } from "./owner-summary";
import { formatSaleNumber } from "./sale-number";
import { createSeedState } from "./seed-data";

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
