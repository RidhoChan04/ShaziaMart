import { describe, expect, test } from "vitest";
import {
  effectiveDate,
  partOf,
  paymentLines,
  saleDayLabel,
} from "./sales-model";

/** Kamis 5 Nov 2026 14.00 WIB. */
const NOW = Date.UTC(2026, 10, 5, 7);

describe("saleDayLabel", () => {
  test.each([
    ["2026-11-05", "Kamis, 5 Nov 2026"],
    ["2026-11-01", "Minggu, 1 Nov 2026"],
    ["2025-01-01", "Rabu, 1 Jan 2025"],
  ])("%s", (iso, label) => expect(saleDayLabel(iso)).toBe(label));
});

describe("effectiveDate", () => {
  test("bawaan hari ini; tanggal sah dipakai; tanggal rusak diabaikan", () => {
    expect(effectiveDate(undefined, "", NOW)).toBe("2026-11-05");
    expect(effectiveDate("2026-10-30", "", NOW)).toBe("2026-10-30");
    expect(effectiveDate("kemarin", "", NOW)).toBe("2026-11-05");
  });

  test("nomor struk lengkap menunjuk harinya sendiri; sebagian nomor tidak", () => {
    expect(effectiveDate(undefined, "20261104-0145", NOW)).toBe("2026-11-04");
    expect(effectiveDate("2026-10-30", " 20261104-0145 ", NOW)).toBe(
      "2026-11-04",
    );
    expect(effectiveDate("2026-10-30", "0145", NOW)).toBe("2026-10-30");
    expect(effectiveDate(undefined, "20261399-0001", NOW)).toBe("2026-11-05");
  });
});

describe("pembayaran", () => {
  const sale = {
    customerName: "Bu Sari",
    payments: [
      { method: "cash" as const, amount: 30_000 },
      { method: "credit" as const, amount: 10_000 },
    ],
  };

  test("paymentLines memberi nama pelanggan pada kasbon", () => {
    expect(paymentLines(sale)).toEqual([
      { label: "Tunai", amount: "Rp30.000" },
      { label: "Kasbon Bu Sari", amount: "Rp10.000" },
    ]);
  });

  test("partOf: nominal bagian, 0 bila tak ada", () => {
    expect(partOf(sale, "credit")).toBe(10_000);
    expect(partOf(sale, "qris")).toBe(0);
  });
});
