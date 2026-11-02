import { expect, test } from "vitest";
import { type PricedItem, priceChanges, saleCost } from "./sale-rules";
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
