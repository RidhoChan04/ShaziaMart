import { expect, expectTypeOf, test } from "vitest";
import type { z } from "zod";
import type {
  CreditLimitProblem,
  OwnerTodaySummary,
  PriceChangedProblem,
} from "./gen/shaziaMartAPI.schemas";
import { ErrorCode } from "./gen/shaziaMartAPI.schemas";
import { LookupCatalogResponse } from "./gen/zod/catalog/catalog";
import {
  GetOwnerTodaySummaryResponse,
  OwnerLoginBody,
} from "./gen/zod/owner/owner";
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

test("ErrorCode berisi 14 kode termasuk LOGIN_INVALID", () => {
  expect(Object.values(ErrorCode)).toHaveLength(14);
  expect(ErrorCode.LOGIN_INVALID).toBe("LOGIN_INVALID");
});

test("OwnerLogin menolak nama kosong dan password kosong", () => {
  const ok = { name: "budi", password: "rahasia" };
  expect(OwnerLoginBody.safeParse(ok).success).toBe(true);
  expect(OwnerLoginBody.safeParse({ ...ok, name: "" }).success).toBe(false);
  expect(OwnerLoginBody.safeParse({ ...ok, password: "" }).success).toBe(false);
});

test("fixture OwnerTodaySummary valid terhadap skema respons dan tipe", () => {
  const summary = {
    date: "2026-10-23",
    weekdayLastWeek: "Jumat",
    revenue: 1500000,
    grossProfit: 300000,
    salesCount: 30,
    newCredit: 50000,
    avgTicket: 50000,
    lastWeekRevenue: 1200000,
    hourly: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      revenue: hour * 1000,
      lastWeekRevenue: hour * 900,
    })),
    attention: {
      lowStockCount: 2,
      negativeStockCount: 1,
      cashDifferences: [
        {
          shiftId: "sh1",
          kasirName: "Sari",
          closedAt: 1790000000000,
          difference: -5000,
        },
      ],
      overdueCredit: { count: 1, total: 75000 },
    },
  } satisfies OwnerTodaySummary;
  expect(GetOwnerTodaySummaryResponse.safeParse(summary).success).toBe(true);
  const short = { ...summary, hourly: summary.hourly.slice(0, 23) };
  expect(GetOwnerTodaySummaryResponse.safeParse(short).success).toBe(false);
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
