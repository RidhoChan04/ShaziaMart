import { expect, test } from "vitest";
import { formatAngka, formatRupiah, parseRupiah } from "./money";

test.each([
  [0, "Rp0"],
  [500, "Rp500"],
  [12500, "Rp12.500"],
  [1250000, "Rp1.250.000"],
  [-5000, "-Rp5.000"],
  [25000000, "Rp25.000.000"],
  [9007199254740991, "Rp9.007.199.254.740.991"],
])("formatRupiah(%i) = %s", (n, s) => expect(formatRupiah(n)).toBe(s));

test("formatRupiah menolak pecahan dan di luar batas aman", () => {
  expect(() => formatRupiah(12.5)).toThrow(RangeError);
  expect(() => formatRupiah(9007199254740992)).toThrow(RangeError);
});

test("formatAngka", () => expect(formatAngka(361500)).toBe("361.500"));

test.each([
  ["400.000", 400000],
  ["400000", 400000],
  ["Rp400.000", 400000],
  [" Rp 20.000 ", 20000],
  ["0", 0],
  ["", null],
  ["abc", null],
  ["-5.000", null],
  ["12,5", null],
  ["4.00.000", null],
])("parseRupiah(%j) = %j", (s, n) => expect(parseRupiah(s)).toBe(n));
