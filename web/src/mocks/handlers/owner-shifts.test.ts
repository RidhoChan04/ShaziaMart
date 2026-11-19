import { beforeEach, describe, expect, test, vi } from "vitest";
import type {
  OpeningSuggestion,
  OwnerShiftDetail,
  OwnerShiftList,
  Problem,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { jakartaIsoDate } from "@/shared/lib/business-day";
import { newId } from "@/shared/lib/id";
import { drawerTotals } from "../cash/drawer";
import { mockDb } from "../db";
import {
  cashSale,
  customerId,
  get,
  json,
  login,
  loginWithShift,
  ownerLogin,
  post,
  saleItem,
} from "./test-helpers";

/** Jam dinding WIB → epoch UTC. */
const wib = (y: number, m: number, d: number, h: number, min = 0) =>
  Date.UTC(y, m - 1, d, h - 7, min);

const TODAY = "2026-11-19";
const BASE = "/api/owner/shifts";

const at = (h: number, min = 0) => vi.setSystemTime(wib(2026, 11, 19, h, min));
const expense = (id: string, amount: number, reason = "Beli es batu") =>
  post("/api/shifts/current/expenses", { id, amount, reason });
const take = (id: string, amount: number, note: string | null = null) =>
  post("/api/owner/cash-takes", { id, amount, note });
const close = (countedCash: number) =>
  post("/api/shifts/current/close", { countedCash });
const list = async (query = "") =>
  json<OwnerShiftList>(await get(`${BASE}${query}`));
const detail = async (id: string) =>
  json<OwnerShiftDetail>(await get(`${BASE}/${id}`));
const code = async (res: Response) => (await json<Problem>(res)).code;
const ok = async (res: Promise<Response>, status = 201) =>
  expect((await res).status).toBe(status);

/**
 * Hari ini: Rina 07.00–13.00 (jual tunai, kas keluar 15.000, pemilik ambil 50.000 di dalam shift,
 * tutup 300.000); pemilik ambil 100.000 di sela 13.02; Budi buka 13.05 (masih buka): jual campuran
 * tunai + QRIS, pelunasan QRIS, kas keluar aktif & batal, ambil uang aktif & batal.
 */
async function twoShiftsToday(): Promise<{ rina: string; budi: string }> {
  at(7);
  await loginWithShift();
  await ownerLogin();
  const rina = mockDb.get().shift?.id ?? "";
  at(8);
  await ok(post("/api/sales", cashSale(2)));
  at(9);
  await ok(expense("kk-r1", 15_000));
  at(10);
  await ok(take("ambil-r1", 50_000, "Setor bank"));
  at(13);
  await ok(close(300_000), 200);
  at(13, 2);
  await ok(take("ambil-sela", 100_000, "Setoran"));
  at(13, 5);
  expect((await login("654321", "Budi")).status).toBe(200);
  const suggestion = await json<OpeningSuggestion>(
    await get("/api/shifts/opening-suggestion"),
  );
  await ok(post("/api/shifts", { openingCash: suggestion.suggestedCash }));
  const budi = mockDb.get().shift?.id ?? "";
  at(13, 10);
  await ok(
    post("/api/sales", {
      saleId: newId(),
      items: [saleItem("Gula Pasir", { amount: 50_000 }, 18000)],
      payments: [
        { method: "cash", amount: 30_000 },
        { method: "qris", amount: 20_000 },
      ],
      cashReceived: 30_000,
      print: false,
    }),
  );
  at(13, 20);
  await ok(
    post("/api/credit-payments", {
      id: "pel-q",
      customerId: customerId("Bu Sari"),
      amount: 15_000,
      method: "qris",
      cashReceived: null,
      print: false,
    }),
  );
  at(13, 30);
  await ok(expense("kk-b1", 10_000, "Beli plastik"));
  at(13, 40);
  await ok(expense("kk-b2", 5_000, "Salah ketik"));
  await ok(
    post("/api/shifts/current/expenses/kk-b2/cancel", { reason: "Salah" }),
    200,
  );
  at(14);
  await ok(take("ambil-b1", 30_000));
  at(14, 10);
  await ok(take("ambil-b2", 20_000));
  await ok(
    post("/api/owner/cash-takes/ambil-b2/cancel", { reason: "Salah ambil" }),
    200,
  );
  at(15);
  return { rina, budi };
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  at(7);
});

describe("GET /api/owner/shifts", () => {
  test("hari ini: shift buka (difference null) + shift tutup, openedAt terbaru dulu; takes = ambil uang sela; openKasirName", async () => {
    const { rina, budi } = await twoShiftsToday();
    const state = mockDb.get();
    const closed = state.closedShifts.find((c) => c.shiftId === rina);
    if (!closed) throw new Error("shift Rina belum tutup");

    const body = await list();
    expect(body).toMatchObject({ date: TODAY, openKasirName: "Budi" });
    expect(body.items).toEqual([
      {
        id: budi,
        kasirName: "Budi",
        openedAt: wib(2026, 11, 19, 13, 5),
        closedAt: null,
        countedCash: null,
        difference: null,
      },
      {
        id: rina,
        kasirName: "Rina",
        openedAt: wib(2026, 11, 19, 7),
        closedAt: wib(2026, 11, 19, 13),
        countedCash: 300_000,
        difference: closed.difference,
      },
    ]);
    expect(body.takes).toEqual([
      {
        id: "ambil-sela",
        at: wib(2026, 11, 19, 13, 2),
        amount: 100_000,
        note: "Setoran",
        shiftId: null,
        shiftKasirName: null,
        consumedByKasirName: "Budi",
        cancelled: null,
        cancellable: false,
      },
    ]);
    expect(await list(`?date=${TODAY}`)).toEqual(body);
  });

  test("tanggal riwayat: shift tutup seed hari itu urut openedAt terbaru dulu; shift buka hari ini tidak ikut", async () => {
    await loginWithShift();
    await ownerLogin();
    const date = "2026-11-17";
    const expected = mockDb
      .get()
      .closedShifts.filter((c) => jakartaIsoDate(c.openedAt) === date)
      .sort((a, b) => b.openedAt - a.openedAt)
      .map((c) => ({
        id: c.shiftId,
        kasirName: c.kasirName,
        openedAt: c.openedAt,
        closedAt: c.closedAt,
        countedCash: c.countedCash,
        difference: c.difference,
      }));
    expect(expected.length).toBeGreaterThan(1);
    const body = await list(`?date=${date}`);
    expect(body.items).toEqual(expected);
    expect(body.openKasirName).toBe("Rina");
    expect(
      body.takes.every(
        (t) => t.shiftId === null && jakartaIsoDate(t.at) === date,
      ),
    ).toBe(true);
  });

  test("shift yang dibuka kemarin dan masih buka tampil di hari ini dan di kemarin", async () => {
    vi.setSystemTime(wib(2026, 11, 18, 22));
    await loginWithShift();
    const id = mockDb.get().shift?.id;
    at(9);
    await ownerLogin();
    expect((await list()).items[0]).toMatchObject({ id, closedAt: null });
    expect((await list("?date=2026-11-18")).items[0]).toMatchObject({
      id,
      closedAt: null,
    });
  });

  test("tanpa shift buka → openKasirName null; tanggal tidak sah → 422; tanpa sesi pemilik → 401", async () => {
    expect((await get(BASE)).status).toBe(401);
    await ownerLogin();
    expect((await list()).openKasirName).toBeNull();
    for (const bad of ["2026-02-30", "19-11-2026", "x"]) {
      const res = await get(`${BASE}?date=${bad}`);
      expect(res.status).toBe(422);
      expect(await code(res)).toBe("VALIDATION");
    }
  });
});

describe("GET /api/owner/shifts/{shiftId}", () => {
  test("shift buka = drawerTotals sekarang; kas keluar & ambil uang lengkap termasuk yang dibatalkan, urut jam; QRIS shift", async () => {
    const { budi } = await twoShiftsToday();
    const state = mockDb.get();
    const shift = state.shift;
    if (!shift) throw new Error("tanpa shift buka");
    const totals = drawerTotals(state, shift);
    expect(totals).toMatchObject({
      openingCash: 200_000,
      cashSales: 30_000,
      expenses: 10_000,
      ownerTakes: 30_000,
      expectedCash: 190_000,
    });

    const body = await detail(budi);
    expect(body).toMatchObject({
      shiftId: budi,
      ...totals,
      countedCash: null,
      difference: null,
      salesCount: 1,
      kasirName: "Budi",
      openedAt: wib(2026, 11, 19, 13, 5),
      closedAt: null,
      suggestedOpening: 200_000,
      openingNote: null,
      qrisSales: 20_000,
      qrisRepayments: 15_000,
    });
    expect(
      body.expenseItems.map((e) => [e.id, e.status, e.cancelled?.channel]),
    ).toEqual([
      ["kk-b1", "aktif", undefined],
      ["kk-b2", "dibatalkan", "kasir"],
    ]);
    expect(body.expenseItems.every((e) => !e.cancellable)).toBe(true);
    expect(
      body.ownerTakeItems.map((t) => [
        t.id,
        t.cancelled?.reason,
        t.cancellable,
      ]),
    ).toEqual([
      ["ambil-b1", undefined, true],
      ["ambil-b2", "Salah ambil", false],
    ]);
    expect(Object.keys(body).sort()).toEqual(
      [
        "shiftId",
        "openingCash",
        "cashSales",
        "supplierPayments",
        "creditPayments",
        "saleRefunds",
        "expenses",
        "ownerTakes",
        "expectedCash",
        "countedCash",
        "difference",
        "salesCount",
        "kasirName",
        "openedAt",
        "closedAt",
        "suggestedOpening",
        "openingNote",
        "expenseItems",
        "ownerTakeItems",
        "qrisSales",
        "qrisRepayments",
      ].sort(),
    );
  });

  test("shift tutup = angka closure tersimpan, tidak dihitung ulang walau kas keluarnya dibatalkan pemilik", async () => {
    const { rina } = await twoShiftsToday();
    const closed = mockDb.get().closedShifts.find((c) => c.shiftId === rina);
    if (!closed) throw new Error("shift Rina belum tutup");
    const { kasirId: _k, ...stored } = closed;
    await ok(
      post("/api/owner/expenses/kk-r1/cancel", { reason: "Dobel catat" }),
      200,
    );

    const body = await detail(rina);
    expect(body).toMatchObject({
      ...stored,
      expenses: 15_000,
      ownerTakes: 50_000,
      qrisSales: 0,
      qrisRepayments: 0,
    });
    expect(body.expenseItems).toEqual([
      expect.objectContaining({
        id: "kk-r1",
        status: "dibatalkan",
        cancelled: expect.objectContaining({
          channel: "pemilik",
          reason: "Dobel catat",
        }),
        cancellable: false,
      }),
    ]);
    expect(body.ownerTakeItems).toEqual([
      expect.objectContaining({
        id: "ambil-r1",
        note: "Setor bank",
        shiftKasirName: "Rina",
        cancellable: false,
      }),
    ]);
  });

  test("id tidak dikenal → 404; tanpa sesi pemilik → 401", async () => {
    expect((await get(`${BASE}/tidak-ada`)).status).toBe(401);
    await ownerLogin();
    const res = await get(`${BASE}/tidak-ada`);
    expect(res.status).toBe(404);
    expect(await code(res)).toBe("NOT_FOUND");
  });
});
