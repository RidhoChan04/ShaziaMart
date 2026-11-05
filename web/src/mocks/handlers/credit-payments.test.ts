import { beforeEach, describe, expect, test, vi } from "vitest";
import type {
  KasirCreditPayment,
  PrintResult,
  Problem,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { creditPaymentsOf } from "../credit/payments";
import { mockDb } from "../db";
import { setScenario } from "../scenarios";
import {
  customerBalance,
  customerId,
  deepKeys,
  FORBIDDEN_KASIR_KEYS,
  get,
  json,
  login,
  loginWithShift,
  post,
} from "./test-helpers";

/** Kamis 5 Nov 2026 10.00 WIB. */
const NOW = Date.UTC(2026, 10, 5, 3);

const pay = (patch: Record<string, unknown> = {}) =>
  post("/api/credit-payments", {
    id: "pel-1",
    customerId: customerId("Bu Sari"),
    amount: 50_000,
    method: "tunai",
    cashReceived: 100_000,
    print: false,
    ...patch,
  });
const cancel = (id: string, reason: unknown = "Salah pelanggan") =>
  post(`/api/credit-payments/${id}/cancel`, { reason });
const listShift = async () =>
  json<KasirCreditPayment[]>(await get("/api/credit-payments/shift"));
const closeShift = () => post("/api/shifts/current/close", { countedCash: 0 });
const code = async (res: Response) => (await json<Problem>(res)).code;
const detail = async (res: Response) => (await json<Problem>(res)).detail;

const ledgerOf = (paymentId: string) =>
  mockDb
    .get()
    .creditLedger.filter((e) => e.paymentId === paymentId)
    .map((e) => e.amount);
const drawer = () =>
  (mockDb.get().shift?.creditCash ?? []).map((c) => [c.kind, c.amount]);
const stored = (id: string) =>
  mockDb.get().creditPayments.find((p) => p.id === id);
const shiftId = () => mockDb.get().shift?.id;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  await loginWithShift(200_000);
});

describe("createCreditPayment", () => {
  test("Tunai 50.000 diterima 100.000 → 201, kembalian 50.000, sisa 70.000, buku −50.000, laci +50.000, shiftId = shift Rina", async () => {
    const res = await pay();
    expect(res.status).toBe(201);
    const body = await json<KasirCreditPayment>(res);
    expect(body).toEqual({
      id: "pel-1",
      customerId: customerId("Bu Sari"),
      customerName: "Bu Sari",
      amount: 50_000,
      method: "tunai",
      cashReceived: 100_000,
      change: 50_000,
      balanceAfter: 70_000,
      createdAt: NOW,
      kasirName: "Rina",
      shiftId: shiftId(),
      status: "aktif",
      printStatus: "tidak_dicetak",
    });
    expect(customerBalance("Bu Sari")).toBe(70_000);
    expect(ledgerOf("pel-1")).toEqual([-50_000]);
    expect(drawer()).toEqual([["pelunasan", 50_000]]);
    expect(stored("pel-1")).toMatchObject({
      channel: "kasir",
      createdByName: "Rina",
      shiftId: shiftId(),
    });
  });

  test("kirim ulang id sama (isi beda 60.000) → 200 rekaman asli; buku & laci tidak dobel; replay setelah shift ditutup tetap 200", async () => {
    const first = await json<KasirCreditPayment>(await pay());
    vi.setSystemTime(NOW + 60_000);
    const again = await pay({ amount: 60_000, cashReceived: 60_000 });
    expect(again.status).toBe(200);
    expect(await json(again)).toEqual(first);
    expect(ledgerOf("pel-1")).toEqual([-50_000]);
    expect(drawer()).toEqual([["pelunasan", 50_000]]);
    expect(customerBalance("Bu Sari")).toBe(70_000);

    expect((await closeShift()).status).toBe(200);
    await login("123456");
    const late = await pay({ amount: 60_000 });
    expect(late.status).toBe(200);
    expect(await json(late)).toEqual(first);
    expect(ledgerOf("pel-1")).toEqual([-50_000]);
  });

  test("QRIS 20.000 → tanpa baris laci; shiftId terisi; uang diterima & kembalian 0", async () => {
    const res = await pay({
      method: "qris",
      amount: 20_000,
      cashReceived: null,
    });
    expect(res.status).toBe(201);
    expect(await json(res)).toMatchObject({
      method: "qris",
      cashReceived: 0,
      change: 0,
      balanceAfter: 100_000,
      shiftId: shiftId(),
    });
    expect(drawer()).toEqual([]);
    expect(ledgerOf("pel-1")).toEqual([-20_000]);
  });

  test.each([
    [0, "Jumlah minimal Rp1"],
    [120_001, "Melebihi sisa kasbon Rp120.000"],
  ])("jumlah %i → 422 %s", async (amount, message) => {
    const res = await pay({ amount, cashReceived: 200_000 });
    expect(res.status).toBe(422);
    expect(await detail(res)).toBe(message);
    expect(mockDb.get().creditPayments.some((p) => p.id === "pel-1")).toBe(
      false,
    );
    expect(customerBalance("Bu Sari")).toBe(120_000);
  });

  test("pelanggan tanpa kasbon (Mbak Dewi) → 422 Pelanggan ini tidak punya kasbon", async () => {
    const res = await pay({ customerId: customerId("Mbak Dewi") });
    expect(res.status).toBe(422);
    expect(await detail(res)).toBe("Pelanggan ini tidak punya kasbon");
  });

  test("Tunai diterima 40.000 untuk 50.000 → 422; QRIS + cashReceived → 422; metode jalur pemilik → 422 Cara bayar tidak valid", async () => {
    const short = await pay({ cashReceived: 40_000 });
    expect(short.status).toBe(422);
    expect(await detail(short)).toBe("Uang diterima kurang dari jumlah bayar");
    const noCash = await pay({ cashReceived: null });
    expect(noCash.status).toBe(422);
    expect(await detail(noCash)).toBe("Uang diterima kurang dari jumlah bayar");
    const qris = await pay({ method: "qris", cashReceived: 50_000 });
    expect(qris.status).toBe(422);
    for (const method of ["transfer", "titip", "kasbon"]) {
      const res = await pay({ method });
      expect(res.status).toBe(422);
      expect(await detail(res)).toBe("Cara bayar tidak valid");
    }
    expect(mockDb.get().creditPayments.some((p) => p.id === "pel-1")).toBe(
      false,
    );
    expect(drawer()).toEqual([]);
  });

  test.each([
    ["id kosong", { id: "" }],
    ["id 65 karakter", { id: "x".repeat(65) }],
    ["tanpa print", { print: undefined }],
  ])("bentuk salah (%s) → 422", async (_, patch) => {
    expect((await pay(patch)).status).toBe(422);
  });

  test("tanpa shift → 409 SHIFT_CLOSED; tanpa sesi → 401; pelanggan tidak ada → 404; id milik Rina dikirim Budi → 409 ID_TAKEN", async () => {
    expect((await pay({ id: "pel-x", customerId: "tidak-ada" })).status).toBe(
      404,
    );
    expect((await pay()).status).toBe(201);
    expect((await closeShift()).status).toBe(200);

    const anon = await pay({ id: "pel-2" });
    expect(anon.status).toBe(401);

    await login("123456");
    const closed = await pay({ id: "pel-2" });
    expect(closed.status).toBe(409);
    expect(await code(closed)).toBe("SHIFT_CLOSED");

    await login("654321", "Budi");
    const taken = await pay({ amount: 10_000 });
    expect(taken.status).toBe(409);
    expect(await code(taken)).toBe("ID_TAKEN");
    expect(ledgerOf("pel-1")).toEqual([-50_000]);
  });

  test("print true → tercetak; skenario printer-gagal → gagal", async () => {
    expect(await json(await pay({ print: true }))).toMatchObject({
      printStatus: "tercetak",
    });
    setScenario("printer-gagal");
    expect(
      await json(await pay({ id: "pel-2", amount: 10_000, print: true })),
    ).toMatchObject({ printStatus: "gagal" });
  });

  test("respons kasir tanpa key terlarang (FORBIDDEN_KASIR_KEYS + channel, cancelReason, createdById)", async () => {
    const forbidden = [
      ...FORBIDDEN_KASIR_KEYS,
      "channel",
      "cancelReason",
      "createdById",
      "cancelledById",
      "cancelledByName",
      "cancelledChannel",
    ];
    const bodies: unknown[] = [
      await json(await pay()),
      await listShift(),
      await json(await cancel("pel-1")),
      await json(
        await pay({
          id: "pel-2",
          method: "qris",
          amount: 1,
          cashReceived: null,
        }),
      ),
    ];
    const keys = deepKeys(bodies);
    for (const key of forbidden) expect(keys.has(key)).toBe(false);
  });
});

describe("cancelCreditPayment (kasir, ruling R2)", () => {
  test("batal kasir: reason kosong → 422; benar → dibatalkan, buku +50.000, laci −50.000 batal_pelunasan, cancelledByName Rina, cancelledChannel kasir, cancelReason tersimpan; batal ulang 200 tanpa baris baru", async () => {
    await pay();
    for (const reason of ["", "   ", null, "x".repeat(201)]) {
      expect((await cancel("pel-1", reason)).status).toBe(422);
    }
    expect((await post("/api/credit-payments/pel-1/cancel", {})).status).toBe(
      422,
    );
    expect(stored("pel-1")?.cancelledAt).toBeNull();

    vi.setSystemTime(NOW + 60_000);
    const res = await cancel("pel-1", "  Salah pelanggan  ");
    expect(res.status).toBe(200);
    expect(await json(res)).toMatchObject({
      id: "pel-1",
      status: "dibatalkan",
      balanceAfter: 70_000,
    });
    expect(ledgerOf("pel-1")).toEqual([-50_000, 50_000]);
    expect(customerBalance("Bu Sari")).toBe(120_000);
    expect(drawer()).toEqual([
      ["pelunasan", 50_000],
      ["batal_pelunasan", -50_000],
    ]);
    const shift = mockDb.get().shift;
    expect(shift && creditPaymentsOf(shift)).toBe(0);
    expect(stored("pel-1")).toMatchObject({
      cancelledAt: NOW + 60_000,
      cancelledByName: "Rina",
      cancelledChannel: "kasir",
      cancelReason: "Salah pelanggan",
    });

    vi.setSystemTime(NOW + 120_000);
    const again = await cancel("pel-1", "lagi");
    expect(again.status).toBe(200);
    expect(await json(again)).toMatchObject({ status: "dibatalkan" });
    expect(ledgerOf("pel-1")).toEqual([-50_000, 50_000]);
    expect(drawer()).toHaveLength(2);
    expect(stored("pel-1")).toMatchObject({
      cancelledAt: NOW + 60_000,
      cancelReason: "Salah pelanggan",
    });
  });

  test("batal QRIS → buku +jumlah, tanpa baris laci", async () => {
    await pay({ method: "qris", amount: 20_000, cashReceived: null });
    expect((await cancel("pel-1")).status).toBe(200);
    expect(ledgerOf("pel-1")).toEqual([-20_000, 20_000]);
    expect(drawer()).toEqual([]);
  });

  test("batal kasir untuk pelunasan shift A setelah A ditutup & B (Budi) buka → 409 OUTSIDE_SHIFT, tanpa perubahan", async () => {
    await pay();
    await closeShift();
    await login("654321", "Budi");
    expect((await post("/api/shifts", { openingCash: 100_000 })).status).toBe(
      201,
    );
    const before = mockDb.get();
    const res = await cancel("pel-1");
    expect(res.status).toBe(409);
    expect(await code(res)).toBe("OUTSIDE_SHIFT");
    const after = mockDb.get();
    expect(after.creditLedger).toEqual(before.creditLedger);
    expect(after.creditPayments).toEqual(before.creditPayments);
    expect(after.shift?.creditCash).toEqual([]);
  });

  test("pelunasan seed (tanpa shift) → 409 OUTSIDE_SHIFT; tidak dikenal → 404", async () => {
    const seed = mockDb.get().creditPayments[0];
    const res = await cancel(seed?.id ?? "");
    expect(res.status).toBe(409);
    expect(await code(res)).toBe("OUTSIDE_SHIFT");
    expect((await cancel("tidak-ada")).status).toBe(404);
  });

  test("batal kasir tanpa shift buka → 409 SHIFT_CLOSED; tanpa sesi → 401", async () => {
    await pay();
    await closeShift();
    expect((await cancel("pel-1")).status).toBe(401);
    await login("123456");
    const res = await cancel("pel-1");
    expect(res.status).toBe(409);
    expect(await code(res)).toBe("SHIFT_CLOSED");
    expect(stored("pel-1")?.cancelledAt).toBeNull();
  });
});

describe("listShiftCreditPayments (jawaban pemilik J0)", () => {
  test("pelunasan shift yang sedang buka, terbaru dulu, termasuk yang dibatalkan; shift Budi tidak memuat pelunasan shift Rina walau hari sama; tanpa shift → []", async () => {
    await pay();
    vi.setSystemTime(NOW + 60_000);
    await pay({
      id: "pel-2",
      method: "qris",
      amount: 10_000,
      cashReceived: null,
    });
    await cancel("pel-1");
    expect((await listShift()).map((p) => [p.id, p.status])).toEqual([
      ["pel-2", "aktif"],
      ["pel-1", "dibatalkan"],
    ]);

    await closeShift();
    await login("123456");
    expect(await listShift()).toEqual([]);

    await login("654321", "Budi");
    await post("/api/shifts", { openingCash: 100_000 });
    vi.setSystemTime(NOW + 3_600_000);
    await pay({
      id: "pel-3",
      customerId: customerId("Pak Udin"),
      amount: 5_000,
    });
    expect((await listShift()).map((p) => [p.id, p.kasirName])).toEqual([
      ["pel-3", "Budi"],
    ]);
  });

  test("shift lewat tengah malam tetap memuat pelunasan 23.50", async () => {
    await closeShift();
    const late = Date.UTC(2026, 10, 5, 16, 50); // Kamis 5 Nov 23.50 WIB
    vi.setSystemTime(late - 3_600_000);
    await loginWithShift(200_000);
    vi.setSystemTime(late);
    await pay();
    vi.setSystemTime(late + 20 * 60_000); // Jumat 6 Nov 00.10 WIB
    await pay({ id: "pel-2", amount: 1_000 });
    expect((await listShift()).map((p) => [p.id, p.createdAt])).toEqual([
      ["pel-2", late + 20 * 60_000],
      ["pel-1", late],
    ]);
  });

  test("tanpa sesi → 401", async () => {
    await closeShift();
    expect((await get("/api/credit-payments/shift")).status).toBe(401);
  });
});

describe("printCreditPayment", () => {
  test("cetak ulang → printStatus tercetak; skenario printer-gagal → gagal; tidak dikenal → 404", async () => {
    await pay();
    const ok = await post("/api/credit-payments/pel-1/print", {});
    expect(ok.status).toBe(200);
    expect(await json<PrintResult>(ok)).toEqual({ printStatus: "tercetak" });
    expect(stored("pel-1")?.printStatus).toBe("tercetak");
    setScenario("printer-gagal");
    const failed = await post("/api/credit-payments/pel-1/print", {});
    expect(await json<PrintResult>(failed)).toEqual({ printStatus: "gagal" });
    expect(stored("pel-1")?.printStatus).toBe("gagal");
    expect((await post("/api/credit-payments/x/print", {})).status).toBe(404);
  });
});
