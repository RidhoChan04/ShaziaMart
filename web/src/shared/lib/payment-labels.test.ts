import { describe, expect, test } from "vitest";
import type { ReceiptPayment } from "../api/gen/shaziaMartAPI.schemas";
import { paidSummary, paymentSummary } from "./payment-labels";

const laci: ReceiptPayment = {
  timing: "sekarang",
  method: "tunai",
  cashSource: "laci",
  dueDate: null,
};

describe("paymentSummary", () => {
  test.each<[ReceiptPayment, string]>([
    [laci, "Bayar sekarang · Tunai · Dari laci kasir"],
    [
      { ...laci, cashSource: "pemilik" },
      "Bayar sekarang · Tunai · Uang pemilik",
    ],
    [
      { ...laci, method: "transfer", cashSource: null },
      "Bayar sekarang · Transfer",
    ],
    [
      {
        timing: "nanti",
        method: null,
        cashSource: null,
        dueDate: "2026-11-16",
      },
      "Bayar nanti · jatuh tempo 16 Nov 2026",
    ],
  ])("%o → %s", (p, text) => {
    expect(paymentSummary(p)).toBe(text);
  });
});

test("paidSummary: tunai laci / tunai pemilik / transfer", () => {
  expect(paidSummary({ method: "tunai", cashSource: "laci" })).toBe(
    "Tunai · Dari laci kasir",
  );
  expect(paidSummary({ method: "tunai", cashSource: "pemilik" })).toBe(
    "Tunai · Uang pemilik",
  );
  expect(paidSummary({ method: "transfer", cashSource: null })).toBe(
    "Transfer",
  );
});
