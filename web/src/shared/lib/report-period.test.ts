import { describe, expect, test } from "vitest";
import type { ReportPeriod } from "../api/gen/shaziaMartAPI.schemas";
import { formatRupiah, formatSignedRupiah } from "./money";
import {
  checkRange,
  clampToToday,
  compareText,
  MAX_RANGE_DAYS,
  periodRange,
  periodTitle,
  previousRange,
  rangeLabel,
  shiftPeriod,
} from "./report-period";

describe("periodRange", () => {
  test.each([
    ["minggu", "2026-11-05", "2026-11-02", "2026-11-08"],
    ["bulan", "2026-11-05", "2026-11-01", "2026-11-30"],
    ["bulan", "2028-02-10", "2028-02-01", "2028-02-29"],
    ["hari", "2026-11-05", "2026-11-05", "2026-11-05"],
    // (pra-cek) Minggu = hari terakhir minggu, bukan awal minggu berikutnya
    ["minggu", "2026-11-08", "2026-11-02", "2026-11-08"],
    ["minggu", "2026-11-02", "2026-11-02", "2026-11-08"],
    ["minggu", "2026-12-31", "2026-12-28", "2027-01-03"],
    ["bulan", "2026-02-28", "2026-02-01", "2026-02-28"],
    ["bulan", "2026-12-31", "2026-12-01", "2026-12-31"],
  ] as const)("periodRange(%s, %s)", (p, a, from, to) =>
    expect(periodRange(p, a)).toEqual({ from, to }),
  );
});

describe("previousRange (K12, jawaban pemilik Q7)", () => {
  test.each([
    ["hari", "2026-11-05", "2026-11-05", "2026-10-29", "2026-10-29"],
    ["minggu", "2026-11-02", "2026-11-05", "2026-10-26", "2026-10-29"],
    ["minggu", "2026-11-02", "2026-11-08", "2026-10-26", "2026-11-01"],
    ["bulan", "2026-11-01", "2026-11-05", "2026-10-01", "2026-10-05"],
    ["bulan", "2026-10-01", "2026-10-31", "2026-09-01", "2026-09-30"],
    ["bulan", "2026-11-01", "2026-11-30", "2026-10-01", "2026-10-31"],
    ["bulan", "2026-03-01", "2026-03-30", "2026-02-01", "2026-02-28"],
    ["bulan", "2028-03-01", "2028-03-30", "2028-02-01", "2028-02-29"],
    ["bulan", "2026-03-01", "2026-03-31", "2026-02-01", "2026-02-28"],
    // (jawaban pemilik Q7) 31 hari vs 30 hari
    ["bulan", "2026-05-01", "2026-05-31", "2026-04-01", "2026-04-30"],
    // (jawaban pemilik Q7) berjalan 30 Mei: sejajar = 30 Apr = akhir April
    ["bulan", "2026-05-01", "2026-05-30", "2026-04-01", "2026-04-30"],
    // (jawaban pemilik Q7) 29 Mar dijepit ke 28 Feb
    ["bulan", "2026-03-01", "2026-03-29", "2026-02-01", "2026-02-28"],
    ["bulan", "2026-07-01", "2026-07-31", "2026-06-01", "2026-06-30"],
    // (pra-cek) lintas tahun di arah lain
    ["bulan", "2026-12-01", "2026-12-31", "2026-11-01", "2026-11-30"],
    // (pra-cek) lintas tahun
    ["bulan", "2027-01-01", "2027-01-05", "2026-12-01", "2026-12-05"],
    ["tanggal", "2026-10-10", "2026-10-16", "2026-10-03", "2026-10-09"],
    ["tanggal", "2026-11-05", "2026-11-05", "2026-11-04", "2026-11-04"],
    ["tanggal", "2027-01-01", "2027-01-31", "2026-12-01", "2026-12-31"],
  ] as const)("previousRange %s %s..%s → %s..%s", (p, f, t, pf, pt) =>
    expect(previousRange(p, { from: f, to: t })).toEqual({
      from: pf,
      to: pt,
    }),
  );
});

describe("shiftPeriod", () => {
  test("(pra-cek) bulan dari 31 Mar → Februari penuh (bukan 3 Mar); maju dari Februari → Maret penuh", () => {
    const march = { from: "2026-03-01", to: "2026-03-31" };
    expect(shiftPeriod("bulan", march, -1)).toEqual({
      from: "2026-02-01",
      to: "2026-02-28",
    });
    expect(
      shiftPeriod("bulan", { from: "2026-02-01", to: "2026-02-28" }, 1),
    ).toEqual(march);
    // bulan berjalan yang sudah dijepit tetap bergeser ke bulan penuh
    expect(
      shiftPeriod("bulan", { from: "2026-11-01", to: "2026-11-05" }, -1),
    ).toEqual({ from: "2026-10-01", to: "2026-10-31" });
    expect(
      shiftPeriod("bulan", { from: "2026-12-01", to: "2026-12-31" }, 1),
    ).toEqual({ from: "2027-01-01", to: "2027-01-31" });
    expect(
      shiftPeriod("bulan", { from: "2027-01-01", to: "2027-01-31" }, -1),
    ).toEqual({ from: "2026-12-01", to: "2026-12-31" });
  });

  test("hari ±1; minggu ±7; tanggal geser sepanjang rentang", () => {
    expect(
      shiftPeriod("hari", { from: "2026-11-01", to: "2026-11-01" }, -1),
    ).toEqual({ from: "2026-10-31", to: "2026-10-31" });
    expect(
      shiftPeriod("minggu", { from: "2026-11-02", to: "2026-11-08" }, -1),
    ).toEqual({ from: "2026-10-26", to: "2026-11-01" });
    expect(
      shiftPeriod("minggu", { from: "2026-12-28", to: "2027-01-03" }, 1),
    ).toEqual({ from: "2027-01-04", to: "2027-01-10" });
    const range = { from: "2026-10-10", to: "2026-11-05" }; // 27 hari
    expect(shiftPeriod("tanggal", range, -1)).toEqual({
      from: "2026-09-13",
      to: "2026-10-09",
    });
    expect(shiftPeriod("tanggal", range, 1)).toEqual({
      from: "2026-11-06",
      to: "2026-12-02",
    });
  });
});

describe("clampToToday", () => {
  test("1–30 Nov pada 5 Nov → 1–5 Nov running", () =>
    expect(
      clampToToday({ from: "2026-11-01", to: "2026-11-30" }, "2026-11-05"),
    ).toEqual({ from: "2026-11-01", to: "2026-11-05", running: true }));

  test("hari ini sendiri running; rentang lampau tidak berubah dan tidak running", () => {
    expect(
      clampToToday({ from: "2026-11-05", to: "2026-11-05" }, "2026-11-05"),
    ).toEqual({ from: "2026-11-05", to: "2026-11-05", running: true });
    expect(
      clampToToday({ from: "2026-10-01", to: "2026-10-31" }, "2026-11-05"),
    ).toEqual({ from: "2026-10-01", to: "2026-10-31", running: false });
    expect(
      clampToToday({ from: "2026-11-04", to: "2026-11-04" }, "2026-11-05"),
    ).toEqual({ from: "2026-11-04", to: "2026-11-04", running: false });
  });
});

test("label", () => {
  expect(rangeLabel({ from: "2026-11-05", to: "2026-11-05" })).toBe("5 Nov");
  expect(rangeLabel({ from: "2026-11-01", to: "2026-11-05" })).toBe("1–5 Nov");
  expect(rangeLabel({ from: "2026-10-28", to: "2026-11-03" })).toBe(
    "28 Okt–3 Nov",
  );
  expect(rangeLabel({ from: "2026-12-28", to: "2027-01-03" })).toBe(
    "28 Des 2026–3 Jan 2027",
  );
  expect(periodTitle("hari", { from: "2026-11-05", to: "2026-11-05" })).toBe(
    "Kamis, 5 Nov 2026",
  );
  expect(periodTitle("hari", { from: "2026-11-08", to: "2026-11-08" })).toBe(
    "Minggu, 8 Nov 2026",
  );
  expect(periodTitle("minggu", { from: "2026-11-02", to: "2026-11-08" })).toBe(
    "2–8 Nov 2026",
  );
  expect(periodTitle("minggu", { from: "2026-12-28", to: "2027-01-03" })).toBe(
    "28 Des 2026–3 Jan 2027",
  );
  expect(periodTitle("bulan", { from: "2026-11-01", to: "2026-11-30" })).toBe(
    "November 2026",
  );
  expect(periodTitle("bulan", { from: "2027-02-01", to: "2027-02-05" })).toBe(
    "Februari 2027",
  );
  expect(periodTitle("tanggal", { from: "2026-10-10", to: "2026-11-05" })).toBe(
    "10 Okt–5 Nov 2026",
  );
  expect(periodTitle("tanggal", { from: "2026-11-05", to: "2026-11-05" })).toBe(
    "5 Nov 2026",
  );
});

test("compareText (K13)", () => {
  expect(compareText(108, 100, "1–5 Okt", true, String)).toBe(
    "▲ 8% dari 1–5 Okt",
  );
  expect(compareText(92, 100, "1–5 Okt", true, String)).toBe(
    "▼ 8% dari 1–5 Okt",
  );
  expect(compareText(1004, 1000, "1–5 Okt", true, String)).toBe(
    "Sama dengan 1–5 Okt",
  );
  expect(compareText(5, 0, "1–5 Okt", false, String)).toBe(
    "Belum ada data 1–5 Okt",
  );
  expect(compareText(5000, 0, "1–5 Okt", true, formatRupiah)).toBe(
    "Rp0 di 1–5 Okt",
  );
  // (pra-cek) laba minus
  expect(compareText(5000, -2000, "1–5 Okt", true, formatSignedRupiah)).toBe(
    "−Rp2.000 di 1–5 Okt",
  );
  // pembulatan setengah ke atas; laba sekarang minus terhadap pembanding positif
  expect(compareText(1005, 1000, "x", true, String)).toBe("▲ 1% dari x");
  expect(compareText(-500, 1000, "x", true, String)).toBe("▼ 150% dari x");
});

describe("checkRange", () => {
  test.each([
    ["tanggal", "2026-08-01", "2026-11-05", "Rentang maksimal 92 hari"],
    [
      "tanggal",
      "2026-11-05",
      "2026-11-01",
      "Tanggal akhir sebelum tanggal awal",
    ],
    ["hari", "2026-11-06", "2026-11-06", "Tanggal di masa depan"],
    ["minggu", "2026-11-03", "2026-11-08", "Periode tidak cocok"],
    // (pra-cek) bulan berjalan penuh sah (dijepit, bukan ditolak)
    ["bulan", "2026-11-01", "2026-11-30", null],
    ["minggu", "2026-11-02", "2026-11-08", null],
    ["hari", "2026-11-05", "2026-11-05", null],
    ["hari", "2026-11-04", "2026-11-05", "Periode tidak cocok"],
    ["bulan", "2026-10-01", "2026-10-30", "Periode tidak cocok"],
    ["bulan", "2026-10-02", "2026-10-31", "Periode tidak cocok"],
    ["tanggal", "2026-08-05", "2026-11-04", null], // tepat 92 hari
    ["tanggal", "2026-08-05", "2026-11-05", "Rentang maksimal 92 hari"], // 93 hari
    ["tanggal", "2026-10-10", "2026-11-20", null], // ujung masa depan dijepit
    ["tanggal", "2026-11-31", "2026-12-01", "Tanggal tidak valid"],
    ["hari", "", "", "Tanggal tidak valid"],
    ["hari", "5 Nov", "5 Nov", "Tanggal tidak valid"],
  ] as const)("checkRange %s %s..%s → %s", (p, f, t, msg) =>
    expect(checkRange(p as ReportPeriod, f, t, "2026-11-05")).toBe(msg),
  );

  test("MAX_RANGE_DAYS = 92", () => expect(MAX_RANGE_DAYS).toBe(92));
});
