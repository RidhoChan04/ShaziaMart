import { expect, test } from "vitest";
import { quickCashOptions } from "./denominations";

test.each([
  [3100, [3100, 5000, 10000, 20000]],
  [18000, [18000, 20000, 50000, 100000]],
  [27000, [27000, 30000, 40000, 50000]],
  [50000, [50000, 100000, 200000, 300000]],
  [361500, [361500, 370000, 400000, 500000]],
  [25000000, [25000000, 25100000, 25200000, 25300000]],
  [0, []],
])("quickCashOptions(%i)", (t, want) =>
  expect(quickCashOptions(t)).toEqual(want),
);

test("quickCashOptions: total di batas bilangan bulat aman", () => {
  expect(quickCashOptions(Number.MAX_SAFE_INTEGER)).toEqual([
    Number.MAX_SAFE_INTEGER,
  ]);
});

test("quickCashOptions: 49000 naik ke 50000 lalu 60000 dan 100000", () => {
  expect(quickCashOptions(49000)).toEqual([49000, 50000, 60000, 100000]);
});

test("quickCashOptions: total non-integer ditolak", () => {
  expect(() => quickCashOptions(12.5)).toThrow(RangeError);
});
