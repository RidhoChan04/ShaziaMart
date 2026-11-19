import { describe, expect, test } from "vitest";
import type { PaymentInput } from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  type MockCreditPayment,
  type MockQrisDay,
  type MockSale,
  type MockState,
  mockDb,
} from "../db";
import {
  qrisDayOf,
  qrisDayTotals,
  shiftQris,
  unreconciledQris,
} from "./qris-days";

/** Jam dinding WIB → epoch UTC. */
const wib = (y: number, m: number, d: number, h: number, min = 0) =>
  Date.UTC(y, m - 1, d, h - 7, min);

/** Kamis 19 Nov 2026 10.00 WIB. */
const NOW = wib(2026, 11, 19, 10);

let n = 0;
function sale(
  at: number,
  payments: PaymentInput[],
  patch: Partial<MockSale> = {},
): MockSale {
  n += 1;
  const total = payments.reduce((a, p) => a + p.amount, 0);
  return {
    id: `q-${n}`,
    number: `S-${n}`,
    createdAt: at,
    kasirName: "Rina",
    shiftId: "sh-1",
    items: [],
    total,
    payments,
    cashReceived: 0,
    change: 0,
    customerId: null,
    status: "selesai",
    printStatus: "tercetak",
    costTotal: 0,
    lineCosts: [],
    voidedAt: null,
    voidedById: null,
    voidedByName: null,
    voidReason: null,
    voidChannel: null,
    voidRefund: null,
    creditOverLimit: null,
    ...patch,
  };
}

const voided: Partial<MockSale> = {
  status: "dibatalkan",
  voidedAt: NOW,
  voidedById: "u-rina",
  voidedByName: "Rina",
  voidReason: "Salah input",
  voidChannel: "kasir",
  voidRefund: { cash: 0, qris: 0, qrisSource: "pemilik", drawer: 0 },
};

function repayment(
  at: number,
  amount: number,
  patch: Partial<MockCreditPayment> = {},
): MockCreditPayment {
  n += 1;
  return {
    id: `p-${n}`,
    customerId: "c-1",
    amount,
    at,
    channel: "kasir",
    method: "qris",
    createdById: "u-rina",
    createdByName: "Rina",
    shiftId: "sh-1",
    cashReceived: 0,
    change: 0,
    balanceAfter: 0,
    printStatus: "tercetak",
    cancelledAt: null,
    cancelledById: null,
    cancelledByName: null,
    cancelledChannel: null,
    cancelReason: null,
    ...patch,
  };
}

const mark = (
  date: string,
  markedTotal: number,
  patch: Partial<MockQrisDay> = {},
): MockQrisDay => ({
  date,
  status: "cocok",
  note: null,
  markedById: "u-owner",
  markedByName: "Pak Ahmad",
  markedAt: NOW - 3_600_000,
  markedTotal,
  ...patch,
});

function stateWith(patch: Partial<MockState>): MockState {
  return {
    ...(mockDb.get() as MockState),
    sales: [],
    creditPayments: [],
    qrisDays: {},
    qrisSince: "2026-11-15",
    ...patch,
  };
}

const qris = (amount: number): PaymentInput => ({ method: "qris", amount });
const cash = (amount: number): PaymentInput => ({ method: "cash", amount });

describe("qrisDayTotals (K11)", () => {
  test("penjualan QRIS 00.30 WIB masuk tanggal itu, bukan kemarin", () => {
    const state = stateWith({
      sales: [sale(wib(2026, 11, 18, 0, 30), [qris(15_000)])],
    });
    expect(qrisDayTotals(state, "2026-11-18", NOW)).toMatchObject({
      date: "2026-11-18",
      sales: 15_000,
      total: 15_000,
    });
    expect(qrisDayTotals(state, "2026-11-17", NOW).total).toBe(0);
  });

  test("campuran tunai 30.000 + QRIS 20.000 → sales +20.000 (bagian QRIS saja)", () => {
    const state = stateWith({
      sales: [sale(wib(2026, 11, 18, 9), [cash(30_000), qris(20_000)])],
    });
    expect(qrisDayTotals(state, "2026-11-18", NOW)).toEqual({
      date: "2026-11-18",
      sales: 20_000,
      repayments: 0,
      total: 20_000,
      voidedCount: 0,
      voidedTotal: 0,
      closed: true,
      changedAfterMark: false,
    });
  });

  test("penjualan & pelunasan QRIS dibatalkan → tidak di total, ada di voided*; tunai/jalur pemilik diabaikan", () => {
    const day = (h: number) => wib(2026, 11, 18, h);
    const state = stateWith({
      sales: [
        sale(day(8), [qris(50_000)]),
        sale(day(9), [cash(5_000), qris(12_000)], voided),
        sale(day(10), [cash(40_000)]),
      ],
      creditPayments: [
        repayment(day(11), 25_000),
        repayment(day(12), 7_000, {
          cancelledAt: day(13),
          cancelledById: "u-rina",
          cancelledByName: "Rina",
          cancelledChannel: "kasir",
          cancelReason: "Salah pelanggan",
        }),
        repayment(day(14), 30_000, { method: "tunai" }),
        repayment(day(15), 40_000, { channel: "pemilik", method: "transfer" }),
      ],
    });
    expect(qrisDayTotals(state, "2026-11-18", NOW)).toEqual({
      date: "2026-11-18",
      sales: 50_000,
      repayments: 25_000,
      total: 75_000,
      voidedCount: 2,
      voidedTotal: 19_000,
      closed: true,
      changedAfterMark: false,
    });
  });

  test("hari ini belum selesai (closed false); kemarin selesai", () => {
    const state = stateWith({});
    expect(qrisDayTotals(state, "2026-11-19", NOW).closed).toBe(false);
    expect(qrisDayTotals(state, "2026-11-18", NOW).closed).toBe(true);
  });
});

describe("qrisDayOf: status dibaca (K21)", () => {
  test("tanpa tanda → belum, tanpa penanda", () => {
    const state = stateWith({
      sales: [sale(wib(2026, 11, 18, 9), [qris(20_000)])],
    });
    expect(qrisDayOf(state, "2026-11-18", NOW)).toMatchObject({
      status: "belum",
      note: null,
      markedByName: null,
      markedAt: null,
      changedAfterMark: false,
    });
  });

  test("ditandai cocok 500.000 lalu QRIS 20.000 dibatalkan → belum + changedAfterMark, tanda lama tetap", () => {
    const at = wib(2026, 11, 18, 9);
    const small = sale(at, [qris(20_000)]);
    const marks = { "2026-11-18": mark("2026-11-18", 500_000) };
    const before = stateWith({
      sales: [sale(at, [qris(480_000)]), small],
      qrisDays: marks,
    });
    expect(qrisDayOf(before, "2026-11-18", NOW)).toMatchObject({
      total: 500_000,
      status: "cocok",
      changedAfterMark: false,
    });
    expect(unreconciledQris(before, NOW)).toBeNull();

    const after = stateWith({
      sales: [sale(at, [qris(480_000)]), { ...small, ...voided }],
      qrisDays: marks,
    });
    expect(qrisDayOf(after, "2026-11-18", NOW)).toMatchObject({
      total: 480_000,
      status: "belum",
      changedAfterMark: true,
      markedByName: "Pak Ahmad",
      markedAt: NOW - 3_600_000,
    });
    expect(unreconciledQris(after, NOW)).toEqual({
      count: 1,
      from: "2026-11-18",
      to: "2026-11-18",
    });
  });

  test("tidak_cocok dengan catatan dibaca apa adanya", () => {
    const state = stateWith({
      sales: [sale(wib(2026, 11, 17, 9), [qris(20_000)])],
      qrisDays: {
        "2026-11-17": mark("2026-11-17", 20_000, {
          status: "tidak_cocok",
          note: "Mutasi bank kurang 5.000",
        }),
      },
    });
    expect(qrisDayOf(state, "2026-11-17", NOW)).toMatchObject({
      status: "tidak_cocok",
      note: "Mutasi bank kurang 5.000",
      changedAfterMark: false,
    });
  });
});

describe("unreconciledQris (S7, K11)", () => {
  const sales = () => [
    sale(wib(2026, 11, 14, 9), [qris(10_000)]), // sebelum qrisSince
    sale(wib(2026, 11, 16, 9), [qris(20_000)]),
    sale(wib(2026, 11, 17, 9), [cash(30_000)]), // hari tanpa QRIS
    sale(wib(2026, 11, 18, 0, 30), [qris(5_000)]),
    sale(wib(2026, 11, 19, 8), [qris(9_000)]), // hari ini
  ];

  test("dua hari belum ditandai sejak qrisSince → {count 2, from, to}; hari tanpa QRIS & hari ini tidak dihitung", () => {
    expect(unreconciledQris(stateWith({ sales: sales() }), NOW)).toEqual({
      count: 2,
      from: "2026-11-16",
      to: "2026-11-18",
    });
  });

  test("hari yang semua QRIS-nya dibatalkan (total 0) tidak dihitung", () => {
    const state = stateWith({
      sales: [sale(wib(2026, 11, 16, 9), [qris(20_000)], voided)],
    });
    expect(unreconciledQris(state, NOW)).toBeNull();
  });

  test("tandai keduanya → null", () => {
    const state = stateWith({
      sales: sales(),
      qrisDays: {
        "2026-11-16": mark("2026-11-16", 20_000),
        "2026-11-18": mark("2026-11-18", 5_000, {
          status: "tidak_cocok",
          note: "Kurang",
        }),
      },
    });
    expect(unreconciledQris(state, NOW)).toBeNull();
  });
});

describe("shiftQris (rincian shift pemilik)", () => {
  test("Σ bagian QRIS penjualan & pelunasan kasir QRIS shift itu yang tidak dibatalkan", () => {
    const at = wib(2026, 11, 19, 8);
    const state = stateWith({
      sales: [
        sale(at, [cash(30_000), qris(20_000)]),
        sale(at, [qris(7_000)], voided),
        sale(at, [qris(9_000)], { shiftId: "sh-2" }),
      ],
      creditPayments: [
        repayment(at, 15_000),
        repayment(at, 4_000, { cancelledAt: at }),
        repayment(at, 50_000, { method: "tunai" }),
        repayment(at, 6_000, { shiftId: "sh-2" }),
      ],
    });
    expect(shiftQris(state, "sh-1")).toEqual({
      sales: 20_000,
      repayments: 15_000,
    });
  });
});
