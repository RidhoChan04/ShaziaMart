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
