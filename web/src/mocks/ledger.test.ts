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
  appendCredit(s, {
    customerId: dewi,
    amount: 30000,
    at: NOW,
    saleId: "a",
    paymentId: null,
  });
  appendCredit(s, {
    customerId: dewi,
    amount: -10000,
    at: NOW,
    saleId: "a",
    paymentId: null,
  });
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
      paymentId: null,
    });
  }
  expect(oldestUnpaidAt(s, udin)).toBe(
    daysAgo === null ? null : NOW - daysAgo * DAY,
  );
});

test.each([
  [
    "batal kasbon membatalkan entrinya sendiri, utang 35 hari tetap terlihat",
    [
      [35, 50000, null],
      [0, 60000, "s1"],
      [0, -60000, "s1"],
    ],
    35,
  ],
  [
    "batal campuran (bagian kasbon saja) membatalkan entrinya sendiri",
    [
      [40, 10000, null],
      [2, 16000, "s2"],
      [1, -16000, "s2"],
    ],
    40,
  ],
  [
    "pelunasan tanpa saleId tetap FIFO di samping batal",
    [
      [40, 10000, null],
      [20, 30000, "s3"],
      [10, -10000, null],
      [5, 25000, "s4"],
      [1, -25000, "s4"],
    ],
    20,
  ],
  [
    "pelunasan memakan kasbon penjualan terlama, bukan kasbon tanpa saleId",
    [
      [40, 30000, "s5"],
      [20, 10000, null],
      [10, -30000, null],
    ],
    20,
  ],
] as const)("oldestUnpaidAt batal: %s", (_, entries, daysAgo) => {
  const s = emptyLedger();
  const udin = idOf(s, "Pak Udin");
  for (const [days, amount, saleId] of entries) {
    appendCredit(s, {
      customerId: udin,
      amount,
      at: NOW - days * DAY,
      saleId,
      paymentId: null,
    });
  }
  expect(oldestUnpaidAt(s, udin)).toBe(NOW - daysAgo * DAY);
});

type Row = [
  daysAgo: number,
  amount: number,
  saleId: string | null,
  paymentId: string | null,
];

/** Bu Tini seed: 70h +300k, 45h +500k, 38h −300k (pelunasan p0), 9h +140k. */
const TINI: Row[] = [
  [70, 300_000, null, null],
  [45, 500_000, null, null],
  [38, -300_000, null, "p0"],
  [9, 140_000, null, null],
];

function ledgerOf(rows: readonly Row[], name = "Bu Tini") {
  const s = emptyLedger();
  const id = idOf(s, name);
  const add = (
    days: number,
    amount: number,
    saleId: string | null,
    paymentId: string | null,
  ) =>
    appendCredit(s, {
      customerId: id,
      amount,
      at: NOW - days * DAY,
      saleId,
      paymentId,
    });
  for (const r of rows) add(...r);
  return { s, id, add };
}

test("Bu Tini seed: kasbon tertua belum lunas 45 hari", () => {
  const { s, id } = ledgerOf(TINI);
  expect(balanceOf(s, id)).toBe(640_000);
  expect(oldestUnpaidAt(s, id)).toBe(NOW - 45 * DAY);
});

test("cicilan FIFO (R6): pelunasan 500k hari ini → tertua 9 hari", () => {
  const { s, id, add } = ledgerOf(TINI);
  add(0, -500_000, null, "p1");
  expect(balanceOf(s, id)).toBe(140_000);
  expect(oldestUnpaidAt(s, id)).toBe(NOW - 9 * DAY);
});

test("batal pelunasan mengembalikan umur lama, bukan kasbon baru (pembalik +500k p1 → tertua 45 hari)", () => {
  const { s, id, add } = ledgerOf(TINI);
  add(0, -500_000, null, "p1");
  add(0, 500_000, null, "p1");
  expect(balanceOf(s, id)).toBe(640_000);
  expect(oldestUnpaidAt(s, id)).toBe(NOW - 45 * DAY);
  // Pembalik pelunasan seed lama juga mengembalikan kasbon 70 hari.
  add(0, 300_000, null, "p0");
  expect(oldestUnpaidAt(s, id)).toBe(NOW - 70 * DAY);
});

test("saldo minus (lebih bayar) & kasbon berikutnya memotong lebih bayar dulu", () => {
  const { s, id, add } = ledgerOf([], "Pak Udin");
  add(5, 100_000, "s1", null);
  add(4, -60_000, null, "p1");
  add(3, -100_000, "s1", null);
  expect(balanceOf(s, id)).toBe(-60_000);
  expect(oldestUnpaidAt(s, id)).toBeNull();
  add(2, 50_000, "s2", null);
  expect(balanceOf(s, id)).toBe(-10_000);
  expect(oldestUnpaidAt(s, id)).toBeNull();
  add(1, 80_000, "s3", null);
  expect(balanceOf(s, id)).toBe(70_000);
  expect(oldestUnpaidAt(s, id)).toBe(NOW - 1 * DAY);
});
