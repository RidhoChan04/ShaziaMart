import { expect, test } from "vitest";
import {
  formatAngka,
  formatRupiah,
  formatRupiahShort,
  parseRupiah,
} from "./money";

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

test.each([
  [0, "Rp0"],
  [999, "Rp999"],
  [1000, "Rp1 rb"],
  [12500, "Rp12,5 rb"],
  [361500, "Rp361,5 rb"],
  [361549, "Rp361,5 rb"],
  [361550, "Rp361,6 rb"],
  [999949, "Rp999,9 rb"],
  [999950, "Rp1 jt"],
  [1000000, "Rp1 jt"],
  [4872500, "Rp4,9 jt"],
  [12345678, "Rp12,3 jt"],
  [1234567890, "Rp1.234,6 jt"],
  [-361500, "-Rp361,5 rb"],
  [-999950, "-Rp1 jt"],
  [-500, "-Rp500"],
])("formatRupiahShort(%i) = %s", (n, s) =>
  expect(formatRupiahShort(n)).toBe(s),
);

test("formatRupiahShort menolak pecahan", () => {
  expect(() => formatRupiahShort(1.5)).toThrow(RangeError);
});
