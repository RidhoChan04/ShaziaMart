import { expect, expectTypeOf, test } from "vitest";
import type { z } from "zod";
import type {
  CreditLimitProblem,
  PriceChangedProblem,
} from "./gen/shaziaMartAPI.schemas";
import { ErrorCode } from "./gen/shaziaMartAPI.schemas";
import { LookupCatalogResponse } from "./gen/zod/catalog/catalog";
import { CreateSaleBody, VoidSaleBody } from "./gen/zod/sales/sales";
import { creditLimitProblemSchema, priceChangedProblemSchema } from "./problem";

test("skema zod createSale menolak body tanpa saleId", () => {
  expect(
    CreateSaleBody.safeParse({ items: [], payments: [], print: true }).success,
  ).toBe(false);
});

test("skema zod createSale menolak items kosong", () => {
  const body = {
    saleId: "s1",
    items: [],
    payments: [{ method: "cash", amount: 1000 }],
    print: true,
  };
  expect(CreateSaleBody.safeParse(body).success).toBe(false);
});

test("priceChangedProblemSchema cocok dengan tipe hasil generate", () => {
  expectTypeOf<
    z.infer<typeof priceChangedProblemSchema>
  >().toMatchTypeOf<PriceChangedProblem>();
  const ok = priceChangedProblemSchema.safeParse({
    type: "about:blank",
    title: "Harga berubah",
    status: 409,
    code: "PRICE_CHANGED",
    changes: [{ unitId: "u1", oldUnitPrice: 1000, newUnitPrice: 1200 }],
  });
  expect(ok.success).toBe(true);
});

test("creditLimitProblemSchema cocok dengan tipe hasil generate", () => {
  expectTypeOf<
    z.infer<typeof creditLimitProblemSchema>
  >().toMatchTypeOf<CreditLimitProblem>();
  const ok = creditLimitProblemSchema.safeParse({
    type: "about:blank",
    title: "Batas kasbon terlampaui",
    status: 409,
    code: "CREDIT_LIMIT",
    balance: 10000,
    creditLimit: 50000,
    attempted: 60000,
  });
  expect(ok.success).toBe(true);
});

test("ErrorCode tetap 13 kode F1", () => {
  expect(Object.values(ErrorCode)).toHaveLength(13);
});

test("409 dikunci oleh code: PRICE_CHANGED lolos skema harga, CREDIT_LIMIT tidak", () => {
  const credit = {
    type: "about:blank",
    title: "Batas kasbon terlampaui",
    status: 409,
    code: "CREDIT_LIMIT",
    balance: 10000,
    creditLimit: 50000,
    attempted: 60000,
  };
  const price = {
    type: "about:blank",
    title: "Harga berubah",
    status: 409,
    code: "PRICE_CHANGED",
    changes: [{ unitId: "u1", oldUnitPrice: 1000, newUnitPrice: 1200 }],
  };
  expect(priceChangedProblemSchema.safeParse(price).success).toBe(true);
  expect(priceChangedProblemSchema.safeParse(credit).success).toBe(false);
  expect(creditLimitProblemSchema.safeParse(price).success).toBe(false);
});

test("VoidRequest: ownerPin opsional (tanpa PIN → 403 PIN_REQUIRED), alasan wajib", () => {
  expect(VoidSaleBody.safeParse({ reason: "salah input" }).success).toBe(true);
  expect(VoidSaleBody.safeParse({ ownerPin: "999999" }).success).toBe(false);
});

test("ProductUnit.unitSize minimal 1", () => {
  const match = (unitSize: number) => ({
    product: {
      id: "p1",
      name: "Gula",
      storeCode: "2001",
      isCurah: true,
      baseUnit: "gram",
      units: [
        {
          id: "u1",
          productId: "p1",
          name: "kg",
          unitSize,
          price: 18000,
          wholesaleTiers: [],
          barcodes: [],
        },
      ],
    },
    unitId: "u1",
  });
  expect(LookupCatalogResponse.safeParse(match(1000)).success).toBe(true);
  expect(LookupCatalogResponse.safeParse(match(0)).success).toBe(false);
});
