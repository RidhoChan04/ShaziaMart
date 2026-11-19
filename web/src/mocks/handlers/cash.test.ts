import { beforeEach, describe, expect, test, vi } from "vitest";
import type {
  DrawerExpense,
  OwnerCashTake,
  OwnerDrawerExpense,
  Problem,
  ShiftClosure,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { mockDb } from "../db";
import {
  deepKeys,
  get,
  json,
  login,
  loginWithShift,
  ownerLogin,
  post,
} from "./test-helpers";

const NOW = Date.UTC(2026, 10, 19, 3); // Kamis 19 Nov 2026 10.00 WIB
const EXPENSES = "/api/shifts/current/expenses";
const TAKES = "/api/owner/cash-takes";

const expense = (id: string, amount: number, reason = "Beli es batu") =>
  post(EXPENSES, { id, amount, reason });
const cancelExpense = (id: string, reason = "Salah catat") =>
  post(`${EXPENSES}/${id}/cancel`, { reason });
const ownerCancelExpense = (id: string, reason = "Salah catat") =>
  post(`/api/owner/expenses/${id}/cancel`, { reason });
const takeCash = (id: string, amount: number, note?: string | null) =>
  post(TAKES, note === undefined ? { id, amount } : { id, amount, note });
const cancelTake = (id: string, reason = "Salah ambil") =>
  post(`${TAKES}/${id}/cancel`, { reason });
const close = (countedCash: number) =>
  post("/api/shifts/current/close", { countedCash });
const code = async (res: Response) => (await json<Problem>(res)).code;
const openShiftId = () => {
  const id = mockDb.get().shift?.id;
  if (!id) throw new Error("tanpa shift buka");
  return id;
};
const savedExpense = (id: string) =>
  mockDb.get().drawerExpenses.find((e) => e.id === id);
const savedTake = (id: string) =>
  mockDb.get().cashTakes.find((t) => t.id === id);

/** Key respons kasir untuk kas keluar (allowlist kontrak `DrawerExpense`). */
const KASIR_EXPENSE_KEYS = [
  "amount",
  "at",
  "id",
  "kasirName",
  "reason",
  "shiftId",
  "status",
];

/** Rina tutup shift (modal seed 200.000) lalu Budi masuk; kembali uang fisik shift Rina. */
async function rinaClosesThenBudiLogsIn(counted = 300_000): Promise<void> {
  await loginWithShift();
  expect((await close(counted)).status).toBe(200);
  expect((await login("654321", "Budi")).status).toBe(200);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

describe("kas keluar kasir (S2, K10)", () => {
  test("201 tercatat; replay id sama → 200 rekaman lama tanpa baris kedua", async () => {
    await loginWithShift();
    const res = await expense("kk-1", 15_000, "  Beli es batu  ");
    expect(res.status).toBe(201);
    const saved: DrawerExpense = {
      id: "kk-1",
      at: NOW,
      amount: 15_000,
      reason: "Beli es batu",
      kasirName: "Rina",
      shiftId: openShiftId(),
      status: "aktif",
    };
    expect(await json(res)).toEqual(saved);

    vi.setSystemTime(NOW + 60_000);
    const replay = await expense("kk-1", 99_000, "Lain");
    expect(replay.status).toBe(200);
    expect(await json(replay)).toEqual(saved);
    expect(mockDb.get().drawerExpenses.filter((e) => e.id === "kk-1")).toEqual([
      expect.objectContaining({ createdByName: "Rina", amount: 15_000 }),
    ]);
  });

  test("replay sebelum validasi body: id milik sendiri dengan body tidak sah tetap 200", async () => {
    await loginWithShift();
    expect((await expense("kk-1", 15_000)).status).toBe(201);
    expect((await post(EXPENSES, { id: "kk-1" })).status).toBe(200);
  });

  test("id milik Budi → 409 ID_TAKEN tanpa isi rekaman", async () => {
    await loginWithShift();
    expect((await login("654321", "Budi")).status).toBe(200);
    expect((await expense("kk-budi", 20_000)).status).toBe(201);
    expect((await login("123456")).status).toBe(200);
    const res = await expense("kk-budi", 20_000);
    expect(res.status).toBe(409);
    const body = await json<Problem>(res);
    expect(body.code).toBe("ID_TAKEN");
    expect(body).not.toHaveProperty("amount");
    expect(
      mockDb.get().drawerExpenses.filter((e) => e.id === "kk-budi"),
    ).toHaveLength(1);
  });

  test("tanpa shift buka → 409 SHIFT_CLOSED; tanpa sesi → 401", async () => {
    expect((await expense("kk-1", 15_000)).status).toBe(401);
    expect((await login("123456")).status).toBe(200);
    const res = await expense("kk-1", 15_000);
    expect(res.status).toBe(409);
    expect(await code(res)).toBe("SHIFT_CLOSED");
    expect(savedExpense("kk-1")).toBeUndefined();
  });

  test("422: alasan kosong/kepanjangan, nominal < 1 atau pecahan, id kosong/kepanjangan (sebelum cek shift)", async () => {
    expect((await login("123456")).status).toBe(200);
    // Tanpa shift: validasi lebih dulu.
    expect((await expense("kk-1", 15_000, "   ")).status).toBe(422);
    await loginWithShift();
    const bad = [
      { id: "kk-1", amount: 15_000, reason: "   " },
      { id: "kk-1", amount: 15_000, reason: "x".repeat(201) },
      { id: "kk-1", amount: 15_000 },
      { id: "kk-1", amount: 0, reason: "Beli es batu" },
      { id: "kk-1", amount: 1.5, reason: "Beli es batu" },
      { id: "kk-1", amount: "15000", reason: "Beli es batu" },
      { id: "", amount: 15_000, reason: "Beli es batu" },
      { id: "x".repeat(65), amount: 15_000, reason: "Beli es batu" },
      { amount: 15_000, reason: "Beli es batu" },
    ];
    for (const body of bad) {
      const res = await post(EXPENSES, body);
      expect(res.status, JSON.stringify(body)).toBe(422);
      expect(await code(res)).toBe("VALIDATION");
    }
    expect(mockDb.get().drawerExpenses.filter((e) => e.id === "kk-1")).toEqual(
      [],
    );
    expect((await expense("kk-1", 1, "x".repeat(200))).status).toBe(201);
  });

  test("tutup shift: expenses = Σ kas keluar aktif, expectedCash turun persis", async () => {
    await loginWithShift();
    expect((await expense("kk-1", 15_000)).status).toBe(201);
    expect((await expense("kk-2", 25_000, "Bayar parkir")).status).toBe(201);
    const res = await close(160_000);
    expect(res.status).toBe(200);
    const closure = await json<ShiftClosure>(res);
    expect(closure).toMatchObject({
      openingCash: 200_000,
      expenses: 40_000,
      ownerTakes: 0,
      expectedCash: 160_000,
      difference: 0,
    });
    expect(mockDb.get().closedShifts.at(-1)).toMatchObject({
      expenses: 40_000,
      expectedCash: 160_000,
    });
  });

  test("daftar: shift ini saja, terbaru dulu, termasuk dibatalkan; respons hanya key DrawerExpense", async () => {
    await loginWithShift();
    expect(await json(await get(EXPENSES))).toEqual([]);
    expect((await expense("kk-1", 15_000)).status).toBe(201);
    vi.setSystemTime(NOW + 60_000);
    expect((await expense("kk-2", 25_000, "Bayar parkir")).status).toBe(201);
    expect((await cancelExpense("kk-1")).status).toBe(200);
    mockDb.update((s) => {
      s.drawerExpenses.push({
        ...s.drawerExpenses[0],
        id: "kk-lama",
        shiftId: "shift-lain",
      } as (typeof s.drawerExpenses)[number]);
    });
    const res = await get(EXPENSES);
    expect(res.status).toBe(200);
    const rows = await json<DrawerExpense[]>(res);
    expect(rows.map((r) => [r.id, r.status])).toEqual([
      ["kk-2", "aktif"],
      ["kk-1", "dibatalkan"],
    ]);
    expect([...deepKeys(rows)].sort()).toEqual(KASIR_EXPENSE_KEYS);
  });

  test("daftar: tanpa shift buka → []; tanpa sesi → 401", async () => {
    expect((await get(EXPENSES)).status).toBe(401);
    expect((await login("123456")).status).toBe(200);
    expect(await json(await get(EXPENSES))).toEqual([]);
  });
});

describe("batal kas keluar di kasir (S10)", () => {
  test("shift buka → 200, expenses turun; kedua kali → 200 tanpa perubahan; respons tanpa data pembatal", async () => {
    await loginWithShift();
    expect((await expense("kk-1", 15_000)).status).toBe(201);
    expect((await expense("kk-2", 25_000)).status).toBe(201);
    vi.setSystemTime(NOW + 60_000);
    expect((await login("654321", "Budi")).status).toBe(200);
    const res = await cancelExpense("kk-1", "  Salah nominal ");
    expect(res.status).toBe(200);
    const body = await json<DrawerExpense>(res);
    expect(body).toMatchObject({ id: "kk-1", status: "dibatalkan" });
    expect([...deepKeys(body)].sort()).toEqual(KASIR_EXPENSE_KEYS);
    const cancelled = {
      cancelledAt: NOW + 60_000,
      cancelledByName: "Budi",
      cancelledChannel: "kasir",
      cancelReason: "Salah nominal",
    };
    expect(savedExpense("kk-1")).toMatchObject(cancelled);

    vi.setSystemTime(NOW + 120_000);
    const again = await cancelExpense("kk-1", "Alasan lain");
    expect(again.status).toBe(200);
    expect(await json(again)).toEqual(body);
    expect(savedExpense("kk-1")).toMatchObject(cancelled);

    expect(await json(await close(175_000))).toMatchObject({
      expenses: 25_000,
      expectedCash: 175_000,
      difference: 0,
    });
  });

  test("404 id tidak dikenal; alasan kosong → 422 tanpa perubahan; tanpa sesi → 401", async () => {
    await loginWithShift();
    expect((await expense("kk-1", 15_000)).status).toBe(201);
    expect((await cancelExpense("tidak-ada")).status).toBe(404);
    for (const reason of ["   ", "x".repeat(201)]) {
      const res = await cancelExpense("kk-1", reason);
      expect(res.status).toBe(422);
      expect(await code(res)).toBe("VALIDATION");
    }
    expect(savedExpense("kk-1")?.cancelledAt).toBeNull();
    await post("/api/auth/logout", {});
    expect((await cancelExpense("kk-1")).status).toBe(401);
  });

  test("kas keluar shift lain → 409 OUTSIDE_SHIFT; tanpa shift buka → 409 SHIFT_CLOSED", async () => {
    await loginWithShift();
    expect((await expense("kk-1", 15_000)).status).toBe(201);
    expect((await close(185_000)).status).toBe(200);
    expect((await login("123456")).status).toBe(200);
    const closedRes = await cancelExpense("kk-1");
    expect(closedRes.status).toBe(409);
    expect(await code(closedRes)).toBe("SHIFT_CLOSED");

    expect((await login("654321", "Budi")).status).toBe(200);
    expect((await post("/api/shifts", { openingCash: 185_000 })).status).toBe(
      201,
    );
    const outside = await cancelExpense("kk-1");
    expect(outside.status).toBe(409);
    expect(await code(outside)).toBe("OUTSIDE_SHIFT");
    expect(savedExpense("kk-1")?.cancelledAt).toBeNull();
  });
});

describe("batal kas keluar dari app pemilik (S10)", () => {
  test("kas keluar di shift yang masih buka → 409 IN_OPEN_SHIFT", async () => {
    await loginWithShift();
    expect((await expense("kk-1", 15_000)).status).toBe(201);
    expect((await ownerLogin()).status).toBe(200);
    const res = await ownerCancelExpense("kk-1");
    expect(res.status).toBe(409);
    expect(await code(res)).toBe("IN_OPEN_SHIFT");
    expect(savedExpense("kk-1")?.cancelledAt).toBeNull();
  });

  test("shift tutup → 200; closure tersimpan dan shift buka tidak berubah; kedua kali 200 apa adanya", async () => {
    await loginWithShift();
    expect((await expense("kk-1", 15_000)).status).toBe(201);
    expect((await close(185_000)).status).toBe(200);
    expect((await login("654321", "Budi")).status).toBe(200);
    expect((await post("/api/shifts", { openingCash: 185_000 })).status).toBe(
      201,
    );
    expect((await expense("kk-budi", 5_000)).status).toBe(201);
    const closedBefore = mockDb.get().closedShifts;
    const shiftBefore = mockDb.get().shift;
    expect((await ownerLogin()).status).toBe(200);

    vi.setSystemTime(NOW + 60_000);
    const res = await ownerCancelExpense("kk-1", " Ternyata uang pribadi ");
    expect(res.status).toBe(200);
    const body = await json<OwnerDrawerExpense>(res);
    expect(body).toEqual({
      id: "kk-1",
      at: NOW,
      amount: 15_000,
      reason: "Beli es batu",
      kasirName: "Rina",
      shiftId: expect.any(String),
      status: "dibatalkan",
      cancelled: {
        at: NOW + 60_000,
        byName: "Pak Ahmad",
        reason: "Ternyata uang pribadi",
        channel: "pemilik",
      },
      cancellable: false,
    });
    expect(mockDb.get().closedShifts).toEqual(closedBefore);
    expect(mockDb.get().shift).toEqual(shiftBefore);

    const again = await ownerCancelExpense("kk-1", "Lain");
    expect(again.status).toBe(200);
    expect(await json(again)).toEqual(body);

    // Laci shift Budi tidak tersentuh: hanya kas keluar Budi sendiri.
    expect(await json(await close(180_000))).toMatchObject({
      expenses: 5_000,
      expectedCash: 180_000,
    });
  });

  test("404, alasan kosong → 422, tanpa sesi pemilik → 401", async () => {
    await loginWithShift();
    expect((await expense("kk-1", 15_000)).status).toBe(201);
    expect((await close(185_000)).status).toBe(200);
    expect((await ownerCancelExpense("kk-1")).status).toBe(401);
    expect((await ownerLogin()).status).toBe(200);
    expect((await ownerCancelExpense("tidak-ada")).status).toBe(404);
    const res = await ownerCancelExpense("kk-1", "  ");
    expect(res.status).toBe(422);
    expect(await code(res)).toBe("VALIDATION");
    expect(savedExpense("kk-1")?.cancelledAt).toBeNull();
  });
});

describe("ambil uang dari laci (S5, K9)", () => {
  test("shift buka 100.000 → ownerTakes 100.000 di tutup shift", async () => {
    await loginWithShift();
    expect((await ownerLogin()).status).toBe(200);
    const res = await takeCash("am-1", 100_000, "Untuk belanja stok");
    expect(res.status).toBe(201);
    expect(await json(res)).toEqual({
      id: "am-1",
      at: NOW,
      amount: 100_000,
      note: "Untuk belanja stok",
      shiftId: openShiftId(),
      shiftKasirName: "Rina",
      consumedByKasirName: null,
      cancelled: null,
      cancellable: true,
    } satisfies OwnerCashTake);
    expect(await json(await close(100_000))).toMatchObject({
      ownerTakes: 100_000,
      expectedCash: 100_000,
      difference: 0,
    });
  });

  test("batal sebelum tutup → ownerTakes 0; batal setelah tutup → 409 CASH_TAKE_LOCKED", async () => {
    await loginWithShift();
    expect((await ownerLogin()).status).toBe(200);
    expect((await takeCash("am-1", 100_000)).status).toBe(201);
    expect((await takeCash("am-2", 30_000)).status).toBe(201);
    vi.setSystemTime(NOW + 60_000);
    const res = await cancelTake("am-1", " Salah nominal ");
    expect(res.status).toBe(200);
    expect(await json<OwnerCashTake>(res)).toMatchObject({
      cancelled: {
        at: NOW + 60_000,
        byName: "Pak Ahmad",
        reason: "Salah nominal",
      },
      cancellable: false,
    });
    expect(await json(await close(170_000))).toMatchObject({
      ownerTakes: 30_000,
      expectedCash: 170_000,
    });

    const before = savedTake("am-2");
    const locked = await cancelTake("am-2");
    expect(locked.status).toBe(409);
    expect(await code(locked)).toBe("CASH_TAKE_LOCKED");
    expect(savedTake("am-2")).toEqual(before);
    // Sudah dibatalkan → 200 apa adanya walau shift-nya sudah tutup.
    expect((await cancelTake("am-1")).status).toBe(200);
  });

  test("di sela shift: saran turun, batal → naik lagi; terpakai shift berikutnya → 409", async () => {
    await rinaClosesThenBudiLogsIn(300_000);
    expect((await ownerLogin()).status).toBe(200);
    const res = await takeCash("am-1", 50_000);
    expect(res.status).toBe(201);
    expect(await json<OwnerCashTake>(res)).toMatchObject({
      shiftId: null,
      shiftKasirName: null,
      consumedByKasirName: null,
      cancellable: true,
    });
    const suggestion = async () =>
      json<{ suggestedCash: number }>(
        await get("/api/shifts/opening-suggestion"),
      );
    expect(await suggestion()).toMatchObject({
      suggestedCash: 250_000,
      ownerTakes: 50_000,
    });
    expect((await cancelTake("am-1")).status).toBe(200);
    expect(await suggestion()).toMatchObject({
      suggestedCash: 300_000,
      ownerTakes: 0,
    });

    expect((await takeCash("am-2", 50_000)).status).toBe(201);
    expect((await post("/api/shifts", { openingCash: 250_000 })).status).toBe(
      201,
    );
    expect(savedTake("am-2")?.consumedByShiftId).toBe(openShiftId());
    // Yang sudah dibatalkan tidak ditandai terpakai.
    expect(savedTake("am-1")?.consumedByShiftId).toBeNull();
    const locked = await cancelTake("am-2");
    expect(locked.status).toBe(409);
    expect(await code(locked)).toBe("CASH_TAKE_LOCKED");
    expect(savedTake("am-2")?.cancelledAt).toBeNull();

    const replay = await takeCash("am-2", 1);
    expect(replay.status).toBe(200);
    expect(await json<OwnerCashTake>(replay)).toMatchObject({
      amount: 50_000,
      shiftId: null,
      consumedByKasirName: "Budi",
      cancellable: false,
    });
  });

  test("idempoten per (pembuat, id): replay → 200 rekaman lama; id pengguna lain → 409 ID_TAKEN", async () => {
    await loginWithShift();
    expect((await ownerLogin()).status).toBe(200);
    const first = await json<OwnerCashTake>(await takeCash("am-1", 100_000));
    const replay = await takeCash("am-1", 5_000, "Lain");
    expect(replay.status).toBe(200);
    expect(await json(replay)).toEqual(first);
    expect(mockDb.get().cashTakes.filter((t) => t.id === "am-1")).toHaveLength(
      1,
    );
    expect(await json(await close(100_000))).toMatchObject({
      ownerTakes: 100_000,
    });

    mockDb.update((s) => {
      s.cashTakes.push({
        ...s.cashTakes[0],
        id: "am-lain",
        createdById: "pengguna-lain",
      } as (typeof s.cashTakes)[number]);
    });
    const taken = await takeCash("am-lain", 5_000);
    expect(taken.status).toBe(409);
    expect(await code(taken)).toBe("ID_TAKEN");
  });

  test("replay id yang sudah dibatalkan → 200 berstatus dibatalkan", async () => {
    await loginWithShift();
    expect((await ownerLogin()).status).toBe(200);
    expect((await takeCash("am-1", 100_000)).status).toBe(201);
    expect((await cancelTake("am-1")).status).toBe(200);
    const replay = await takeCash("am-1", 100_000);
    expect(replay.status).toBe(200);
    expect((await json<OwnerCashTake>(replay)).cancelled).not.toBeNull();
  });

  test("422: amount 0/pecahan, catatan > 200, id kosong; catatan kosong disimpan null; tanpa sesi → 401", async () => {
    expect((await takeCash("am-1", 50_000)).status).toBe(401);
    expect((await ownerLogin()).status).toBe(200);
    const bad = [
      { id: "am-1", amount: 0 },
      { id: "am-1", amount: 1.5 },
      { id: "am-1" },
      { id: "am-1", amount: 50_000, note: "x".repeat(201) },
      { id: "am-1", amount: 50_000, note: 5 },
      { id: "", amount: 50_000 },
      { id: "x".repeat(65), amount: 50_000 },
    ];
    for (const body of bad) {
      const res = await post(TAKES, body);
      expect(res.status, JSON.stringify(body)).toBe(422);
      expect(await code(res)).toBe("VALIDATION");
    }
    expect(savedTake("am-1")).toBeUndefined();
    const ok = await takeCash("am-1", 50_000, "   ");
    expect(ok.status).toBe(201);
    expect((await json<OwnerCashTake>(ok)).note).toBeNull();
    expect((await takeCash("am-2", 1, "x".repeat(200))).status).toBe(201);
  });

  test("batal: 404, alasan kosong → 422 tanpa perubahan, tanpa sesi → 401", async () => {
    await loginWithShift();
    expect((await cancelTake("am-1")).status).toBe(401);
    expect((await ownerLogin()).status).toBe(200);
    expect((await takeCash("am-1", 50_000)).status).toBe(201);
    expect((await cancelTake("tidak-ada")).status).toBe(404);
    const res = await cancelTake("am-1", "  ");
    expect(res.status).toBe(422);
    expect(await code(res)).toBe("VALIDATION");
    expect(savedTake("am-1")?.cancelledAt).toBeNull();
  });
});
