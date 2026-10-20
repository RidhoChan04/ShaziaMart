import { expect, test } from "vitest";
import { type PricedItem, priceChanges } from "./sale-rules";

const priced = (
  unitId: string,
  expectedUnitPrice: number,
  unitPrice: number,
): PricedItem => ({
  productId: `p-${unitId}`,
  expectedUnitPrice,
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
    [{ unitId: "gula", oldUnitPrice: 18000, newUnitPrice: 18500 }],
  ],
  [
    "dua satuan berbeda → dua perubahan",
    [priced("gula", 18000, 18500), priced("beras", 13000, 13500)],
    [
      { unitId: "gula", oldUnitPrice: 18000, newUnitPrice: 18500 },
      { unitId: "beras", oldUnitPrice: 13000, newUnitPrice: 13500 },
    ],
  ],
])("priceChanges: %s", (_name, items, expected) => {
  expect(priceChanges(items)).toEqual(expected);
});
