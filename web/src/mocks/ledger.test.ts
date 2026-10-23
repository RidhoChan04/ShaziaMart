import { expect, test } from "vitest";
import type { MockState } from "./db";
import { appendCredit, balanceOf, oldestUnpaidAt } from "./ledger";
import { createSeedState } from "./seed-data";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 23, 3);

/** State seed dengan buku kasbon kosong dan semua saldo 0. */
function emptyLedger(): MockState {
  const s = createSeedState(NOW);
  s.creditLedger = [];
  for (const c of s.customers) c.balance = 0;
  return s;
}

const idOf = (s: MockState, name: string) =>
  s.customers.find((c) => c.name === name)?.id ?? "";

test("appendCredit menambah entri dan menyamakan saldo pelanggan", () => {
  const s = emptyLedger();
  const dewi = idOf(s, "Mbak Dewi");
  appendCredit(s, { customerId: dewi, amount: 30000, at: NOW, saleId: "a" });
  appendCredit(s, { customerId: dewi, amount: -10000, at: NOW, saleId: "a" });
  expect(s.creditLedger.map((e) => [e.customerId, e.amount, e.saleId])).toEqual(
    [
      [dewi, 30000, "a"],
      [dewi, -10000, "a"],
    ],
  );
  expect(new Set(s.creditLedger.map((e) => e.id)).size).toBe(2);
  expect(balanceOf(s, dewi)).toBe(20000);
  expect(s.customers.find((c) => c.id === dewi)?.balance).toBe(20000);
  expect(balanceOf(s, idOf(s, "Bu Sari"))).toBe(0);
});

test.each([
  ["tanpa entri", [], null],
  ["satu kasbon", [[10, 5000]], 10],
  [
    "pelunasan memakan kasbon terlama dulu",
    [
      [30, 5000],
      [20, 7000],
      [5, -6000],
    ],
    20,
  ],
  [
    "lunas persis",
    [
      [30, 5000],
      [5, -5000],
    ],
    null,
  ],
  [
    "pelunasan sebagian kasbon terlama",
    [
      [30, 5000],
      [20, 7000],
      [5, -4000],
    ],
    30,
  ],
  [
    "kelebihan bayar memakan kasbon berikutnya",
    [
      [30, 5000],
      [20, -8000],
      [10, 2000],
      [5, 4000],
    ],
    5,
  ],
] as const)("oldestUnpaidAt FIFO: %s", (_, entries, daysAgo) => {
  const s = emptyLedger();
  const udin = idOf(s, "Pak Udin");
  for (const [days, amount] of entries) {
    appendCredit(s, {
      customerId: udin,
      amount,
      at: NOW - days * DAY,
      saleId: null,
    });
  }
  expect(oldestUnpaidAt(s, udin)).toBe(
    daysAgo === null ? null : NOW - daysAgo * DAY,
  );
});
