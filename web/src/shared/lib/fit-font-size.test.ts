import { expect, test } from "vitest";
import { fitFontSize } from "./fit-font-size";

const TILE = { max: 21, min: 13 };
const HERO = { max: 34, min: 22 };

test.each([
  ["Rp361.500", 132, 21],
  ["Rp12.345.678", 132, 18],
  ["Rp1.234.567.890", 132, 15],
  ["-Rp123.456.789.012", 132, 13],
])("tile %s di %ipx → %ipx", (t, w, px) => {
  expect(fitFontSize(t, w, TILE)).toBe(px);
});

// Rumus: em = R .68 + p .64 + 12 digit × .64 + 3 titik × .28 = 9.84; floor(296 / 9.84) = 30.
// (Angka 29 di rencana salah hitung; rumus adalah spesifikasinya, ruling C1.)
test.each([
  ["Rp4.872.500", 296, 34],
  ["Rp123.456.789.012", 296, 30],
])("hero %s di %ipx → %ipx", (t, w, px) => {
  expect(fitFontSize(t, w, HERO)).toBe(px);
});

test("lebar 0 (belum diukur) → max", () => {
  expect(fitFontSize("Rp1", 0, TILE)).toBe(21);
  expect(fitFontSize("Rp1", -5, TILE)).toBe(21);
});

test("tidak pernah di bawah min meski sempit sekali", () => {
  expect(fitFontSize("Rp123.456.789.012", 10, HERO)).toBe(22);
});

test("minus Unicode dan koma berlebar sama dengan minus ASCII dan titik", () => {
  expect(fitFontSize("−Rp1,5", 100, TILE)).toBe(
    fitFontSize("-Rp1.5", 100, TILE),
  );
});
