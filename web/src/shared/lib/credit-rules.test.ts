import { expect, test } from "vitest";
import { DAY_MS } from "./business-day";
import {
  CREDIT_METHOD_LABEL,
  creditAge,
  creditAgeDays,
  repaymentProblem,
} from "./credit-rules";

const NOW = Date.UTC(2026, 10, 5, 3);

test("label metode pelunasan", () => {
  expect(CREDIT_METHOD_LABEL).toEqual({
    tunai: "Tunai",
    qris: "QRIS",
    transfer: "Transfer",
    titip: "Tunai ke pemilik",
  });
});

test.each([
  [null, null],
  [NOW, 0],
  [NOW - 1, 1],
  [NOW - 7 * DAY_MS, 7],
  [NOW - 7 * DAY_MS - 1, 8],
  [NOW - 30 * DAY_MS, 30],
  [NOW - 30 * DAY_MS - 1, 31],
])("creditAgeDays(%s) = %s", (at, d) => expect(creditAgeDays(at, NOW)).toBe(d));

test.each([
  [null, null],
  [0, "hari_0_7"],
  [7, "hari_0_7"],
  [8, "hari_8_30"],
  [30, "hari_8_30"],
  [31, "lebih_30_hari"],
])("creditAge(%s) = %s", (d, a) => expect(creditAge(d)).toBe(a));

test("kelompok sepakat dengan Beranda: lebih_30_hari ⇔ now − oldest > 30×DAY_MS", () => {
  const edge = 30 * DAY_MS;
  for (const back of [
    edge - DAY_MS,
    edge - 1,
    edge,
    edge + 1,
    edge + 60_000,
    edge + DAY_MS - 1,
    edge + DAY_MS,
    edge + DAY_MS + 1,
  ]) {
    const oldest = NOW - back;
    const overdue = creditAge(creditAgeDays(oldest, NOW)) === "lebih_30_hari";
    expect(overdue).toBe(NOW - oldest > 30 * DAY_MS);
  }
});

test("repaymentProblem: saldo 0, nol, lebih, pas", () => {
  expect(repaymentProblem(50_000, 0)).toBe("Pelanggan ini tidak punya kasbon");
  expect(repaymentProblem(50_000, -60_000)).toBe(
    "Pelanggan ini tidak punya kasbon",
  );
  expect(repaymentProblem(0, 120_000)).toBe("Jumlah minimal Rp1");
  expect(repaymentProblem(null, 120_000)).toBe("Jumlah minimal Rp1");
  expect(repaymentProblem(120_001, 120_000)).toBe(
    "Melebihi sisa kasbon Rp120.000",
  );
  expect(repaymentProblem(120_000, 120_000)).toBeNull();
  expect(repaymentProblem(1, 120_000)).toBeNull();
});

test("repaymentProblem: urutan saldo ≤ 0 lebih dulu dari jumlah", () => {
  expect(repaymentProblem(0, 0)).toBe("Pelanggan ini tidak punya kasbon");
  expect(repaymentProblem(null, 0)).toBe("Pelanggan ini tidak punya kasbon");
});
