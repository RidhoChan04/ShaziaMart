import { expect, test } from "vitest";
import type { Customer } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { repaymentState, toRepaymentInput } from "./repayment-model";

const sari: Customer = {
  id: "cus-sari",
  name: "Bu Sari",
  phone: "081234500001",
  creditLimit: 500_000,
  balance: 120_000,
};

test.each([
  [
    "50.000",
    "tunai",
    "100.000",
    {
      canSubmit: true,
      change: 50_000,
      shortage: null,
      balanceAfter: 70_000,
      problem: null,
    },
  ],
  [
    "50.000",
    "tunai",
    "40.000",
    {
      canSubmit: false,
      change: null,
      shortage: 10_000,
      balanceAfter: 70_000,
      problem: null,
    },
  ],
  [
    "50.000",
    "qris",
    "",
    {
      canSubmit: true,
      change: null,
      shortage: null,
      balanceAfter: 70_000,
      problem: null,
    },
  ],
  [
    "130.000",
    "tunai",
    "200.000",
    { canSubmit: false, problem: "Melebihi sisa kasbon Rp120.000" },
  ],
  ["0", "qris", "", { canSubmit: false, problem: "Jumlah minimal Rp1" }],
] as const)("nominal %s %s diterima %s", (amount, method, received, want) =>
  expect(
    repaymentState({ customer: sari, amount, method, received }),
  ).toMatchObject(want),
);

test("tunai belum diisi uang diterima → belum bisa kirim, tanpa kembalian maupun kurang", () => {
  expect(
    repaymentState({
      customer: sari,
      amount: "50.000",
      method: "tunai",
      received: "",
    }),
  ).toMatchObject({
    canSubmit: false,
    change: null,
    shortage: null,
    problem: null,
  });
});

test("nominal kosong → belum bisa kirim tanpa galat; lunas penuh → balanceAfter 0", () => {
  expect(
    repaymentState({
      customer: sari,
      amount: "",
      method: "qris",
      received: "",
    }),
  ).toMatchObject({ canSubmit: false, amount: null, problem: null });
  expect(
    repaymentState({
      customer: sari,
      amount: "120.000",
      method: "qris",
      received: "",
    }),
  ).toMatchObject({ canSubmit: true, balanceAfter: 0 });
});

test("saldo 0 atau minus → Pelanggan ini tidak punya kasbon; tanpa pelanggan → tidak bisa kirim", () => {
  for (const balance of [0, -40_000]) {
    expect(
      repaymentState({
        customer: { ...sari, balance },
        amount: "10.000",
        method: "qris",
        received: "",
      }),
    ).toMatchObject({
      canSubmit: false,
      problem: "Pelanggan ini tidak punya kasbon",
    });
  }
  expect(
    repaymentState({
      customer: null,
      amount: "10.000",
      method: "qris",
      received: "",
    }),
  ).toMatchObject({ canSubmit: false, problem: null, balanceAfter: null });
});

test("toRepaymentInput: QRIS → cashReceived null; Tunai → cashReceived = uang diterima", () => {
  const tunai = {
    customer: sari,
    amount: "50.000",
    method: "tunai",
    received: "100.000",
  } as const;
  expect(toRepaymentInput("id-1", tunai, repaymentState(tunai), true)).toEqual({
    id: "id-1",
    customerId: "cus-sari",
    amount: 50_000,
    method: "tunai",
    cashReceived: 100_000,
    print: true,
  });
  const qris = {
    customer: sari,
    amount: "50.000",
    method: "qris",
    received: "999",
  } as const;
  expect(toRepaymentInput("id-2", qris, repaymentState(qris), false)).toEqual({
    id: "id-2",
    customerId: "cus-sari",
    amount: 50_000,
    method: "qris",
    cashReceived: null,
    print: false,
  });
});

test("toRepaymentInput melempar bila isian belum valid", () => {
  const d = {
    customer: sari,
    amount: "0",
    method: "qris",
    received: "",
  } as const;
  expect(() => toRepaymentInput("x", d, repaymentState(d), false)).toThrow();
});
