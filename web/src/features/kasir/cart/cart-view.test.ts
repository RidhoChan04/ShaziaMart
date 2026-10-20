import { expect, test } from "vitest";
import { cartLineView, cartSummary } from "./cart-view";

const line = {
  lineId: "l1",
  unitId: "u1",
  productId: "p1",
  productName: "Indomie",
  unitName: "pcs",
  isCurah: false,
  baseUnit: "pcs" as const,
  unitSize: 1,
  listPrice: 3100,
  wholesaleTiers: [{ minQty: 40, price: 2800 }],
  qtyBase: 3,
  amount: null,
};

test("cartLineView non-curah", () => {
  expect(cartLineView(line, 1)).toEqual({
    no: 2,
    qtyLabel: "3 pcs",
    priceLabel: "3.100",
    unitPrice: 3100,
    subtotal: 9300,
    wholesale: false,
  });
});

test("cartLineView grosir", () => {
  const v = cartLineView({ ...line, qtyBase: 40 }, 0);
  expect(v).toMatchObject({
    unitPrice: 2800,
    subtotal: 112000,
    wholesale: true,
  });
});

test("cartSummary keranjang kosong", () => {
  expect(cartSummary([])).toEqual({ itemCount: 0, total: 0 });
});
