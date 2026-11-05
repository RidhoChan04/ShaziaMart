import { describe, expect, test, vi } from "vitest";
import type { Sale } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { newId } from "@/shared/lib/id";
import { mockDb } from "../db";
import { balanceOf as ledgerBalanceOf } from "../ledger";
import {
  cashSale,
  customerBalance,
  customerId,
  deepKeys,
  FORBIDDEN_KASIR_KEYS,
  get,
  json,
  loginWithShift,
  post,
  saleItem,
  voidSale,
} from "./test-helpers";

const GULA = "Gula Pasir";
const KOPI = "Kopi Kapal Api 165 g";

describe("HPP & buku kasbon", () => {
  const keysOf = async (res: Response): Promise<string[]> => {
    const body: unknown = await res.json();
    return (Array.isArray(body) ? body : [body]).flatMap((o) =>
      Object.keys(o as object),
    );
  };
  const costOfStored = (id: string) =>
    mockDb.get().sales.find((s) => s.id === id)?.costTotal;
  const reasonVoid = { reason: "salah input" };
  /** (koreksi mockup M1) penjualan berbagian QRIS wajib memilih cara pengembalian. */
  const qrisVoid = { ...reasonVoid, qrisRefundSource: "pemilik" };

  test("respons createSale/listShiftSales/void tidak memuat costTotal & voidedAt", async () => {
    await loginWithShift();
    const body = {
      ...cashSale(),
      payments: [
        { method: "cash", amount: 20000 },
        { method: "credit", amount: 16000 },
      ],
      cashReceived: 20000,
      customerId: customerId("Bu Sari"),
    };
    const created = await post("/api/sales", body);
    const { id } = (await created.clone().json()) as Sale;
    const responses = [
      created,
      await post("/api/sales", body),
      await fetch("/api/sales/shift"),
      await voidSale(id, reasonVoid),
      await voidSale(id, reasonVoid),
      await fetch("/api/sales/shift"),
    ];
    for (const res of responses) {
      const keys = await keysOf(res);
      expect(keys).toContain("total");
      expect(keys).not.toContain("costTotal");
      expect(keys).not.toContain("voidedAt");
    }
    expect(costOfStored(id)).toBeGreaterThan(0);
  });

  test("costTotal penjualan contoh = Σ HPP item; batal tidak mengubahnya", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.UTC(2026, 9, 23, 2));
    await loginWithShift();
    const res = await post("/api/sales", {
      saleId: newId(),
      items: [
        saleItem(GULA, { qtyBase: 1500 }, 18000), // 16.500 × 1500 ÷ 1000 = 24.750
        saleItem(GULA, { amount: 20000 }, 18000), // 1111 g → 18.331,5 → 18.332
        saleItem("Beras Pandan Wangi 5 kg", { qtyBase: 1 }, 78000), // 71.000
        saleItem("Indomie Goreng", { qtyBase: 40 }, 112000, "dus"), // 104.000 × 40 ÷ 40
        saleItem("Indomie Goreng", { qtyBase: 3 }, 3100, "pcs"), // 104.000 × 3 ÷ 40 = 7.800
      ],
      payments: [{ method: "qris", amount: 246300 }],
      print: false,
    });
    expect(res.status).toBe(201);
    const sale = await json<Sale>(res);
    expect(costOfStored(sale.id)).toBe(225882);
    expect(costOfStored(sale.id)).toBe(24750 + 18332 + 71000 + 104000 + 7800);
    expect(mockDb.get().sales.find((s) => s.id === sale.id)?.voidedAt).toBe(
      null,
    );
    vi.setSystemTime(Date.UTC(2026, 9, 23, 4));
    const voided = await voidSale(sale.id, qrisVoid);
    expect(await keysOf(voided)).not.toContain("voidedAt");
    const stored = mockDb.get().sales.find((s) => s.id === sale.id);
    expect(stored).toMatchObject({
      status: "dibatalkan",
      costTotal: 225882,
      voidedAt: Date.UTC(2026, 9, 23, 4),
    });
    // Batal kedua tidak menggeser waktu batal.
    vi.setSystemTime(Date.UTC(2026, 9, 23, 5));
    await voidSale(sale.id, qrisVoid);
    expect(mockDb.get().sales.find((s) => s.id === sale.id)?.voidedAt).toBe(
      Date.UTC(2026, 9, 23, 4),
    );
  });

  test("(K10) penjualan baru menyimpan lineCosts sejajar items; HPP berubah setelahnya tidak mengubah lineCosts/costTotal", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.UTC(2026, 9, 23, 2));
    await loginWithShift();
    // Kopi tanpa HPP → null; costTotal tetap Σ dengan null = 0.
    mockDb.update((s) => {
      const kopi = s.products.find((p) => p.name === KOPI);
      if (kopi) kopi.cost = null;
    });
    const sale = await json<Sale>(
      await post("/api/sales", {
        saleId: newId(),
        items: [
          saleItem(GULA, { qtyBase: 1500 }, 18000), // 24.750
          saleItem(KOPI, { qtyBase: 2 }, 14500), // HPP kosong
          saleItem("Indomie Goreng", { qtyBase: 3 }, 3100, "pcs"), // 7.800
        ],
        payments: [{ method: "qris", amount: 27000 + 29000 + 9300 }],
        print: false,
      }),
    );
    const stored = () => mockDb.get().sales.find((s) => s.id === sale.id);
    expect(stored()).toMatchObject({
      lineCosts: [24750, null, 7800],
      costTotal: 24750 + 7800,
    });
    // HPP diubah setelah penjualan: salinan di penjualan tidak ikut berubah.
    mockDb.update((s) => {
      for (const p of s.products) p.cost = { amount: 1, qtyBase: 1 };
    });
    expect(stored()).toMatchObject({
      lineCosts: [24750, null, 7800],
      costTotal: 32550,
    });
  });

  test("(K10) respons createSale/listShiftSales/lookupSales/void tidak memuat lineCosts (kedalaman mana pun)", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.UTC(2026, 9, 23, 2));
    await loginWithShift();
    const body = cashSale();
    const created = await post("/api/sales", body);
    const { id } = (await created.clone().json()) as Sale;
    expect(mockDb.get().sales.find((s) => s.id === id)?.lineCosts).toEqual([
      expect.any(Number),
    ]);
    const lookup = await get("/api/sales/lookup?q=20261022");
    const responses = [
      created,
      await post("/api/sales", body),
      await fetch("/api/sales/shift"),
      lookup,
      await voidSale(id, reasonVoid),
      await voidSale(id, reasonVoid),
    ];
    const lookupRows: unknown = await lookup.clone().json();
    expect(Array.isArray(lookupRows) && lookupRows.length > 0).toBe(true);
    for (const res of responses) {
      expect(res.ok).toBe(true);
      const keys = deepKeys(await res.json());
      expect(keys).toContain("total");
      for (const key of FORBIDDEN_KASIR_KEYS) expect(keys).not.toContain(key);
    }
  });

  test("kasbon menambah ledger; batal menambah entri negatif; balance = Σ ledger", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(Date.UTC(2026, 9, 23, 2));
    await loginWithShift();
    const seedEntries = mockDb.get().creditLedger.length;
    const sari = customerId("Bu Sari");
    const joko = customerId("Pak Joko");
    const invariant = () => {
      const s = mockDb.get();
      for (const c of s.customers) {
        expect(c.balance).toBe(ledgerBalanceOf(s, c.id));
      }
    };
    const mixed = await json<Sale>(
      await post("/api/sales", {
        ...cashSale(),
        payments: [
          { method: "cash", amount: 20000 },
          { method: "credit", amount: 16000 },
        ],
        cashReceived: 20000,
        customerId: sari,
      }),
    );
    invariant();
    const cashOnly = await json<Sale>(
      await post("/api/sales", { ...cashSale(), customerId: joko }),
    );
    await post("/api/sales", {
      ...cashSale(),
      payments: [{ method: "credit", amount: 36000 }],
      customerId: joko,
      creditLimitReason: "langganan lama",
    });
    invariant();
    vi.setSystemTime(Date.UTC(2026, 9, 23, 4));
    await voidSale(mixed.id, reasonVoid);
    await voidSale(cashOnly.id, reasonVoid);
    await voidSale(mixed.id, reasonVoid);
    invariant();
    const added = mockDb
      .get()
      .creditLedger.slice(seedEntries)
      .map(({ customerId: c, amount, at, saleId }) => [c, amount, at, saleId]);
    expect(added).toEqual([
      [sari, 16000, Date.UTC(2026, 9, 23, 2), mixed.id],
      [joko, 36000, Date.UTC(2026, 9, 23, 2), expect.any(String)],
      [sari, -16000, Date.UTC(2026, 9, 23, 4), mixed.id],
    ]);
    expect([customerBalance("Bu Sari"), customerBalance("Pak Joko")]).toEqual([
      120000, 326000,
    ]);
  });
});
