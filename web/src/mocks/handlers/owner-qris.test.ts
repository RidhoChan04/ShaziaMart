import { beforeEach, describe, expect, test, vi } from "vitest";
import type {
  OwnerTodaySummary,
  Problem,
  QrisDay,
  QrisDayDetail,
  QrisDayList,
  Sale,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { DAY_MS } from "@/shared/lib/business-day";
import { newId } from "@/shared/lib/id";
import { mockDb } from "../db";
import {
  customerId,
  get,
  json,
  loginWithShift,
  ownerLogin,
  post,
  put,
  saleItem,
  voidSale,
} from "./test-helpers";

/** Jam dinding WIB → epoch UTC. */
const wib = (y: number, m: number, d: number, h: number, min = 0) =>
  Date.UTC(y, m - 1, d, h - 7, min);

/** Kamis 19 Nov 2026 10.00 WIB. */
const NOW = wib(2026, 11, 19, 10);
const TODAY = "2026-11-19";
const BASE = "/api/owner/qris-days";

type Pay = { method: "cash" | "qris" | "credit"; amount: number };

/** Gula curah per nominal = total persis; tunai diterima pas. */
const gulaSale = (payments: Pay[]): Record<string, unknown> => {
  const cash = payments.find((p) => p.method === "cash")?.amount ?? 0;
  return {
    saleId: newId(),
    items: [
      saleItem(
        "Gula Pasir",
        { amount: payments.reduce((a, p) => a + p.amount, 0) },
        18000,
      ),
    ],
    payments,
    ...(cash > 0 ? { cashReceived: cash } : {}),
    print: false,
  };
};
const sell = async (payments: Pay[]): Promise<Sale> => {
  const res = await post("/api/sales", gulaSale(payments));
  if (res.status !== 201) throw new Error(`jual gagal ${res.status}`);
  return json<Sale>(res);
};
const repayQris = async (id: string, amount: number): Promise<void> => {
  const res = await post("/api/credit-payments", {
    id,
    customerId: customerId("Bu Sari"),
    amount,
    method: "qris",
    cashReceived: null,
    print: false,
  });
  if (res.status !== 201) throw new Error(`pelunasan gagal ${res.status}`);
};
const mark = (date: string, body: unknown) => put(`${BASE}/${date}`, body);
const day = async (date: string) =>
  json<QrisDayDetail>(await get(`${BASE}/${date}`));
const month = async (query = "") =>
  json<QrisDayList>(await get(`${BASE}${query}`));
const unreconciled = () => month("?unreconciled=true");
const summaryQris = async () =>
  (await json<OwnerTodaySummary>(await get("/api/owner/summary/today")))
    .attention.qrisUnreconciled;
const code = async (res: Response) => (await json<Problem>(res)).code;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

describe("GET /api/owner/qris-days/{date} (S11)", () => {
  test("items urut jam: penjualan campuran → bagian QRIS + nomor struk; pelunasan → nama pelanggan; yang batal ikut; Σ aktif = total", async () => {
    vi.setSystemTime(wib(2026, 11, 19, 7));
    await loginWithShift();
    vi.setSystemTime(wib(2026, 11, 19, 8));
    const mixed = await sell([
      { method: "cash", amount: 30_000 },
      { method: "qris", amount: 20_000 },
    ]);
    vi.setSystemTime(wib(2026, 11, 19, 8, 10));
    await repayQris("pel-1", 15_000);
    vi.setSystemTime(wib(2026, 11, 19, 8, 20));
    await repayQris("pel-2", 5_000);
    expect(
      (
        await post("/api/credit-payments/pel-2/cancel", {
          reason: "Salah pelanggan",
        })
      ).status,
    ).toBe(200);
    vi.setSystemTime(wib(2026, 11, 19, 8, 30));
    const gone = await sell([{ method: "qris", amount: 10_000 }]);
    expect(
      (
        await voidSale(gone.id, {
          reason: "Salah input",
          qrisRefundSource: "laci",
        })
      ).status,
    ).toBe(200);
    vi.setSystemTime(NOW);
    await ownerLogin();

    const detail = await day(TODAY);
    expect(detail).toEqual({
      date: TODAY,
      sales: 20_000,
      repayments: 15_000,
      total: 35_000,
      voidedCount: 2,
      voidedTotal: 15_000,
      status: "belum",
      note: null,
      markedByName: null,
      markedAt: null,
      closed: false,
      changedAfterMark: false,
      items: [
        {
          at: wib(2026, 11, 19, 8),
          amount: 20_000,
          kind: "penjualan",
          kasirName: "Rina",
          ref: mixed.number,
          status: "aktif",
        },
        {
          at: wib(2026, 11, 19, 8, 10),
          amount: 15_000,
          kind: "pelunasan",
          kasirName: "Rina",
          ref: "Bu Sari",
          status: "aktif",
        },
        {
          at: wib(2026, 11, 19, 8, 20),
          amount: 5_000,
          kind: "pelunasan",
          kasirName: "Rina",
          ref: "Bu Sari",
          status: "dibatalkan",
        },
        {
          at: wib(2026, 11, 19, 8, 30),
          amount: 10_000,
          kind: "penjualan",
          kasirName: "Rina",
          ref: gone.number,
          status: "dibatalkan",
        },
      ],
    });
    const active = detail.items.filter((i) => i.status === "aktif");
    expect(active.reduce((a, i) => a + i.amount, 0)).toBe(detail.total);
  });

  test("hari tanpa transaksi → 200 angka 0 & items kosong; tanggal tidak sah / sesudah hari ini → 422", async () => {
    await ownerLogin();
    mockDb.update((s) => {
      s.sales = [];
    });
    expect(await day("2026-11-10")).toMatchObject({
      total: 0,
      voidedCount: 0,
      items: [],
      closed: true,
    });
    for (const bad of ["2026-11-20", "2026-02-30", "kemarin"]) {
      const res = await get(`${BASE}/${bad}`);
      expect(res.status).toBe(422);
      expect(await code(res)).toBe("VALIDATION");
    }
  });

  test("tanpa sesi pemilik → 401", async () => {
    expect((await get(`${BASE}/${TODAY}`)).status).toBe(401);
    expect((await get(BASE)).status).toBe(401);
    expect((await mark("2026-11-18", { status: "cocok" })).status).toBe(401);
  });
});

describe("PUT /api/owner/qris-days/{date} (S7, K11)", () => {
  test("hari ini / masa depan / tanggal tidak sah → 422; tidak_cocok tanpa catatan → 422; catatan > 200 → 422; status lain → 422", async () => {
    await ownerLogin();
    const cases: [string, unknown][] = [
      [TODAY, { status: "cocok" }],
      ["2026-11-25", { status: "cocok" }],
      ["2026-13-01", { status: "cocok" }],
      ["2026-11-18", { status: "tidak_cocok" }],
      ["2026-11-18", { status: "tidak_cocok", note: "   " }],
      ["2026-11-18", { status: "tidak_cocok", note: null }],
      ["2026-11-18", { status: "cocok", note: "x".repeat(201) }],
      ["2026-11-18", { status: "cocok", note: 5 }],
      ["2026-11-18", { status: "belum" }],
      ["2026-11-18", {}],
    ];
    for (const [date, body] of cases) {
      const res = await mark(date, body);
      expect(res.status, `${date} ${JSON.stringify(body)}`).toBe(422);
      expect(await code(res)).toBe("VALIDATION");
    }
    expect(mockDb.get().qrisDays["2026-11-18"]).toBeUndefined();
  });

  test("tandai cocok (catatan kosong → null) lalu tandai ulang tidak_cocok menimpa; penanda & jam server", async () => {
    await ownerLogin();
    const first = await mark("2026-11-18", { status: "cocok", note: "  " });
    expect(first.status).toBe(200);
    expect(await json<QrisDay>(first)).toMatchObject({
      date: "2026-11-18",
      status: "cocok",
      note: null,
      markedByName: "Pak Ahmad",
      markedAt: NOW,
      closed: true,
      changedAfterMark: false,
    });
    vi.setSystemTime(NOW + 60_000);
    const again = await mark("2026-11-18", {
      status: "tidak_cocok",
      note: "  Mutasi bank kurang 5.000 ",
    });
    expect(again.status).toBe(200);
    expect(await json<QrisDay>(again)).toMatchObject({
      status: "tidak_cocok",
      note: "Mutasi bank kurang 5.000",
      markedAt: NOW + 60_000,
    });
    const saved = mockDb.get().qrisDays["2026-11-18"];
    expect(saved).toMatchObject({
      status: "tidak_cocok",
      note: "Mutasi bank kurang 5.000",
      markedTotal: (await day("2026-11-18")).total,
    });
  });
});

describe("tanda basi (pra-cek K21)", () => {
  test("ditandai cocok 500.000, QRIS 20.000 hari itu dibatalkan kasir (shift lama ≤ 7 hari) → belum + changedAfterMark, dihitung lagi di butir; tandai ulang → bersih", async () => {
    await loginWithShift();
    const small = await sell([{ method: "qris", amount: 20_000 }]);
    // Penjualan QRIS 480.000 lain di hari yang sama (salinan rekaman tersimpan).
    mockDb.update((s) => {
      const base = s.sales.find((x) => x.id === small.id);
      if (!base) throw new Error("penjualan hilang");
      s.sales.push({
        ...base,
        id: "big",
        number: `${base.number}-B`,
        total: 480_000,
        payments: [{ method: "qris", amount: 480_000 }],
      });
      s.qrisSince = TODAY;
    });
    expect(
      (await post("/api/shifts/current/close", { countedCash: 200_000 }))
        .status,
    ).toBe(200);

    vi.setSystemTime(NOW + DAY_MS);
    await ownerLogin();
    expect(await summaryQris()).toEqual({ count: 1, from: TODAY, to: TODAY });
    const marked = await mark(TODAY, { status: "cocok" });
    expect(await json<QrisDay>(marked)).toMatchObject({
      total: 500_000,
      status: "cocok",
    });
    expect(await summaryQris()).toBeNull();

    await loginWithShift();
    const res = await voidSale(small.id, {
      reason: "Pembeli batal",
      qrisRefundSource: "pemilik",
    });
    expect(res.status).toBe(200);

    const list = await month("?month=2026-11");
    expect(list.items.find((d) => d.date === TODAY)).toMatchObject({
      total: 480_000,
      voidedCount: 1,
      voidedTotal: 20_000,
      status: "belum",
      changedAfterMark: true,
      markedByName: "Pak Ahmad",
    });
    expect(await summaryQris()).toEqual({ count: 1, from: TODAY, to: TODAY });
    expect((await unreconciled()).items.map((d) => d.date)).toEqual([TODAY]);

    const remark = await mark(TODAY, { status: "cocok" });
    expect(await json<QrisDay>(remark)).toMatchObject({
      total: 480_000,
      status: "cocok",
      changedAfterMark: false,
    });
    expect(await summaryQris()).toBeNull();
    expect((await unreconciled()).items).toEqual([]);
  });
});

describe("GET /api/owner/qris-days (S7, S11)", () => {
  test("bulan: hari ber-QRIS / ber-batal / bertanda sampai hari ini, terbaru dulu; hari ini closed false; month tidak sah → 422", async () => {
    vi.setSystemTime(wib(2026, 11, 17, 9));
    await loginWithShift();
    mockDb.update((s) => {
      s.sales = [];
      s.qrisDays = {};
    });
    await sell([{ method: "qris", amount: 12_000 }]);
    vi.setSystemTime(wib(2026, 11, 18, 0, 30));
    const gone = await sell([{ method: "qris", amount: 8_000 }]);
    await voidSale(gone.id, { reason: "Salah", qrisRefundSource: "laci" });
    vi.setSystemTime(wib(2026, 11, 19, 9));
    await sell([
      { method: "cash", amount: 30_000 },
      { method: "qris", amount: 20_000 },
    ]);
    vi.setSystemTime(NOW);
    await ownerLogin();
    expect(
      (await mark("2026-11-03", { status: "tidak_cocok", note: "Cek bank" }))
        .status,
    ).toBe(200);

    const list = await month();
    expect(list.month).toBe("2026-11");
    expect(
      list.items.map((d) => [
        d.date,
        d.total,
        d.voidedCount,
        d.status,
        d.closed,
      ]),
    ).toEqual([
      [TODAY, 20_000, 0, "belum", false],
      ["2026-11-18", 0, 1, "belum", true],
      ["2026-11-17", 12_000, 0, "belum", true],
      ["2026-11-03", 0, 0, "tidak_cocok", true],
    ]);
    expect((await month("?month=2026-10")).items).toEqual([]);
    for (const bad of ["2026-13", "2026-1", "nov"]) {
      const res = await get(`${BASE}?month=${bad}`);
      expect(res.status).toBe(422);
      expect(await code(res)).toBe("VALIDATION");
    }
  });

  test("?unreconciled=true: lintas bulan, terlama dulu, month null, sama dengan qrisUnreconciled.count", async () => {
    vi.setSystemTime(wib(2026, 10, 30, 10));
    await loginWithShift();
    mockDb.update((s) => {
      s.qrisSince = "2026-10-30";
    });
    await sell([{ method: "qris", amount: 11_000 }]);
    vi.setSystemTime(wib(2026, 10, 31, 23, 50));
    await sell([{ method: "qris", amount: 22_000 }]);
    vi.setSystemTime(wib(2026, 11, 1, 0, 10));
    await sell([{ method: "qris", amount: 33_000 }]);
    vi.setSystemTime(wib(2026, 11, 2, 10));
    await sell([{ method: "qris", amount: 44_000 }]); // hari ini: tidak dihitung
    await ownerLogin();
    expect((await mark("2026-10-30", { status: "cocok" })).status).toBe(200);

    const list = await unreconciled();
    expect(list.month).toBeNull();
    expect(list.items.map((d) => [d.date, d.total])).toEqual([
      ["2026-10-31", 22_000],
      ["2026-11-01", 33_000],
    ]);
    expect(await summaryQris()).toEqual({
      count: list.items.length,
      from: "2026-10-31",
      to: "2026-11-01",
    });
  });
});

describe("setelan Pencocokan QRIS harian (M-2a 4)", () => {
  test("qrisDailyReconcile false → qrisUnreconciled null; endpoint QRIS harian tetap jalan", async () => {
    await ownerLogin();
    mockDb.update((s) => {
      s.qrisSince = "2026-11-10";
    });
    const before = await unreconciled();
    expect(before.items.length).toBeGreaterThan(0);
    expect((await summaryQris())?.count).toBe(before.items.length);

    mockDb.update((s) => {
      s.attentionRules.qrisDailyReconcile = false;
    });
    expect(await summaryQris()).toBeNull();
    expect(await unreconciled()).toEqual(before);
    const date = before.items[0]?.date ?? "";
    expect((await mark(date, { status: "cocok" })).status).toBe(200);
    expect((await day(date)).status).toBe("cocok");
  });
});
