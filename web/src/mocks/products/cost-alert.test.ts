import { describe, expect, test } from "vitest";
import { sameCost } from "./cost-alert";

const MAX = Number.MAX_SAFE_INTEGER;

describe("sameCost", () => {
  test("rasio sama dengan penulisan berbeda → true; berbeda → false; null hanya sama dengan null", () => {
    expect(
      sameCost(
        { amount: 380_000, qtyBase: 140 },
        { amount: 19_000, qtyBase: 7 },
      ),
    ).toBe(true);
    expect(
      sameCost(
        { amount: 380_000, qtyBase: 140 },
        { amount: 19_001, qtyBase: 7 },
      ),
    ).toBe(false);
    expect(sameCost(null, null)).toBe(true);
    expect(sameCost(null, { amount: 1, qtyBase: 1 })).toBe(false);
  });

  test("perkalian silang di atas 2^53 tetap persis (tidak tertipu pembulatan float)", () => {
    // Float: MAX × (MAX−2) dan (MAX−1) × (MAX−1) dibulatkan ke angka yang sama.
    const a = { amount: MAX, qtyBase: MAX - 1 };
    const b = { amount: MAX - 1, qtyBase: MAX - 2 };
    expect(a.amount * b.qtyBase === b.amount * a.qtyBase).toBe(true);
    expect(sameCost(a, b)).toBe(false);
    expect(
      sameCost(
        { amount: MAX, qtyBase: MAX },
        { amount: MAX - 2, qtyBase: MAX - 2 },
      ),
    ).toBe(true);
  });
});
