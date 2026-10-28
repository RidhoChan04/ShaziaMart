import { describe, expect, test, vi } from "vitest";
import type { Sale } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { newId } from "@/shared/lib/id";
import { mockDb } from "../db";
import { balanceOf as ledgerBalanceOf } from "../ledger";
import {
  cashSale,
  customerBalance,
  customerId,
  json,
  loginWithShift,
  post,
  saleItem,
  voidSale,
} from "./test-helpers";

const GULA = "Gula Pasir";

describe("HPP & buku kasbon", () => {
  const keysOf = async (res: Response): Promise<string[]> => {
    const body: unknown = await res.json();
    return (Array.isArray(body) ? body : [body]).flatMap((o) =>
      Object.keys(o as object),
    );
  };
  const costOfStored = (id: string) =>
    mockDb.get().sales.find((s) => s.id === id)?.costTotal;
  const pinVoid = { ownerPin: "999999", reason: "salah input" };

  test("respons createSale/listTodaySales tidak memuat costTotal", async () => {
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
      await fetch("/api/sales/today"),
      await voidSale(id, pinVoid),
      await voidSale(id, pinVoid),
      await fetch("/api/sales/today"),
    ];
    for (const res of responses) {
      const keys = await keysOf(res);
      expect(keys).toContain("total");
      expect(keys).not.toContain("costTotal");
    }
    expect(costOfStored(id)).toBeGreaterThan(0);
  });

  test("costTotal penjualan contoh = Σ HPP item; batal tidak mengubahnya", async () => {
    await loginWithShift();
    const res = await post("/api/sales", {
      saleId: newId(),
      items: [
        saleItem(GULA, { qtyBase: 1500 }, 18000), // 1500 g × 16.500/kg = 24.750
        saleItem(GULA, { amount: 20000 }, 18000), // 1111 g → 18.331,5 → 18.332
        saleItem("Beras Pandan Wangi 5 kg", { qtyBase: 1 }, 78000), // 71.000
        saleItem("Indomie Goreng", { qtyBase: 40 }, 112000, "dus"), // 104.000
        saleItem("Indomie Goreng", { qtyBase: 3 }, 3100, "pcs"), // 3 × 2.650
      ],
      payments: [{ method: "qris", amount: 246300 }],
      print: false,
    });
    expect(res.status).toBe(201);
    const sale = await json<Sale>(res);
    expect(costOfStored(sale.id)).toBe(24750 + 18332 + 71000 + 104000 + 7950);
    await voidSale(sale.id, pinVoid);
    const stored = mockDb.get().sales.find((s) => s.id === sale.id);
    expect(stored).toMatchObject({ status: "dibatalkan", costTotal: 226032 });
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
      ownerPin: "999999",
    });
    invariant();
    vi.setSystemTime(Date.UTC(2026, 9, 23, 4));
    await voidSale(mixed.id, pinVoid);
    await voidSale(cashOnly.id, pinVoid);
    await voidSale(mixed.id, pinVoid);
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
