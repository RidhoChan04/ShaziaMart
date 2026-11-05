import { beforeEach, describe, expect, test, vi } from "vitest";
import type {
  OwnerCustomer,
  OwnerCustomerList,
  Problem,
  Sale,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { DAY_MS } from "@/shared/lib/business-day";
import { creditPaymentsOf } from "../credit/payments";
import { mockDb } from "../db";
import { appendCredit } from "../ledger";
import { ownerTodaySummary } from "../owner-summary";
import {
  cashSale,
  customerBalance,
  customerId,
  get,
  json,
  login,
  loginWithShift,
  ownerLogin,
  post,
  put,
  voidSale,
} from "./test-helpers";

/** Kamis 5 Nov 2026 10.00 WIB. */
const NOW = Date.UTC(2026, 10, 5, 3);

const list = async () =>
  json<OwnerCustomerList>(await get("/api/owner/customers"));
const detail = async (name: string) =>
  json<OwnerCustomer>(await get(`/api/owner/customers/${customerId(name)}`));
const ownerPay = (name: string, body: Record<string, unknown>) =>
  post(`/api/owner/customers/${customerId(name)}/payments`, {
    id: "own-1",
    amount: 100_000,
    method: "transfer",
    ...body,
  });
const ownerCancel = (id: string, reason: unknown = "Salah catat") =>
  post(`/api/owner/credit-payments/${id}/cancel`, { reason });
const kasirPay = (patch: Record<string, unknown> = {}) =>
  post("/api/credit-payments", {
    id: "pel-1",
    customerId: customerId("Bu Sari"),
    amount: 50_000,
    method: "tunai",
    cashReceived: 50_000,
    print: false,
    ...patch,
  });
const code = async (res: Response) => (await json<Problem>(res)).code;
const ledgerOf = (paymentId: string) =>
  mockDb
    .get()
    .creditLedger.filter((e) => e.paymentId === paymentId)
    .map((e) => e.amount);
const stored = (id: string) =>
  mockDb.get().creditPayments.find((p) => p.id === id);

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  expect((await ownerLogin()).status).toBe(200);
});

describe("listOwnerCustomers", () => {
  test("daftar: semua pelanggan urut saldo desc lalu nama; ages 3 entri (0–7, 8–30, >30) dengan count & total; overdueCount = attention.overdueCredit.count; ageDays Bu Tini 45", async () => {
    const body = await list();
    expect(
      body.customers.map((c) => [c.name, c.balance, c.ageDays, c.age]),
    ).toEqual([
      ["Bu Tini", 640_000, 45, "lebih_30_hari"],
      ["Pak Joko", 290_000, 12, "hari_8_30"],
      ["Bu Sari", 120_000, 40, "lebih_30_hari"],
      ["Pak Udin", 50_000, 35, "lebih_30_hari"],
      ["Mbak Dewi", 0, null, null],
    ]);
    expect(body.customers[0]).toEqual({
      id: customerId("Bu Tini"),
      name: "Bu Tini",
      phone: "081234500005",
      balance: 640_000,
      creditLimit: 1_000_000,
      oldestUnpaidAt: NOW - 45 * DAY_MS,
      ageDays: 45,
      age: "lebih_30_hari",
    });
    expect(body.customers[4]?.oldestUnpaidAt).toBeNull();
    expect(body.ages).toEqual([
      { age: "hari_0_7", count: 0, total: 0 },
      { age: "hari_8_30", count: 1, total: 290_000 },
      { age: "lebih_30_hari", count: 3, total: 810_000 },
    ]);
    expect([body.totalBalance, body.debtorCount, body.overdueCount]).toEqual([
      1_100_000, 4, 3,
    ]);
    expect(body.overdueCount).toBe(
      ownerTodaySummary(mockDb.get(), NOW).attention.overdueCredit.count,
    );
  });

  test("saldo sama → urut nama; kasbon hari ini masuk 0–7 hari", async () => {
    mockDb.update((s) => {
      appendCredit(s, {
        customerId: customerId("Pak Udin"),
        amount: 70_000,
        at: NOW,
        saleId: null,
        paymentId: null,
      });
      s.customers.push({
        id: "baru",
        name: "Bu Ani",
        phone: "081200000000",
        balance: 0,
        creditLimit: 500_000,
      });
      appendCredit(s, {
        customerId: "baru",
        amount: 120_000,
        at: NOW - 1,
        saleId: null,
        paymentId: null,
      });
    });
    const body = await list();
    expect(body.customers.map((c) => c.name).slice(2, 5)).toEqual([
      "Bu Ani",
      "Bu Sari",
      "Pak Udin",
    ]);
    expect(body.customers.find((c) => c.name === "Bu Ani")).toMatchObject({
      ageDays: 1,
      age: "hari_0_7",
    });
    expect(body.ages[0]).toEqual({ age: "hari_0_7", count: 1, total: 120_000 });
  });

  test("(jawaban pemilik Q8) pelanggan saldo −60.000: age/ageDays/oldestUnpaidAt null, tidak masuk totalBalance, debtorCount, ages, overdueCount; tetap ada di customers", async () => {
    mockDb.update((s) => {
      const dewi = customerId("Mbak Dewi");
      appendCredit(s, {
        customerId: dewi,
        amount: 100_000,
        at: NOW - 40 * DAY_MS,
        saleId: "s1",
        paymentId: null,
      });
      appendCredit(s, {
        customerId: dewi,
        amount: -60_000,
        at: NOW - 39 * DAY_MS,
        saleId: null,
        paymentId: "px",
      });
      appendCredit(s, {
        customerId: dewi,
        amount: -100_000,
        at: NOW - DAY_MS,
        saleId: "s1",
        paymentId: null,
      });
    });
    const body = await list();
    expect(body.customers.at(-1)).toMatchObject({
      name: "Mbak Dewi",
      balance: -60_000,
      oldestUnpaidAt: null,
      ageDays: null,
      age: null,
    });
    expect([body.totalBalance, body.debtorCount, body.overdueCount]).toEqual([
      1_100_000, 4, 3,
    ]);
    expect(body.ages.reduce((a, g) => a + g.count, 0)).toBe(4);
    expect(body.overdueCount).toBe(
      ownerTodaySummary(mockDb.get(), NOW).attention.overdueCredit.count,
    );
  });

  test("tanpa sesi pemilik → 401 (sesi kasir tidak cukup)", async () => {
    await post("/api/owner/logout", {});
    await login("123456");
    expect((await get("/api/owner/customers")).status).toBe(401);
    expect(
      (await get(`/api/owner/customers/${customerId("Bu Tini")}`)).status,
    ).toBe(401);
    expect((await ownerPay("Bu Sari", {})).status).toBe(401);
  });
});

describe("getOwnerCustomer", () => {
  test("detail Bu Tini: riwayat terbaru dulu, kasbon seed tanpa struk, pelunasan seed Tunai jalur kasir", async () => {
    const body = await detail("Bu Tini");
    expect(body).toMatchObject({
      name: "Bu Tini",
      balance: 640_000,
      ageDays: 45,
      age: "lebih_30_hari",
    });
    expect(
      body.history.map((h) => [h.kind, h.amount, (NOW - h.at) / DAY_MS]),
    ).toEqual([
      ["kasbon", 140_000, 9],
      ["pelunasan", 300_000, 38],
      ["kasbon", 500_000, 45],
      ["kasbon", 300_000, 70],
    ]);
    expect(body.history[0]).toMatchObject({
      saleId: null,
      saleNumber: null,
      kasirName: null,
      payment: null,
      cancelled: null,
    });
    const seedPayment = mockDb
      .get()
      .creditPayments.find((p) => p.customerId === customerId("Bu Tini"));
    expect(body.history[1]).toEqual({
      id: seedPayment?.id,
      at: NOW - 38 * DAY_MS,
      kind: "pelunasan",
      amount: 300_000,
      saleId: null,
      saleNumber: null,
      kasirName: null,
      payment: {
        id: seedPayment?.id,
        channel: "kasir",
        method: "tunai",
        byName: "Rina",
        cashReceived: 300_000,
        change: 0,
        inOpenShift: false,
      },
      cancelled: null,
    });
  });

  test("kasbon dari penjualan membawa nomor struk & kasir; batal jual dilipat ke barisnya dengan pembatal & alasan dari penjualan (ruling R4)", async () => {
    await loginWithShift();
    const sale = await json<Sale>(
      await post("/api/sales", {
        ...cashSale(),
        payments: [{ method: "credit", amount: 36_000 }],
        cashReceived: 0,
        customerId: customerId("Bu Sari"),
      }),
    );
    vi.setSystemTime(NOW + 60_000);
    expect((await voidSale(sale.id, { reason: "Salah" })).status).toBe(200);
    const body = await detail("Bu Sari");
    expect(body.balance).toBe(120_000);
    expect(body.history).toHaveLength(3);
    expect(body.history[0]).toMatchObject({
      kind: "kasbon",
      amount: 36_000,
      at: NOW,
      saleId: sale.id,
      saleNumber: sale.number,
      kasirName: "Rina",
      payment: null,
      cancelled: {
        at: NOW + 60_000,
        byName: "Rina",
        reason: "Salah",
        channel: "kasir",
      },
    });
  });

  test("tidak dikenal → 404", async () => {
    expect((await get("/api/owner/customers/tidak-ada")).status).toBe(404);
  });
});

describe("createOwnerCreditPayment", () => {
  test("Transfer 100.000 saat shift buka → 201, tanpa baris laci, channel pemilik; tunai → 422 Cara bayar tidak valid; replay 200", async () => {
    await loginWithShift();
    const res = await ownerPay("Bu Sari", {});
    expect(res.status).toBe(201);
    const body = await json<OwnerCustomer>(res);
    expect(body).toMatchObject({ name: "Bu Sari", balance: 20_000 });
    expect(body.history[0]).toMatchObject({
      id: "own-1",
      kind: "pelunasan",
      amount: 100_000,
      at: NOW,
      payment: {
        channel: "pemilik",
        method: "transfer",
        byName: "Pak Ahmad",
        cashReceived: 0,
        change: 0,
        inOpenShift: false,
      },
      cancelled: null,
    });
    expect(stored("own-1")).toMatchObject({
      channel: "pemilik",
      method: "transfer",
      shiftId: null,
      printStatus: "tidak_dicetak",
      balanceAfter: 20_000,
    });
    expect(mockDb.get().shift?.creditCash).toEqual([]);
    expect(ledgerOf("own-1")).toEqual([-100_000]);

    for (const method of ["tunai", "qris"]) {
      const bad = await ownerPay("Bu Sari", { id: `own-${method}`, method });
      expect(bad.status).toBe(422);
      expect((await json<Problem>(bad)).detail).toBe("Cara bayar tidak valid");
    }

    vi.setSystemTime(NOW + 60_000);
    const replay = await ownerPay("Bu Sari", { amount: 5_000 });
    expect(replay.status).toBe(200);
    expect((await json<OwnerCustomer>(replay)).balance).toBe(20_000);
    expect(ledgerOf("own-1")).toEqual([-100_000]);
  });

  test("Tunai ke pemilik tanpa shift; jumlah > sisa → 422; id milik kasir → 409 ID_TAKEN", async () => {
    const ok = await ownerPay("Pak Udin", { method: "titip", amount: 50_000 });
    expect(ok.status).toBe(201);
    expect(customerBalance("Pak Udin")).toBe(0);
    const over = await ownerPay("Bu Sari", { id: "own-2", amount: 120_001 });
    expect(over.status).toBe(422);
    expect((await json<Problem>(over)).detail).toBe(
      "Melebihi sisa kasbon Rp120.000",
    );
    await loginWithShift();
    await kasirPay();
    const taken = await ownerPay("Bu Sari", { id: "pel-1" });
    expect(taken.status).toBe(409);
    expect(await code(taken)).toBe("ID_TAKEN");
    const unknown = await post("/api/owner/customers/x/payments", {
      id: "own-9",
      amount: 1,
      method: "transfer",
    });
    expect(unknown.status).toBe(404);
  });
});

describe("cancelOwnerCreditPayment", () => {
  test("batal pemilik: pelunasan kasir di shift yang masih buka → 409 IN_OPEN_SHIFT; setelah shift ditutup → dibatalkan, TANPA baris laci di shift mana pun, cancelledChannel pemilik", async () => {
    await loginWithShift();
    await kasirPay();
    const open = await ownerCancel("pel-1");
    expect(open.status).toBe(409);
    expect(await code(open)).toBe("IN_OPEN_SHIFT");
    expect(stored("pel-1")?.cancelledAt).toBeNull();
    const inOpen = (await detail("Bu Sari")).history[0];
    expect(inOpen?.payment?.inOpenShift).toBe(true);

    await post("/api/shifts/current/close", { countedCash: 250_000 });
    const closedBefore = mockDb.get().closedShifts;
    await login("654321", "Budi");
    await post("/api/shifts", { openingCash: 100_000 });

    vi.setSystemTime(NOW + 60_000);
    const res = await ownerCancel("pel-1", "  Uang dikembalikan  ");
    expect(res.status).toBe(200);
    const body = await json<OwnerCustomer>(res);
    expect(body.balance).toBe(120_000);
    expect(body.history[0]).toMatchObject({
      id: "pel-1",
      payment: { channel: "kasir", inOpenShift: false },
      cancelled: {
        at: NOW + 60_000,
        byName: "Pak Ahmad",
        reason: "Uang dikembalikan",
        channel: "pemilik",
      },
    });
    expect(ledgerOf("pel-1")).toEqual([-50_000, 50_000]);
    const after = mockDb.get();
    expect(after.shift?.creditCash).toEqual([]);
    expect(after.shift && creditPaymentsOf(after.shift)).toBe(0);
    expect(after.closedShifts).toEqual(closedBefore);
    expect(stored("pel-1")).toMatchObject({
      cancelledChannel: "pemilik",
      cancelledByName: "Pak Ahmad",
    });

    const again = await ownerCancel("pel-1");
    expect(again.status).toBe(200);
    expect(ledgerOf("pel-1")).toEqual([-50_000, 50_000]);
  });

  test("batal pemilik pelunasan Transfer → buku +jumlah, umur kembali; reason kosong → 422; tidak dikenal → 404", async () => {
    await ownerPay("Bu Tini", { amount: 500_000 });
    expect(
      (await list()).customers.find((c) => c.name === "Bu Tini"),
    ).toMatchObject({ balance: 140_000, ageDays: 9 });
    expect((await ownerCancel("own-1", "")).status).toBe(422);
    expect((await ownerCancel("own-1", " ")).status).toBe(422);
    const res = await ownerCancel("own-1");
    expect(res.status).toBe(200);
    expect(await json<OwnerCustomer>(res)).toMatchObject({
      balance: 640_000,
      ageDays: 45,
    });
    expect(ledgerOf("own-1")).toEqual([-500_000, 500_000]);
    expect((await ownerCancel("tidak-ada")).status).toBe(404);
  });

  test("pelunasan jalur pemilik tidak bisa dibatalkan/dicetak dari kasir (404)", async () => {
    await ownerPay("Bu Sari", {});
    await loginWithShift();
    expect(
      (await post("/api/credit-payments/own-1/cancel", { reason: "x" })).status,
    ).toBe(404);
    expect((await post("/api/credit-payments/own-1/print", {})).status).toBe(
      404,
    );
  });
});

describe("setOwnerCustomerCreditLimit", () => {
  const setLimit = (name: string, creditLimit: unknown) =>
    put(`/api/owner/customers/${customerId(name)}/credit-limit`, {
      creditLimit,
    });

  test("limit −1 → 422 Limit harus bilangan bulat minimal 0; 0 → tersimpan; di bawah saldo boleh", async () => {
    for (const bad of [-1, 1.5, "100000", null]) {
      const res = await setLimit("Bu Sari", bad);
      expect(res.status).toBe(422);
      expect((await json<Problem>(res)).detail).toBe(
        "Limit harus bilangan bulat minimal 0",
      );
    }
    const zero = await setLimit("Bu Sari", 0);
    expect(zero.status).toBe(200);
    expect(await json<OwnerCustomer>(zero)).toMatchObject({
      creditLimit: 0,
      balance: 120_000,
    });
    const below = await setLimit("Bu Tini", 100_000);
    expect((await json<OwnerCustomer>(below)).creditLimit).toBe(100_000);
    expect(
      mockDb.get().customers.find((c) => c.name === "Bu Tini")?.creditLimit,
    ).toBe(100_000);
    expect(
      (await put("/api/owner/customers/x/credit-limit", { creditLimit: 0 }))
        .status,
    ).toBe(404);
  });
});
