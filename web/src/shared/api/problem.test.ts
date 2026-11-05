import { expect, test } from "vitest";
import { z } from "zod";
import { ApiError } from "./fetcher";
import {
  opnameProblemSchema,
  readProblem,
  receiptProblemSchema,
} from "./problem";

const priceChangedProblemSchema = z.object({
  code: z.literal("PRICE_CHANGED"),
  changes: z.array(
    z.object({
      unitId: z.string(),
      oldUnitPrice: z.number(),
      newUnitPrice: z.number(),
    }),
  ),
});

test("readProblem membaca body ApiError yang cocok skema", () => {
  const err = new ApiError({
    status: 409,
    code: "PRICE_CHANGED",
    body: {
      type: "about:blank",
      title: "Conflict",
      status: 409,
      code: "PRICE_CHANGED",
      changes: [{ unitId: "u1", oldUnitPrice: 3100, newUnitPrice: 3600 }],
    },
  });
  expect(
    readProblem(err, priceChangedProblemSchema)?.changes[0]?.newUnitPrice,
  ).toBe(3600);
});

test("readProblem null untuk error lain atau body tak cocok", () => {
  expect(readProblem(new Error("x"), priceChangedProblemSchema)).toBeNull();
  expect(
    readProblem(
      new ApiError({ status: 409, code: "PRICE_CHANGED", body: { a: 1 } }),
      priceChangedProblemSchema,
    ),
  ).toBeNull();
});

test("receiptProblemSchema membaca errors per baris", () => {
  const body = {
    type: "about:blank",
    title: "Nota tidak valid",
    status: 422,
    code: "VALIDATION",
    errors: [
      { lineId: null, field: "supplierName", message: "Supplier belum diisi" },
      {
        lineId: "l2",
        field: "product",
        message: "Barang ini tidak dijual lagi",
      },
    ],
  };
  const err = new ApiError({ status: 422, code: "VALIDATION", body });
  expect(readProblem(err, receiptProblemSchema)?.errors[1]).toEqual({
    lineId: "l2",
    field: "product",
    message: "Barang ini tidak dijual lagi",
  });
});

test("opnameProblemSchema membaca galat per barang (productId null = tingkat sesi)", () => {
  const body = {
    type: "about:blank",
    title: "Hasil opname tidak valid",
    status: 422,
    code: "VALIDATION",
    errors: [
      { productId: "p1", message: "Pilih alasan" },
      { productId: null, message: "Belum ada barang yang dihitung" },
    ],
  };
  const err = new ApiError({ status: 422, code: "VALIDATION", body });
  expect(readProblem(err, opnameProblemSchema)?.errors).toEqual(body.errors);
  const notArray = new ApiError({
    status: 422,
    code: "VALIDATION",
    body: { ...body, errors: { productId: "p1", message: "Pilih alasan" } },
  });
  expect(readProblem(notArray, opnameProblemSchema)).toBeNull();
});
