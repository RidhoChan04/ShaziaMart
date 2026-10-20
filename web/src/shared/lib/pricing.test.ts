import { expect, test } from "vitest";
import { cartTotal, priceLine, unitPriceFor } from "./pricing";

const indomiePcs = {
  price: 3100,
  unitSize: 1,
  wholesaleTiers: [{ minQty: 40, price: 2800 }],
};
const gula = { price: 18000, unitSize: 1000, wholesaleTiers: [] };

test.each([
  [indomiePcs, 1, { unitPrice: 3100, wholesale: false }],
  [indomiePcs, 39, { unitPrice: 3100, wholesale: false }],
  [indomiePcs, 40, { unitPrice: 2800, wholesale: true }],
])("unitPriceFor", (u, q, want) => expect(unitPriceFor(u, q)).toEqual(want));

test("unitPriceFor memilih tier terbesar walau tak terurut", () => {
  const unit = {
    price: 3100,
    unitSize: 1,
    wholesaleTiers: [
      { minQty: 100, price: 2500 },
      { minQty: 40, price: 2800 },
    ],
  };
  expect(unitPriceFor(unit, 120).unitPrice).toBe(2500);
  expect(unitPriceFor(unit, 50).unitPrice).toBe(2800);
});

test("unitPriceFor: tier hanya untuk kelipatan unitSize", () => {
  const dus = {
    price: 100,
    unitSize: 12,
    wholesaleTiers: [{ minQty: 2, price: 90 }],
  };
  expect(unitPriceFor(dus, 24)).toEqual({ unitPrice: 90, wholesale: true });
  expect(unitPriceFor(dus, 30)).toEqual({ unitPrice: 100, wholesale: false });
});

test("priceLine berat: gula 1,5 kg", () =>
  expect(priceLine(gula, { qtyBase: 1500 })).toEqual({
    qtyBase: 1500,
    unitPrice: 18000,
    subtotal: 27000,
    wholesale: false,
  }));
test("priceLine nominal: beras Rp20.000", () =>
  expect(priceLine(gula, { amount: 20000 })).toEqual({
    qtyBase: 1111,
    unitPrice: 18000,
    subtotal: 20000,
    wholesale: false,
  }));
test("priceLine grosir 40 pcs", () =>
  expect(priceLine(indomiePcs, { qtyBase: 40 }).subtotal).toBe(112000));
test.each([0, -1, 1.5, Number.NaN, Number.MAX_SAFE_INTEGER + 1])(
  "priceLine menolak qtyBase/amount tidak valid %s",
  (v) => {
    expect(() => priceLine(gula, { qtyBase: v })).toThrow(RangeError);
    expect(() => priceLine(gula, { amount: v })).toThrow(RangeError);
  },
);

test("cartTotal", () =>
  expect(cartTotal([78000, 72000, 27000, 29000, 112000, 43500])).toBe(361500));
test("cartTotal kosong = 0", () => expect(cartTotal([])).toBe(0));
test("cartTotal melempar RangeError bila tidak aman", () =>
  expect(() => cartTotal([Number.MAX_SAFE_INTEGER, 1])).toThrow(RangeError));
