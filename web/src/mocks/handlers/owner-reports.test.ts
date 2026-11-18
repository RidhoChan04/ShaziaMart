import { beforeEach, describe, expect, test, vi } from "vitest";
import type {
  OpnameProductReport,
  OpnameReport,
  Problem,
  ProductSales,
  SalesReport,
  StockReport,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { mockDb } from "../db";
import { opnameProductReport, opnameReport } from "../reports/opname-report";
import { salesReport } from "../reports/sales-report";
import { applySampleOpname, ROKOK } from "../reports/sample-opname";
import { thinMarginReport } from "../reports/thin-margin";
import { unsoldReport } from "../reports/unsold";
import {
  BIMOLI,
  cashSale,
  get,
  json,
  login,
  loginWithShift,
  ownerLogin,
  post,
} from "./test-helpers";

/** Kamis 5 Nov 2026 14.30 WIB. */
const NOW = Date.UTC(2026, 10, 5, 7, 30);

const sales = (query: string) => get(`/api/owner/reports/sales?${query}`);
const products = (query: string) => get(`/api/owner/reports/products?${query}`);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

const detailOf = async (res: Response) => {
  expect(res.status).toBe(422);
  const body = await json<Problem>(res);
  expect(body.code).toBe("VALIDATION");
  return body.detail;
};

describe("getOwnerSalesReport & listOwnerProductSales", () => {
  test("tanpa sesi pemilik → 401; period/rentang tidak sah → 422 dengan pesan checkRange; to > hari ini dijepit", async () => {
    const month = "period=bulan&from=2026-11-01&to=2026-11-30";
    expect((await sales(month)).status).toBe(401);
    expect((await products(month)).status).toBe(401);
    // Sesi kasir tidak berlaku di realm pemilik.
    expect((await login("123456")).status).toBe(200);
    expect((await sales(month)).status).toBe(401);

    expect((await ownerLogin()).status).toBe(200);
    const cases: [string, string][] = [
      ["period=tahun&from=2026-11-01&to=2026-11-30", "Periode tidak valid"],
      ["from=2026-11-01&to=2026-11-30", "Periode tidak valid"],
      ["period=hari&from=abc&to=2026-11-05", "Tanggal tidak valid"],
      ["period=hari&from=2026-11-05", "Tanggal tidak valid"],
      [
        "period=tanggal&from=2026-11-05&to=2026-11-01",
        "Tanggal akhir sebelum tanggal awal",
      ],
      ["period=hari&from=2026-11-06&to=2026-11-06", "Tanggal di masa depan"],
      ["period=minggu&from=2026-11-03&to=2026-11-08", "Periode tidak cocok"],
      [
        "period=tanggal&from=2026-08-01&to=2026-11-05",
        "Rentang maksimal 92 hari",
      ],
    ];
    for (const [query, message] of cases) {
      expect(await detailOf(await sales(query)), query).toBe(message);
      expect(await detailOf(await products(query)), query).toBe(message);
    }

    const res = await sales(month);
    expect(res.status).toBe(200);
    const body = await json<SalesReport>(res);
    expect(body).toMatchObject({
      period: "bulan",
      range: { from: "2026-11-01", to: "2026-11-05" },
      previous: { from: "2026-10-01", to: "2026-10-05" },
      running: true,
    });
    expect(body.series.buckets).toHaveLength(30);
    expect(body).toEqual(
      salesReport(
        mockDb.get(),
        { period: "bulan", from: "2026-11-01", to: "2026-11-30" },
        NOW,
      ),
    );
  });

  test("barang terjual: sort bawaan omzet, sort tidak dikenal → 422; penjualan kasir hari ini ikut", async () => {
    await loginWithShift();
    expect((await post("/api/sales", cashSale(2))).status).toBe(201);
    await ownerLogin();
    const today = "period=hari&from=2026-11-05&to=2026-11-05";
    const res = await products(today);
    expect(res.status).toBe(200);
    const rows = await json<ProductSales[]>(res);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      productName: BIMOLI,
      qtyBase: 2,
      revenue: 72_000,
    });
    expect(rows[0]?.grossProfit).not.toBeNull();
    expect(await json(await products(`${today}&sort=jumlah`))).toEqual(rows);
    expect(await json(await products(`${today}&sort=laba`))).toEqual(rows);
    expect(await detailOf(await products(`${today}&sort=modal`))).toBe(
      "Urutan tidak valid",
    );
    const report = await json<SalesReport>(await sales(today));
    expect(report.current).toMatchObject({ revenue: 72_000, salesCount: 1 });
    expect(report.topProducts).toEqual(rows);
    expect(report.kasir).toEqual([
      { kasirName: "Rina", revenue: 72_000, salesCount: 1, voidedCount: 0 },
    ]);
  });
});

const stock = (query = "") => get(`/api/owner/reports/stock${query}`);
const opname = (query: string) => get(`/api/owner/reports/opname?${query}`);
const opnameOf = (productId: string, query: string) =>
  get(`/api/owner/reports/opname/${productId}?${query}`);

describe("getOwnerStockReport, getOwnerOpnameReport & getOwnerOpnameProductReport", () => {
  test("tanpa sesi pemilik → 401; sort stok bawaan modal, sort tidak dikenal → 422; isi dari unsoldReport & thinMarginReport", async () => {
    const nov = "from=2026-11-01&to=2026-11-05";
    expect((await stock()).status).toBe(401);
    expect((await opname(nov)).status).toBe(401);
    expect((await opnameOf("x", nov)).status).toBe(401);
    expect((await login("123456")).status).toBe(200);
    expect((await stock()).status).toBe(401);

    await ownerLogin();
    const res = await stock();
    expect(res.status).toBe(200);
    const body = await json<StockReport>(res);
    const state = mockDb.get();
    expect(body).toEqual({
      today: "2026-11-05",
      unsold: unsoldReport(state, NOW, "modal"),
      thinMargin: thinMarginReport(state),
    });
    // Seed: 6 barang lambat (3 belum pernah terjual, 3 terakhir terjual 45–57 hari lalu).
    expect(body.unsold.count).toBeGreaterThanOrEqual(6);
    expect(await json(await stock("?sort=modal"))).toEqual(body);
    expect((await json<StockReport>(await stock("?sort=lama"))).unsold).toEqual(
      unsoldReport(state, NOW, "lama"),
    );
    expect(await detailOf(await stock("?sort=omzet"))).toBe(
      "Urutan tidak valid",
    );
  });

  test("selisih opname: 422 rentang (pesan checkRange tanggal), to dijepit; 404 barang tanpa hitungan; detail dengan yang bertugas", async () => {
    await ownerLogin();
    mockDb.update((s) => applySampleOpname(s, NOW));
    const rokok = mockDb.get().products.find((p) => p.name === ROKOK)?.id;
    if (!rokok) throw new Error("tanpa contoh rokok");
    const cases: [string, string][] = [
      ["from=abc&to=2026-11-05", "Tanggal tidak valid"],
      ["from=2026-11-01", "Tanggal tidak valid"],
      ["from=2026-11-05&to=2026-11-01", "Tanggal akhir sebelum tanggal awal"],
      ["from=2026-11-06&to=2026-11-07", "Tanggal di masa depan"],
      ["from=2026-08-01&to=2026-11-05", "Rentang maksimal 92 hari"],
    ];
    for (const [query, message] of cases) {
      expect(await detailOf(await opname(query)), query).toBe(message);
      expect(await detailOf(await opnameOf(rokok, query)), query).toBe(message);
    }

    const res = await opname("from=2026-11-01&to=2026-11-30");
    expect(res.status).toBe(200);
    const report = await json<OpnameReport>(res);
    const nov = { from: "2026-11-01", to: "2026-11-05" };
    expect(report).toEqual(opnameReport(mockDb.get(), nov));
    expect(report).toMatchObject({ range: nov, lossValue: 294_000 });

    const detail = await json<OpnameProductReport>(
      await opnameOf(rokok, "from=2026-11-01&to=2026-11-30"),
    );
    expect(detail).toEqual(opnameProductReport(mockDb.get(), rokok, nov));
    expect(detail.counts).toHaveLength(4);
    // Riwayat seed: shift pagi Rina & sore Budi setiap hari sebelum hari ini.
    expect(detail.dutyOnShort).toEqual([
      { name: "Budi", intervals: 3 },
      { name: "Rina", intervals: 3 },
    ]);
    // Hitungan −5 (3 Nov 16.20) sejak 2 Nov 09.15: shift 2 & 3 Nov, nota masuk Rina 2 Nov.
    expect(detail.counts[1]?.duty).toEqual([
      { name: "Budi", shifts: 2, records: 0 },
      { name: "Rina", shifts: 2, records: 1 },
    ]);
    expect(detail.counts[0]?.counterName).toBe("Pak Ahmad");

    const missing = await opnameOf(rokok, "from=2026-10-01&to=2026-10-31");
    expect(missing.status).toBe(404);
    expect((await json<Problem>(missing)).code).toBe("NOT_FOUND");
    const unknown = await opnameOf(
      "tidak-ada",
      "from=2026-11-01&to=2026-11-05",
    );
    expect(unknown.status).toBe(404);
  });
});
