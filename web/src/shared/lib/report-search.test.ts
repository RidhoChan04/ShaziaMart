import { expect, test } from "vitest";
import { reportSearch, validateReportSearch } from "./report-search";

const TODAY = "2026-11-05";
const BULAN = { periode: "bulan", dari: "2026-11-01", sampai: "2026-11-30" };

test("kosong → bulan berjalan", () => {
  expect(validateReportSearch({}, TODAY)).toEqual(BULAN);
});

test.each([
  ["periode=minggu tanpa sampai", { periode: "minggu", dari: "2026-11-03" }],
  [
    "periode asing",
    { periode: "tahun", dari: "2026-11-01", sampai: "2026-11-30" },
  ],
  [
    "minggu bukan Senin–Minggu",
    { periode: "minggu", dari: "2026-11-03", sampai: "2026-11-09" },
  ],
  [
    "tanggal > 92 hari",
    { periode: "tanggal", dari: "2026-08-04", sampai: "2026-11-04" },
  ],
  [
    "dari di masa depan",
    { periode: "hari", dari: "2026-11-06", sampai: "2026-11-06" },
  ],
  [
    "sampai sebelum dari",
    { periode: "tanggal", dari: "2026-11-05", sampai: "2026-11-01" },
  ],
  ["bukan teks", { periode: "bulan", dari: 20261101, sampai: true }],
])("%s → bulan berjalan", (_n, search) => {
  expect(validateReportSearch(search, TODAY)).toEqual(BULAN);
});

test.each([
  [{ periode: "hari", dari: "2026-10-29", sampai: "2026-10-29" }],
  [{ periode: "minggu", dari: "2026-11-02", sampai: "2026-11-08" }],
  [{ periode: "bulan", dari: "2026-10-01", sampai: "2026-10-31" }],
  [{ periode: "tanggal", dari: "2026-08-06", sampai: "2026-11-05" }],
])("sah dipertahankan apa adanya: %o", (search) => {
  expect(validateReportSearch({ ...search, lain: "x" }, TODAY)).toEqual(search);
});

test("reportSearch: periode yang memuat hari ini", () => {
  expect(reportSearch("hari", TODAY)).toEqual({
    periode: "hari",
    dari: TODAY,
    sampai: TODAY,
  });
  expect(reportSearch("minggu", TODAY)).toEqual({
    periode: "minggu",
    dari: "2026-11-02",
    sampai: "2026-11-08",
  });
  expect(reportSearch("bulan", TODAY)).toEqual(BULAN);
});
