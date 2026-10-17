import { expect, test } from "vitest";
import {
  formatApproxKg,
  formatGram,
  lineSubtotal,
  parseKg,
  qtyBaseFromAmount,
  roundHalfUp,
} from "./quantity";

test.each([
  ["1,5", 1500],
  ["1.5", 1500],
  ["0,25", 250],
  ["2", 2000],
  ["0,001", 1],
  ["", null],
  ["0", null],
  ["-1", null],
  ["1,2345", null],
  ["abc", null],
  ["1,5,0", null],
])("parseKg(%j) = %j", (s, g) => expect(parseKg(s)).toBe(g));

test.each([
  [1500, "1,5 kg"],
  [250, "0,25 kg"],
  [1000, "1 kg"],
  [1, "0,001 kg"],
])("formatGram(%i) = %s", (g, s) => expect(formatGram(g)).toBe(s));
test("formatGram liter", () => expect(formatGram(1500, "L")).toBe("1,5 L"));
test("formatApproxKg", () => expect(formatApproxKg(1111)).toBe("≈ 1,111 kg"));

test.each([
  [18000, 1500, 1000, 27000], // gula 1,5 kg
  [18000, 333, 1000, 5994],
  [14500, 333, 1000, 4829], // 4828,5 -> naik
  [36000, 2, 1, 72000], // satuan pcs
])("lineSubtotal(%i, %i, %i) = %i", (p, q, u, s) =>
  expect(lineSubtotal(p, q, u)).toBe(s),
);

test.each([
  [20000, 18000, 1000, 1111], // beras Rp20.000 -> +-1,111 kg
  [10000, 15000, 1000, 667], // 666,67 -> 667
  [9000, 18000, 1000, 500],
])("qtyBaseFromAmount(%i, %i, %i) = %i", (a, p, u, q) =>
  expect(qtyBaseFromAmount(a, p, u)).toBe(q),
);

test.each([
  [1, 2, 1],
  [1, 3, 0],
  [0, 5, 0],
  [7, 2, 4],
])("roundHalfUp(%i, %i) = %i", (a, b, r) => expect(roundHalfUp(a, b)).toBe(r));

test("roundHalfUp menolak input tidak valid", () => {
  expect(() => roundHalfUp(-1, 2)).toThrow(RangeError);
  expect(() => roundHalfUp(1.5, 2)).toThrow(RangeError);
  expect(() => roundHalfUp(1, 0)).toThrow(RangeError);
});

test("lineSubtotal melempar RangeError bila di luar batas aman", () => {
  expect(() => lineSubtotal(9007199254740991, 2, 1)).toThrow(RangeError);
});
