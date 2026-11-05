import { describe, expect, test } from "vitest";
import * as rules from "./sale-rules";
import {
  type CheckedPayments,
  creditGate,
  type PricedItem,
  priceChanges,
  saleCost,
  saleLineCosts,
} from "./sale-rules";
import { createSeedState } from "./seed-data";

const priced = (
  unitId: string,
  expectedUnitPrice: number,
  unitPrice: number,
): PricedItem => ({
  productId: `p-${unitId}`,
  expectedUnitPrice,
  normalPrice: unitPrice + 200,
  wholesaleTiers: [{ minQty: 5, price: unitPrice - 100 }],
  item: {
    unitId,
    productName: unitId,
    unitName: "kg",
    isCurah: true,
    baseUnit: "gram",
    unitSize: 1000,
    qtyBase: 1000,
    unitPrice,
    subtotal: unitPrice,
    wholesale: false,
  },
});

test.each([
  ["tidak ada yang berubah", [priced("gula", 18000, 18000)], []],
  [
    "dua baris satuan sama → satu perubahan",
    [
      priced("gula", 18000, 18500),
      priced("gula", 18000, 18500),
      priced("beras", 13000, 13000),
    ],
    [
      {
        unitId: "gula",
        oldUnitPrice: 18000,
        newUnitPrice: 18500,
        newNormalPrice: 18700,
        newWholesaleTiers: [{ minQty: 5, price: 18400 }],
      },
    ],
  ],
  [
    "dua satuan berbeda → dua perubahan",
    [priced("gula", 18000, 18500), priced("beras", 13000, 13500)],
    [
      {
        unitId: "gula",
        oldUnitPrice: 18000,
        newUnitPrice: 18500,
        newNormalPrice: 18700,
        newWholesaleTiers: [{ minQty: 5, price: 18400 }],
      },
      {
        unitId: "beras",
        oldUnitPrice: 13000,
        newUnitPrice: 13500,
        newNormalPrice: 13700,
        newWholesaleTiers: [{ minQty: 5, price: 13400 }],
      },
    ],
  ],
])("priceChanges: %s", (_name, items, expected) => {
  expect(priceChanges(items)).toEqual(expected);
});

test("saleCost: Σ round_half_up(HPP × qtyBase); satuan nonaktif tetap dihitung; HPP kosong / satuan tak dikenal = 0", () => {
  const { products } = createSeedState();
  const find = (code: string) => {
    const p = products.find((x) => x.storeCode === code);
    if (!p) throw new Error(code);
    return p;
  };
  const indomie = find("1001");
  const kopi = find("1004");
  const line = (unitId: string, qtyBase: number, unitSize = 1) => ({
    ...priced(unitId, 0, 0).item,
    unitSize,
    qtyBase,
  });
  const [pcs, dus] = indomie.units;
  if (!pcs || !dus) throw new Error("Indomie tanpa satuan");
  dus.active = false;
  kopi.cost = null;
  expect(
    saleCost(products, [
      line(pcs.id, 3), // 104.000 × 3 ÷ 40 = 7.800
      line(pcs.id, 1), // 2.600
      line(dus.id, 80, 40), // 208.000
      line(kopi.units[0]?.id ?? "", 5), // HPP kosong
      line("tidak-ada", 2),
    ]),
  ).toBe(7800 + 2600 + 208000);
  indomie.cost = { amount: 1001, qtyBase: 2 };
  expect(saleCost(products, [line(pcs.id, 1)])).toBe(501); // 500,5 → 501
});

test("(K10) saleLineCosts per baris; HPP kosong → null; Σ (null = 0) = saleCost", () => {
  const { products } = createSeedState();
  const unitOf = (code: string) => {
    const p = products.find((x) => x.storeCode === code);
    const unit = p?.units[0];
    if (!p || !unit) throw new Error(code);
    return { p, unit };
  };
  const indomie = unitOf("1001");
  const kopi = unitOf("1004");
  kopi.p.cost = null;
  const line = (unitId: string, qtyBase: number) => ({
    ...priced(unitId, 0, 0).item,
    unitSize: 1,
    qtyBase,
  });
  const items = [line(indomie.unit.id, 5), line(kopi.unit.id, 2)];
  // 104.000 × 5 ÷ 40 = 13.000; Kopi tanpa HPP → null (bukan 0).
  expect(saleLineCosts(products, items)).toEqual([13_000, null]);
  expect(saleCost(products, items)).toBe(13_000);
  // Satuan tak dikenal → null; urutan sejajar items; daftar kosong → [].
  expect(
    saleLineCosts(products, [line("tidak-ada", 1), line(indomie.unit.id, 1)]),
  ).toEqual([null, 2600]);
  expect(saleLineCosts(products, [])).toEqual([]);
});

describe("creditGate (ruling R3: limit = batas peringatan, alasan wajib)", () => {
  const paid = (balance: number, credit: number): CheckedPayments => ({
    payments: [{ method: "credit", amount: credit }],
    cash: 0,
    credit,
    cashReceived: 0,
    change: 0,
    customer: {
      id: "c1",
      name: "Pak Joko",
      phone: "0812",
      balance,
      creditLimit: 500_000,
    },
  });

  test("dalam limit → tanpa catatan; alasan yang terkirim diabaikan", () => {
    expect(creditGate(paid(480_000, 20_000), undefined)).toEqual({
      creditOverLimit: null,
    });
    expect(creditGate(paid(480_000, 20_000), "hajatan")).toEqual({
      creditOverLimit: null,
    });
  });

  test("lewat limit tanpa alasan / alasan spasi / bukan string → limit (409 CREDIT_LIMIT)", () => {
    for (const reason of [undefined, "", "   ", 5, null]) {
      expect(creditGate(paid(490_000, 20_000), reason)).toEqual({
        limit: { balance: 490_000, creditLimit: 500_000, attempted: 20_000 },
      });
    }
  });

  test("lewat limit dengan alasan → excess = min(attempted, balance + attempted − limit), alasan di-trim", () => {
    expect(creditGate(paid(490_000, 20_000), "  hajatan ")).toEqual({
      creditOverLimit: { excess: 10_000, reason: "hajatan" },
    });
    // Sudah di atas limit: hanya bagian kasbon ini yang dihitung (tanpa dobel).
    expect(creditGate(paid(510_000, 20_000), "lagi")).toEqual({
      creditOverLimit: { excess: 20_000, reason: "lagi" },
    });
    // (Q8) saldo minus (lebih bayar) memotong dulu.
    expect(creditGate(paid(-40_000, 550_000), "x")).toEqual({
      creditOverLimit: { excess: 10_000, reason: "x" },
    });
  });

  test("(fix 1) alasan > 200 karakter ditolak walau dalam limit (kontrak maxLength tanpa syarat)", () => {
    expect(creditGate(paid(480_000, 20_000), "x".repeat(201))).toEqual({
      code: "VALIDATION",
      detail: "Alasan maksimal 200 karakter",
    });
    expect(creditGate(paid(480_000, 20_000), ` ${"x".repeat(200)} `)).toEqual({
      creditOverLimit: null,
    });
  });

  test("alasan > 200 karakter saat lewat limit → 422", () => {
    expect(creditGate(paid(490_000, 20_000), "x".repeat(201))).toEqual({
      code: "VALIDATION",
      detail: "Alasan maksimal 200 karakter",
    });
    expect(creditGate(paid(490_000, 20_000), "x".repeat(200))).toMatchObject({
      creditOverLimit: { excess: 10_000 },
    });
  });

  test("(ruling R5) tidak ada lagi pemeriksa PIN pemilik", () => {
    expect(rules).not.toHaveProperty("isOwnerPin");
  });
});
