import { beforeEach, describe, expect, test, vi } from "vitest";
import type {
  OpeningMismatchProblem,
  OpeningSuggestion,
  Problem,
  ShiftClosure,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { drawerTotals } from "../cash/drawer";
import { mockDb } from "../db";
import {
  get,
  json,
  login,
  loginWithShift,
  ownerLogin,
  post,
} from "./test-helpers";

const NOW = Date.UTC(2026, 10, 19, 3); // Kamis 19 Nov 2026 10.00 WIB
const SUGGESTION = "/api/shifts/opening-suggestion";

const open = (openingCash: number, openingNote?: unknown) =>
  post(
    "/api/shifts",
    openingNote === undefined ? { openingCash } : { openingCash, openingNote },
  );
const close = (countedCash: number) =>
  post("/api/shifts/current/close", { countedCash });
const takeCash = (id: string, amount: number) =>
  post("/api/owner/cash-takes", { id, amount });
const suggestion = async () => json<OpeningSuggestion>(await get(SUGGESTION));
const shiftNote = () => {
  const s = mockDb.get().shift;
  return (
    s && { suggestedOpening: s.suggestedOpening, openingNote: s.openingNote }
  );
};

/** Rina buka (saran seed 200.000), tutup dengan uang fisik `counted`, lalu Budi masuk. */
async function afterRinaCloses(counted = 300_000): Promise<void> {
  await loginWithShift();
  vi.setSystemTime(NOW + 3_600_000);
  expect((await close(counted)).status).toBe(200);
  vi.setSystemTime(NOW + 2 * 3_600_000);
  expect((await login("654321", "Budi")).status).toBe(200);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

describe("saran modal (S4, K8)", () => {
  test("tanpa sesi → 401; seed → 200.000; respons hanya key OpeningSuggestion", async () => {
    expect((await get(SUGGESTION)).status).toBe(401);
    expect((await login("123456")).status).toBe(200);
    const body = await suggestion();
    expect(body.suggestedCash).toBe(200_000);
    expect(Object.keys(body).sort()).toEqual([
      "lastClosedAt",
      "lastCountedCash",
      "lastKasirName",
      "ownerTakes",
      "suggestedCash",
    ]);
  });

  test("tutup 300.000 lalu pemilik ambil 50.000 di sela → saran 250.000", async () => {
    await afterRinaCloses(300_000);
    expect((await ownerLogin()).status).toBe(200);
    expect((await takeCash("am-1", 50_000)).status).toBe(201);
    expect(await suggestion()).toEqual({
      suggestedCash: 250_000,
      lastKasirName: "Rina",
      lastClosedAt: NOW + 3_600_000,
      lastCountedCash: 300_000,
      ownerTakes: 50_000,
    });
  });

  test("ambil 400.000 setelah tutup 300.000 → saran dijepit 0 (K22)", async () => {
    await afterRinaCloses(300_000);
    expect((await ownerLogin()).status).toBe(200);
    expect((await takeCash("am-1", 400_000)).status).toBe(201);
    expect(await suggestion()).toMatchObject({
      suggestedCash: 0,
      ownerTakes: 400_000,
    });
  });
});

describe("buka shift dengan saran (S4, K8, K22)", () => {
  async function suggested250k(): Promise<void> {
    await afterRinaCloses(300_000);
    expect((await ownerLogin()).status).toBe(200);
    expect((await takeCash("am-1", 50_000)).status).toBe(201);
  }

  test("modal = saran tanpa catatan → 201; tersimpan suggestedOpening, openingNote null; respons tanpa data serah terima", async () => {
    await suggested250k();
    const res = await open(250_000);
    expect(res.status).toBe(201);
    expect(Object.keys(await json<object>(res)).sort()).toEqual([
      "id",
      "kasirId",
      "kasirName",
      "openedAt",
      "openingCash",
    ]);
    expect(shiftNote()).toEqual({
      suggestedOpening: 250_000,
      openingNote: null,
    });
    expect(
      mockDb.get().cashTakes.find((t) => t.id === "am-1")?.consumedByShiftId,
    ).toBe(mockDb.get().shift?.id);
  });

  test("modal = saran dengan catatan → 201, catatan disimpan null", async () => {
    await suggested250k();
    expect((await open(250_000, "Catatan tidak perlu")).status).toBe(201);
    expect(shiftNote()).toEqual({
      suggestedOpening: 250_000,
      openingNote: null,
    });
  });

  test("modal ≠ saran tanpa catatan → 422 OPENING_MISMATCH + suggestedCash; dengan catatan → 201 tersimpan", async () => {
    await suggested250k();
    for (const note of [undefined, null, "   "]) {
      const res = await open(240_000, note);
      expect(res.status).toBe(422);
      const body = await json<OpeningMismatchProblem>(res);
      expect(body).toMatchObject({
        status: 422,
        code: "OPENING_MISMATCH",
        suggestedCash: 250_000,
        detail: "Isi alasan bila modal berbeda dari Rp250.000",
      });
    }
    expect(mockDb.get().shift).toBeNull();
    expect(
      mockDb.get().cashTakes.find((t) => t.id === "am-1")?.consumedByShiftId,
    ).toBeNull();

    const res = await open(240_000, "  Uang receh kurang  ");
    expect(res.status).toBe(201);
    expect(shiftNote()).toEqual({
      suggestedOpening: 250_000,
      openingNote: "Uang receh kurang",
    });
    expect(await json(await close(240_000))).toMatchObject({
      openingCash: 240_000,
    });
    expect(mockDb.get().closedShifts.at(-1)).toMatchObject({
      kasirName: "Budi",
      suggestedOpening: 250_000,
      openingNote: "Uang receh kurang",
    });
  });

  test("pemilik mengambil uang di antara GET saran dan POST → server memakai saran baru (Review Focus 2)", async () => {
    await suggested250k();
    expect((await suggestion()).suggestedCash).toBe(250_000);
    expect((await takeCash("am-2", 50_000)).status).toBe(201);
    const res = await open(250_000);
    expect(res.status).toBe(422);
    expect(await json<OpeningMismatchProblem>(res)).toMatchObject({
      code: "OPENING_MISMATCH",
      suggestedCash: 200_000,
    });
    expect((await open(200_000)).status).toBe(201);
    expect(
      mockDb
        .get()
        .cashTakes.filter((t) => t.id === "am-1" || t.id === "am-2")
        .map((t) => t.consumedByShiftId),
    ).toEqual([mockDb.get().shift?.id, mockDb.get().shift?.id]);
  });

  test("tanpa shift tutup sebelumnya → saran null, modal bebas tanpa catatan, catatan diabaikan", async () => {
    mockDb.update((s) => {
      s.closedShifts = [];
      s.cashTakes = [];
    });
    expect((await login("123456")).status).toBe(200);
    expect(await suggestion()).toEqual({
      suggestedCash: null,
      lastKasirName: null,
      lastClosedAt: null,
      lastCountedCash: null,
      ownerTakes: 0,
    });
    expect((await open(123_000, "Catatan")).status).toBe(201);
    expect(shiftNote()).toEqual({ suggestedOpening: null, openingNote: null });
  });

  test("422 VALIDATION: catatan > 200 atau bukan string (sebelum SHIFT_ALREADY_OPEN); shift sudah buka → 409 sebelum OPENING_MISMATCH", async () => {
    await loginWithShift();
    for (const note of ["x".repeat(201), 5]) {
      const res = await open(200_000, note);
      expect(res.status).toBe(422);
      expect((await json<Problem>(res)).code).toBe("VALIDATION");
    }
    const res = await open(1);
    expect(res.status).toBe(409);
    expect((await json<Problem>(res)).code).toBe("SHIFT_ALREADY_OPEN");
  });
});

describe("tutup shift memakai drawerTotals (rumus tunggal)", () => {
  test("closure = drawerTotals saat tutup + uang fisik; kas keluar & ambil uang ikut", async () => {
    await loginWithShift();
    expect(
      (
        await post("/api/shifts/current/expenses", {
          id: "kk-1",
          amount: 15_000,
          reason: "Beli es batu",
        })
      ).status,
    ).toBe(201);
    expect((await ownerLogin()).status).toBe(200);
    expect((await takeCash("am-1", 100_000)).status).toBe(201);
    const state = mockDb.get();
    const shift = state.shift;
    if (!shift) throw new Error("tanpa shift");
    const totals = drawerTotals(state, shift);
    expect(totals).toMatchObject({
      expenses: 15_000,
      ownerTakes: 100_000,
      expectedCash: 85_000,
    });
    const res = await close(80_000);
    expect(res.status).toBe(200);
    expect(await json<ShiftClosure>(res)).toEqual({
      ...totals,
      shiftId: shift.id,
      countedCash: 80_000,
      difference: -5_000,
      salesCount: 0,
    });
    expect(mockDb.get().closedShifts.at(-1)).toMatchObject({
      ...totals,
      kasirId: shift.kasirId,
      suggestedOpening: 200_000,
      openingNote: null,
    });
  });
});
