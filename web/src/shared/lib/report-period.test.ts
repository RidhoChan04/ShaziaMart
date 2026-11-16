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
  previousCutAtNow,
  previousRange,
  rangeLabel,
  shiftPeriod,
  weekdayLabel,
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
  // Kolom ke-4 = running (range sudah dijepit ke hari ini). Bulan yang sudah lewat → bulan
  // sebelumnya penuh; bulan berjalan → tanggal sejajar, dijepit ke akhir bulan yang lebih pendek.
  test.each([
    ["hari", "2026-11-05", "2026-11-05", true, "2026-10-29", "2026-10-29"],
    ["hari", "2026-11-04", "2026-11-04", false, "2026-10-28", "2026-10-28"],
    ["minggu", "2026-11-02", "2026-11-05", true, "2026-10-26", "2026-10-29"],
    ["minggu", "2026-11-02", "2026-11-08", false, "2026-10-26", "2026-11-01"],
    ["bulan", "2026-11-01", "2026-11-05", true, "2026-10-01", "2026-10-05"],
    ["bulan", "2026-10-01", "2026-10-31", false, "2026-09-01", "2026-09-30"],
    // bulan yang sudah lewat (November selesai) → Oktober penuh
    ["bulan", "2026-11-01", "2026-11-30", false, "2026-10-01", "2026-10-31"],
    // (jawaban pemilik Q7) hari terakhir bulan berjalan: 30 Nov → 1–30 Okt, bukan Oktober penuh
    ["bulan", "2026-11-01", "2026-11-30", true, "2026-10-01", "2026-10-30"],
    ["bulan", "2026-02-01", "2026-02-28", true, "2026-01-01", "2026-01-28"],
    ["bulan", "2026-02-01", "2026-02-28", false, "2026-01-01", "2026-01-31"],
    ["bulan", "2028-02-01", "2028-02-29", true, "2028-01-01", "2028-01-29"],
    ["bulan", "2026-04-01", "2026-04-30", true, "2026-03-01", "2026-03-30"],
    ["bulan", "2026-06-01", "2026-06-30", true, "2026-05-01", "2026-05-30"],
    ["bulan", "2026-09-01", "2026-09-30", true, "2026-08-01", "2026-08-30"],
    ["bulan", "2026-03-01", "2026-03-30", true, "2026-02-01", "2026-02-28"],
    ["bulan", "2028-03-01", "2028-03-30", true, "2028-02-01", "2028-02-29"],
    ["bulan", "2026-03-01", "2026-03-31", false, "2026-02-01", "2026-02-28"],
    ["bulan", "2026-03-01", "2026-03-31", true, "2026-02-01", "2026-02-28"],
    // (jawaban pemilik Q7) 31 hari vs 30 hari
    ["bulan", "2026-05-01", "2026-05-31", false, "2026-04-01", "2026-04-30"],
    ["bulan", "2026-05-01", "2026-05-31", true, "2026-04-01", "2026-04-30"],
    ["bulan", "2026-10-01", "2026-10-31", true, "2026-09-01", "2026-09-30"],
    // (jawaban pemilik Q7) berjalan 30 Mei: sejajar = 30 Apr = akhir April
    ["bulan", "2026-05-01", "2026-05-30", true, "2026-04-01", "2026-04-30"],
    // (jawaban pemilik Q7) 29 Mar dijepit ke 28 Feb
    ["bulan", "2026-03-01", "2026-03-29", true, "2026-02-01", "2026-02-28"],
    ["bulan", "2026-07-01", "2026-07-31", false, "2026-06-01", "2026-06-30"],
    // (pra-cek) lintas tahun di arah lain
    ["bulan", "2026-12-01", "2026-12-31", false, "2026-11-01", "2026-11-30"],
    // (pra-cek) lintas tahun
    ["bulan", "2027-01-01", "2027-01-05", true, "2026-12-01", "2026-12-05"],
    ["bulan", "2027-01-01", "2027-01-31", false, "2026-12-01", "2026-12-31"],
    ["tanggal", "2026-10-10", "2026-10-16", false, "2026-10-03", "2026-10-09"],
    ["tanggal", "2026-11-05", "2026-11-05", true, "2026-11-04", "2026-11-04"],
    ["tanggal", "2027-01-01", "2027-01-31", false, "2026-12-01", "2026-12-31"],
  ] as const)(
    "previousRange %s %s..%s running=%s → %s..%s",
    (p, f, t, running, pf, pt) =>
      expect(previousRange(p, { from: f, to: t }, running)).toEqual({
        from: pf,
        to: pt,
      }),
  );
});

describe("previousCutAtNow (jawaban pemilik Q7)", () => {
  test.each([
    ["hari", "2026-11-05", "2026-11-05", true, true],
    ["hari", "2026-11-04", "2026-11-04", false, false],
    ["minggu", "2026-11-02", "2026-11-05", true, true],
    ["tanggal", "2026-10-10", "2026-11-05", true, true],
    ["tanggal", "2026-10-10", "2026-10-16", false, false],
    ["bulan", "2026-11-01", "2026-11-05", true, true],
    // hari terakhir bulan berjalan, bulan pembanding lebih panjang → sejajar, dipotong
    ["bulan", "2026-11-01", "2026-11-30", true, true],
    ["bulan", "2026-02-01", "2026-02-28", true, true],
    ["bulan", "2028-02-01", "2028-02-29", true, true],
    // sejajar tepat di akhir bulan pembanding yang lebih pendek → masih dipotong
    ["bulan", "2026-03-01", "2026-03-28", true, true],
    ["bulan", "2026-05-01", "2026-05-30", true, true],
    // tanggal sejajar dijepit → bulan pembanding dihitung penuh
    ["bulan", "2026-03-01", "2026-03-30", true, false],
    ["bulan", "2026-05-01", "2026-05-31", true, false],
    ["bulan", "2026-11-01", "2026-11-30", false, false],
  ] as const)("%s %s..%s running=%s → %s", (p, f, t, running, cut) =>
    expect(previousCutAtNow(p, { from: f, to: t }, running)).toBe(cut),
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

  test("minggu berjalan yang sudah dijepit (2–5 Nov) → minggu penuh di sebelahnya", () => {
    const running = { from: "2026-11-02", to: "2026-11-05" };
    expect(shiftPeriod("minggu", running, -1)).toEqual({
      from: "2026-10-26",
      to: "2026-11-01",
    });
    expect(shiftPeriod("minggu", running, 1)).toEqual({
      from: "2026-11-09",
      to: "2026-11-15",
    });
    // minggu lintas tahun yang dijepit di 31 Des
    expect(
      shiftPeriod("minggu", { from: "2026-12-28", to: "2026-12-31" }, -1),
    ).toEqual({ from: "2026-12-21", to: "2026-12-27" });
  });

  test("hasil geser dari rentang berjalan/dijepit selalu lolos checkRange", () => {
    const today = "2026-11-20";
    const cases: [ReportPeriod, { from: string; to: string }][] = [
      ["hari", { from: "2026-11-05", to: "2026-11-05" }],
      ["minggu", { from: "2026-11-02", to: "2026-11-05" }],
      ["minggu", { from: "2026-11-09", to: "2026-11-11" }],
      ["bulan", { from: "2026-11-01", to: "2026-11-05" }],
      ["bulan", { from: "2026-10-01", to: "2026-10-31" }],
      ["tanggal", { from: "2026-10-10", to: "2026-11-05" }],
      ["tanggal", { from: "2026-08-21", to: "2026-11-20" }], // tepat 92 hari
    ];
    for (const [period, range] of cases) {
      const back = shiftPeriod(period, range, -1);
      expect(checkRange(period, back.from, back.to, today), period).toBeNull();
    }
    const fwd = shiftPeriod(
      "minggu",
      { from: "2026-11-02", to: "2026-11-05" },
      1,
    );
    expect(checkRange("minggu", fwd.from, fwd.to, today)).toBeNull();
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

test("weekdayLabel: label pembanding period hari dengan nama hari", () => {
  expect(weekdayLabel("2026-10-29")).toBe("Kamis, 29 Okt");
  expect(weekdayLabel("2026-11-01")).toBe("Minggu, 1 Nov");
  expect(weekdayLabel("2026-12-28")).toBe("Senin, 28 Des");
  expect(weekdayLabel("2028-02-29")).toBe("Selasa, 29 Feb");
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
