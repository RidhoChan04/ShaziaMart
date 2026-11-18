import { expect, test } from "vitest";
import { dutyLineText } from "./duty-line";

const T = Date.UTC(2026, 9, 31, 5, 0); // 31 Okt 2026, 12.00 WIB

test("hitungan pertama", () => {
  expect(dutyLineText(null, [])).toBe("Hitungan pertama");
});

test("tanpa shift atau catatan", () => {
  expect(dutyLineText(T, [])).toBe("Tidak ada shift atau catatan");
});

test("shift dan catatan per nama, dipisah titik tengah", () => {
  expect(
    dutyLineText(T, [
      { name: "Dedi", shifts: 1, records: 0 },
      { name: "Rina", shifts: 4, records: 2 },
    ]),
  ).toBe("Sejak hitungan 31 Okt: Dedi 1 shift · Rina 4 shift, 2 catatan");
});

test("hanya catatan", () => {
  expect(dutyLineText(T, [{ name: "Budi", shifts: 0, records: 3 }])).toBe(
    "Sejak hitungan 31 Okt: Budi 3 catatan",
  );
});
