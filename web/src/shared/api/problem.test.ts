import { expect, test } from "vitest";
import { z } from "zod";
import { ApiError } from "./fetcher";
import { readProblem } from "./problem";

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
