import { afterEach, describe, expect, test, vi } from "vitest";
import type {
  CreditLimitProblem,
  PriceChangedProblem,
  Problem,
  Sale,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { newId } from "@/shared/lib/id";
import { mockDb } from "../db";
import { setScenario } from "../scenarios";
import {
  customerId,
  login,
  loginWithShift,
  post,
  unitOf,
} from "./test-helpers";

afterEach(() => {
  vi.useRealTimers();
});

type Qty = { qtyBase: number } | { amount: number };

const item = (
  name: string,
  qty: Qty,
  expectedUnitPrice: number,
  unitName?: string,
) => ({ unitId: unitOf(name, unitName).id, expectedUnitPrice, ...qty });

const BIMOLI = "Minyak Goreng Bimoli 2 L";
const GULA = "Gula Pasir";

/** Bimoli ×n dibayar tunai pas. */
const cashSale = (n = 1, extra: Record<string, unknown> = {}) => ({
  saleId: newId(),
  items: [item(BIMOLI, { qtyBase: n }, 36000)],
  payments: [{ method: "cash", amount: 36000 * n }],
  cashReceived: 36000 * n,
  print: false,
  ...extra,
});

const json = async <T>(res: Response) => (await res.json()) as T;
const stockOf = (name: string) =>
  mockDb.get().stock[unitOf(name).productId] ?? Number.NaN;
const balanceOf = (name: string) =>
  mockDb.get().customers.find((c) => c.name === name)?.balance;
const voidSale = (id: string, body: unknown) =>
  post(`/api/sales/${id}/void`, body);

describe("createSale", () => {
  test("penjualan tunai: total server, kembalian, stok berkurang", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.UTC(2026, 9, 16, 18, 30));
    await loginWithShift();
    const names = [
      "Beras Pandan Wangi 5 kg",
      BIMOLI,
      GULA,
      "Telur Ayam",
      "Indomie Goreng",
      "Kopi Kapal Api 165 g",
    ];
    const before = names.map(stockOf);
    const res = await post("/api/sales", {
      saleId: newId(),
      items: [
        item("Beras Pandan Wangi 5 kg", { qtyBase: 1 }, 78000),
        item(BIMOLI, { qtyBase: 2 }, 36000),
        item(GULA, { qtyBase: 1500 }, 18000),
        item("Telur Ayam", { qtyBase: 1000 }, 29000),
        item("Indomie Goreng", { qtyBase: 40 }, 112000, "dus"),
        item("Kopi Kapal Api 165 g", { qtyBase: 3 }, 14500),
      ],
      payments: [{ method: "cash", amount: 361500 }],
      cashReceived: 400000,
      print: false,
    });
    expect(res.status).toBe(201);
    const sale = await json<Sale>(res);
    expect(sale).toMatchObject({
      number: "20261017-0001",
      createdAt: Date.UTC(2026, 9, 16, 18, 30),
      kasirName: "Rina",
      total: 361500,
      cashReceived: 400000,
      change: 38500,
      customerId: null,
      status: "selesai",
      printStatus: "tidak_dicetak",
    });
    expect(sale.items.map((i) => i.subtotal)).toEqual([
      78000, 72000, 27000, 29000, 112000, 43500,
    ]);
    expect(sale.items[4]).toMatchObject({
      productName: "Indomie Goreng",
      unitName: "dus",
      unitSize: 40,
      qtyBase: 40,
      unitPrice: 112000,
      wholesale: false,
      isCurah: false,
      baseUnit: "pcs",
    });
    const sold = [1, 2, 1500, 1000, 40, 3];
    expect(names.map(stockOf)).toEqual(
      before.map((q, i) => q - (sold[i] ?? Number.NaN)),
    );
    expect(mockDb.get().shift).toMatchObject({
      cashSales: 361500,
      salesCount: 1,
    });
    const second = await json<Sale>(await post("/api/sales", cashSale()));
    expect(second.number).toBe("20261017-0002");
  });

  test("grosir: Indomie pcs ×40 → 2800/pcs, subtotal 112000", async () => {
    await loginWithShift();
    const res = await post("/api/sales", {
      saleId: newId(),
      items: [item("Indomie Goreng", { qtyBase: 40 }, 2800, "pcs")],
      payments: [{ method: "qris", amount: 112000 }],
      print: false,
    });
    expect(res.status).toBe(201);
    const sale = await json<Sale>(res);
    expect(sale.items[0]).toMatchObject({
      unitPrice: 2800,
      subtotal: 112000,
      wholesale: true,
    });
    expect(sale).toMatchObject({ cashReceived: 0, change: 0 });
    expect(mockDb.get().shift).toMatchObject({ cashSales: 0, salesCount: 1 });
  });

  test("saleId sama dikirim dua kali → 200 & hanya satu penjualan", async () => {
    await loginWithShift();
    const before = stockOf(BIMOLI);
    const body = cashSale(2);
    const first = await post("/api/sales", body);
    expect(first.status).toBe(201);
    const created = await json<Sale>(first);
    const replay = await post("/api/sales", body);
    expect(replay.status).toBe(200);
    expect(await json<Sale>(replay)).toEqual(created);
    // Body berbeda dengan saleId sama tetap mengembalikan penjualan lama.
    const different = await post("/api/sales", {
      ...cashSale(5),
      saleId: body.saleId,
    });
    expect(different.status).toBe(200);
    expect(await json<Sale>(different)).toEqual(created);
    const state = mockDb.get();
    expect(state.sales).toHaveLength(1);
    expect(stockOf(BIMOLI)).toBe(before - 2);
    expect(state.shift).toMatchObject({ cashSales: 72000, salesCount: 1 });
  });

  test("nominal curah: amount 20000 gula → qtyBase 1111, subtotal 20000", async () => {
    await loginWithShift();
    const before = stockOf(GULA);
    const res = await post("/api/sales", {
      saleId: newId(),
      items: [item(GULA, { amount: 20000 }, 18000)],
      payments: [{ method: "cash", amount: 20000 }],
      cashReceived: 50000,
      print: false,
    });
    expect(res.status).toBe(201);
    const sale = await json<Sale>(res);
    expect(sale.items[0]).toMatchObject({
      qtyBase: 1111,
      unitPrice: 18000,
      subtotal: 20000,
      isCurah: true,
      baseUnit: "gram",
    });
    expect(sale).toMatchObject({ total: 20000, change: 30000 });
    expect(stockOf(GULA)).toBe(before - 1111);
  });

  test("amount pada barang non-curah → 422 INVALID_QUANTITY", async () => {
    await loginWithShift();
    const res = await post("/api/sales", {
      ...cashSale(),
      items: [item(BIMOLI, { amount: 36000 }, 36000)],
    });
    expect(res.status).toBe(422);
    expect((await json<Problem>(res)).code).toBe("INVALID_QUANTITY");
    expect(mockDb.get().sales).toHaveLength(0);
  });

  test.each([
    ["qtyBase dan amount", { qtyBase: 1000, amount: 18000 }],
    ["tanpa qtyBase/amount", {}],
    ["qtyBase 0", { qtyBase: 0 }],
    ["qtyBase pecahan", { qtyBase: 1.5 }],
    ["amount negatif", { amount: -100 }],
    ["amount terlalu kecil (qtyBase 0)", { amount: 1 }],
    ["qtyBase raksasa", { qtyBase: Number.MAX_SAFE_INTEGER }],
  ])("item tidak valid: %s → 422 INVALID_QUANTITY", async (_, qty) => {
    await loginWithShift();
    const res = await post("/api/sales", {
      ...cashSale(),
      items: [{ unitId: unitOf(GULA).id, expectedUnitPrice: 18000, ...qty }],
    });
    expect(res.status).toBe(422);
    expect((await json<Problem>(res)).code).toBe("INVALID_QUANTITY");
  });

  test("unitId tak dikenal → 422 INVALID_QUANTITY; items kosong → 422 VALIDATION", async () => {
    await loginWithShift();
    const unknown = await post("/api/sales", {
      ...cashSale(),
      items: [{ unitId: "x", qtyBase: 1, expectedUnitPrice: 1 }],
    });
    expect(unknown.status).toBe(422);
    expect((await json<Problem>(unknown)).code).toBe("INVALID_QUANTITY");
    const empty = await post("/api/sales", { ...cashSale(), items: [] });
    expect(empty.status).toBe(422);
    expect((await json<Problem>(empty)).code).toBe("VALIDATION");
  });

  test("harga di klien basi → 409 PRICE_CHANGED (qtyBase grosir & nominal)", async () => {
    await loginWithShift();
    const res = await post("/api/sales", {
      saleId: newId(),
      items: [
        item("Indomie Goreng", { qtyBase: 40 }, 3100, "pcs"),
        item(GULA, { amount: 20000 }, 17000),
        item(BIMOLI, { qtyBase: 1 }, 36000),
      ],
      payments: [{ method: "qris", amount: 168000 }],
      print: false,
    });
    expect(res.status).toBe(409);
    const body = await json<PriceChangedProblem>(res);
    expect(body.code).toBe("PRICE_CHANGED");
    expect(body.changes).toEqual([
      {
        unitId: unitOf("Indomie Goreng", "pcs").id,
        oldUnitPrice: 3100,
        newUnitPrice: 2800,
      },
      { unitId: unitOf(GULA).id, oldUnitPrice: 17000, newUnitPrice: 18000 },
    ]);
    expect(mockDb.get().sales).toHaveLength(0);
  });

  test("harga-berubah: pertama 409 PRICE_CHANGED (+500), kirim ulang dengan harga baru → 201", async () => {
    await loginWithShift();
    setScenario("harga-berubah");
    const body = cashSale();
    const first = await post("/api/sales", body);
    expect(first.status).toBe(409);
    const problem = await json<PriceChangedProblem>(first);
    expect(problem.code).toBe("PRICE_CHANGED");
    expect(problem.changes).toEqual([
      { unitId: unitOf(BIMOLI).id, oldUnitPrice: 36000, newUnitPrice: 36500 },
    ]);
    expect(unitOf(BIMOLI).price).toBe(36500);
    const retry = await post("/api/sales", {
      ...body,
      items: [item(BIMOLI, { qtyBase: 1 }, 36500)],
      payments: [{ method: "cash", amount: 36500 }],
      cashReceived: 36500,
    });
    expect(retry.status).toBe(201);
    expect((await json<Sale>(retry)).total).toBe(36500);
    expect(unitOf(BIMOLI).price).toBe(36500);
  });

  test("kasbon dalam limit → 201, saldo naik; campuran tunai + kasbon", async () => {
    await loginWithShift();
    const res = await post("/api/sales", {
      ...cashSale(),
      payments: [
        { method: "cash", amount: 20000 },
        { method: "credit", amount: 16000 },
      ],
      cashReceived: 50000,
      customerId: customerId("Bu Sari"),
    });
    expect(res.status).toBe(201);
    expect(await json<Sale>(res)).toMatchObject({
      cashReceived: 50000,
      change: 30000,
      customerId: customerId("Bu Sari"),
    });
    expect(balanceOf("Bu Sari")).toBe(136000);
    expect(mockDb.get().shift).toMatchObject({ cashSales: 20000 });
  });

  test("kasbon melebihi limit → 409 CREDIT_LIMIT; ownerPin salah → 401; ownerPin 999999 → 201 & saldo naik", async () => {
    await loginWithShift();
    const body = {
      ...cashSale(),
      payments: [{ method: "credit", amount: 36000 }],
      customerId: customerId("Pak Joko"),
    };
    const blocked = await post("/api/sales", body);
    expect(blocked.status).toBe(409);
    expect(await json<CreditLimitProblem>(blocked)).toMatchObject({
      code: "CREDIT_LIMIT",
      balance: 290000,
      creditLimit: 300000,
      attempted: 36000,
    });
    for (const ownerPin of ["000000", "123456"]) {
      const wrong = await post("/api/sales", { ...body, ownerPin });
      expect(wrong.status).toBe(401);
      expect((await json<Problem>(wrong)).code).toBe("PIN_INVALID");
    }
    expect(balanceOf("Pak Joko")).toBe(290000);
    expect(mockDb.get().sales).toHaveLength(0);
    const ok = await post("/api/sales", { ...body, ownerPin: "999999" });
    expect(ok.status).toBe(201);
    expect(await json<Sale>(ok)).toMatchObject({ cashReceived: 0, change: 0 });
    expect(balanceOf("Pak Joko")).toBe(326000);
  });

  test("kredit tanpa customerId → 422 'Pelanggan wajib dipilih'", async () => {
    await loginWithShift();
    const res = await post("/api/sales", {
      ...cashSale(),
      payments: [{ method: "credit", amount: 36000 }],
    });
    expect(res.status).toBe(422);
    expect(await json<Problem>(res)).toMatchObject({
      code: "VALIDATION",
      detail: "Pelanggan wajib dipilih",
    });
  });

  test("jumlah pembayaran ≠ total → 422", async () => {
    await loginWithShift();
    const res = await post("/api/sales", {
      ...cashSale(),
      payments: [{ method: "cash", amount: 35000 }],
    });
    expect(res.status).toBe(422);
    expect((await json<Problem>(res)).code).toBe("VALIDATION");
  });

  test.each([
    ["lebih dari total", [{ method: "cash", amount: 40000 }], 40000],
    [
      "metode ganda",
      [
        { method: "qris", amount: 18000 },
        { method: "qris", amount: 18000 },
      ],
      undefined,
    ],
    ["metode tak dikenal", [{ method: "debit", amount: 36000 }], undefined],
    [
      "amount 0",
      [
        { method: "cash", amount: 36000 },
        { method: "qris", amount: 0 },
      ],
      36000,
    ],
    ["tanpa pembayaran", [], undefined],
    [
      "tunai tanpa cashReceived",
      [{ method: "cash", amount: 36000 }],
      undefined,
    ],
    ["cashReceived < tunai", [{ method: "cash", amount: 36000 }], 35999],
  ])(
    "pembayaran tidak valid: %s → 422 VALIDATION",
    async (_, payments, cashReceived) => {
      await loginWithShift();
      const res = await post("/api/sales", {
        saleId: newId(),
        items: [item(BIMOLI, { qtyBase: 1 }, 36000)],
        payments,
        ...(cashReceived === undefined ? {} : { cashReceived }),
        print: false,
      });
      expect(res.status).toBe(422);
      expect((await json<Problem>(res)).code).toBe("VALIDATION");
      expect(mockDb.get().sales).toHaveLength(0);
    },
  );

  test("pelanggan tak dikenal → 422", async () => {
    await loginWithShift();
    const res = await post("/api/sales", {
      ...cashSale(),
      payments: [{ method: "credit", amount: 36000 }],
      customerId: "x",
    });
    expect(res.status).toBe(422);
  });

  test("printer-gagal → printStatus gagal; print false → tidak_dicetak", async () => {
    await loginWithShift();
    const normal = await post("/api/sales", cashSale(1, { print: true }));
    expect((await json<Sale>(normal)).printStatus).toBe("tercetak");
    setScenario("printer-gagal");
    const failed = await post("/api/sales", cashSale(1, { print: true }));
    expect((await json<Sale>(failed)).printStatus).toBe("gagal");
    const off = await post("/api/sales", cashSale(1, { print: false }));
    expect((await json<Sale>(off)).printStatus).toBe("tidak_dicetak");
  });

  test("tanpa shift → 409 SHIFT_CLOSED; tanpa sesi → 401", async () => {
    expect((await post("/api/sales", cashSale())).status).toBe(401);
    await login("123456");
    const res = await post("/api/sales", cashSale());
    expect(res.status).toBe(409);
    expect((await json<Problem>(res)).code).toBe("SHIFT_CLOSED");
  });
});

describe("voidSale", () => {
  test("void: tanpa PIN 403, PIN salah 401, benar → dibatalkan & stok kembali", async () => {
    await loginWithShift();
    const before = stockOf(BIMOLI);
    const sale = await json<Sale>(await post("/api/sales", cashSale(2)));
    expect(stockOf(BIMOLI)).toBe(before - 2);

    const noPin = await voidSale(sale.id, { reason: "salah input" });
    expect(noPin.status).toBe(403);
    expect((await json<Problem>(noPin)).code).toBe("PIN_REQUIRED");
    const wrong = await voidSale(sale.id, {
      ownerPin: "000000",
      reason: "salah input",
    });
    expect(wrong.status).toBe(401);
    expect((await json<Problem>(wrong)).code).toBe("PIN_INVALID");
    const noReason = await voidSale(sale.id, {
      ownerPin: "999999",
      reason: " ",
    });
    expect(noReason.status).toBe(422);

    const ok = await voidSale(sale.id, {
      ownerPin: "999999",
      reason: "salah input",
    });
    expect(ok.status).toBe(200);
    expect((await json<Sale>(ok)).status).toBe("dibatalkan");
    expect(stockOf(BIMOLI)).toBe(before);
    expect(mockDb.get().shift).toMatchObject({ cashSales: 0, salesCount: 0 });

    const again = await voidSale(sale.id, {
      ownerPin: "999999",
      reason: "lagi",
    });
    expect(again.status).toBe(200);
    expect((await json<Sale>(again)).status).toBe("dibatalkan");
    expect(stockOf(BIMOLI)).toBe(before);
    expect(mockDb.get().shift).toMatchObject({ cashSales: 0, salesCount: 0 });
  });

  test("void kasbon campuran mengembalikan saldo dan kas", async () => {
    await loginWithShift();
    const sale = await json<Sale>(
      await post("/api/sales", {
        ...cashSale(),
        payments: [
          { method: "cash", amount: 20000 },
          { method: "credit", amount: 16000 },
        ],
        cashReceived: 20000,
        customerId: customerId("Bu Sari"),
      }),
    );
    expect(balanceOf("Bu Sari")).toBe(136000);
    const res = await voidSale(sale.id, { ownerPin: "999999", reason: "x" });
    expect(res.status).toBe(200);
    expect(balanceOf("Bu Sari")).toBe(120000);
    expect(mockDb.get().shift).toMatchObject({ cashSales: 0, salesCount: 0 });
  });

  test("void penjualan shift lalu tidak mengubah kas shift sekarang", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.UTC(2026, 9, 20, 1));
    await loginWithShift();
    const sale = await json<Sale>(await post("/api/sales", cashSale()));
    await post("/api/shifts/current/close", { countedCash: 236000 });
    vi.setSystemTime(Date.UTC(2026, 9, 20, 6));
    await loginWithShift();
    const before = stockOf(BIMOLI);
    const res = await voidSale(sale.id, { ownerPin: "999999", reason: "x" });
    expect(res.status).toBe(200);
    expect(stockOf(BIMOLI)).toBe(before + 1);
    expect(mockDb.get().shift).toMatchObject({ cashSales: 0, salesCount: 0 });
  });

  test("void tanpa sesi → 401; saleId tak dikenal → 404", async () => {
    expect(
      (await voidSale("x", { ownerPin: "999999", reason: "x" })).status,
    ).toBe(401);
    await loginWithShift();
    const res = await voidSale("x", { ownerPin: "999999", reason: "x" });
    expect(res.status).toBe(404);
  });
});

describe("printSale & listTodaySales", () => {
  test("cetak ulang menyimpan printStatus sesuai skenario", async () => {
    await loginWithShift();
    const sale = await json<Sale>(await post("/api/sales", cashSale()));
    setScenario("printer-gagal");
    const failed = await post(`/api/sales/${sale.id}/print`, {});
    expect(failed.status).toBe(200);
    expect(await failed.json()).toEqual({ printStatus: "gagal" });
    expect(mockDb.get().sales[0]?.printStatus).toBe("gagal");
    setScenario("normal");
    const ok = await post(`/api/sales/${sale.id}/print`, {});
    expect(await ok.json()).toEqual({ printStatus: "tercetak" });
    expect(mockDb.get().sales[0]?.printStatus).toBe("tercetak");
    expect((await post("/api/sales/x/print", {})).status).toBe(404);
  });

  test("penjualan hari ini (Asia/Jakarta), terbaru dulu", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.UTC(2026, 9, 16, 16, 59)); // 16 Okt 23.59 WIB
    await loginWithShift();
    await post("/api/sales", cashSale());
    vi.setSystemTime(Date.UTC(2026, 9, 16, 17, 0)); // 17 Okt 00.00 WIB
    const first = await json<Sale>(await post("/api/sales", cashSale()));
    vi.setSystemTime(Date.UTC(2026, 9, 16, 18, 0));
    const second = await json<Sale>(await post("/api/sales", cashSale()));
    expect(first.number).toBe("20261017-0001");
    const res = await fetch("/api/sales/today");
    expect(res.status).toBe(200);
    const today = await json<Sale[]>(res);
    expect(today.map((s) => s.id)).toEqual([second.id, first.id]);
  });

  test("listTodaySales tanpa sesi → 401", async () => {
    expect((await fetch("/api/sales/today")).status).toBe(401);
  });
});
