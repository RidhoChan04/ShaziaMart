import { describe, expect, test } from "vitest";
import type { ReceiptPayment } from "../api/gen/shaziaMartAPI.schemas";
import {
  cancelNoteText,
  laciPaidOf,
  paidSummary,
  paymentSummary,
} from "./payment-labels";

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

describe("laciPaidOf & cancelNoteText", () => {
  const nanti: ReceiptPayment = {
    timing: "nanti",
    method: null,
    cashSource: null,
    dueDate: "2026-11-16",
  };
  test("laci langsung, lunas dari laci, lunas dari pemilik, belum lunas", () => {
    expect(laciPaidOf({ payment: laci, paid: null, total: 1_442_000 })).toBe(
      1_442_000,
    );
    const paid = (cashSource: "laci" | "pemilik") => ({
      at: 1,
      method: "tunai" as const,
      cashSource,
      byName: "Pak Ahmad",
    });
    expect(laciPaidOf({ payment: nanti, paid: paid("laci"), total: 500 })).toBe(
      500,
    );
    expect(
      laciPaidOf({ payment: nanti, paid: paid("pemilik"), total: 500 }),
    ).toBe(0);
    expect(laciPaidOf({ payment: nanti, paid: null, total: 500 })).toBe(0);
  });
  test("keterangan batal menyebut nominal laci hanya bila ada", () => {
    expect(cancelNoteText(0)).toBe(
      "Stok, HPP, dan utang nota ini dibalik. Tidak bisa diurungkan. Tidak ada uang laci yang berubah.",
    );
    expect(cancelNoteText(1_442_000)).toBe(
      "Stok, HPP, dan utang nota ini dibalik. Tidak bisa diurungkan. Uang Rp1.442.000 yang tadi keluar dari laci dicatat masuk lagi ke shift kasir yang sedang berjalan. Kalau tidak ada shift berjalan, uang ini tidak dicatat ulang — sesuaikan uang laci sendiri.",
    );
  });
});
