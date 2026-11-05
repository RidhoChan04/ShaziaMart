import { describe, expect, test } from "vitest";
import { DAY_MS } from "@/shared/lib/business-day";
import type {
  MockCreditPayment,
  MockSale,
  MockState,
  MockVoidRefund,
} from "./db";
import {
  cashierExceptions,
  exceptionAttention,
  reviewExceptions,
} from "./exceptions";
import { createSeedState } from "./seed-data";

/** Kamis 5 Nov 2026 14.00 WIB. */
const NOW = Date.UTC(2026, 10, 5, 7);
const HOUR = 3_600_000;

let n = 0;
function sale(over: Partial<MockSale> = {}): MockSale {
  n += 1;
  return {
    id: `s-${n}`,
    number: `20261105-${String(n).padStart(4, "0")}`,
    createdAt: NOW - 2 * HOUR,
    kasirName: "Rina",
    shiftId: "buka",
    items: [],
    total: 50_000,
    payments: [{ method: "cash", amount: 50_000 }],
    cashReceived: 50_000,
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
    ...over,
  };
}

const refund = (over: Partial<MockVoidRefund> = {}): MockVoidRefund => ({
  cash: 0,
  qris: 0,
  qrisSource: null,
  drawer: 0,
  ...over,
});

/** Penjualan yang dibatalkan `channel` pada jam `at`. */
const voided = (
  at: number,
  channel: "kasir" | "pemilik",
  over: Partial<MockSale> = {},
): MockSale =>
  sale({
    status: "dibatalkan",
    voidedAt: at,
    voidedById: channel === "kasir" ? "u-budi" : "u-ahmad",
    voidedByName: channel === "kasir" ? "Budi" : "Pak Ahmad",
    voidReason: "salah input",
    voidChannel: channel,
    voidRefund: refund({ cash: 50_000 }),
    ...over,
  });

function payment(over: Partial<MockCreditPayment> = {}): MockCreditPayment {
  n += 1;
  return {
    id: `p-${n}`,
    customerId: "",
    amount: 75_000,
    at: NOW - 3 * HOUR,
    channel: "kasir",
    method: "tunai",
    createdById: "u-rina",
    createdByName: "Rina",
    shiftId: "buka",
    cashReceived: 75_000,
    change: 0,
    balanceAfter: 0,
    printStatus: "tercetak",
    cancelledAt: NOW - HOUR,
    cancelledById: "u-rina",
    cancelledByName: "Rina",
    cancelledChannel: "kasir",
    cancelReason: "salah pelanggan",
    ...over,
  };
}

function state(): MockState {
  const s = createSeedState(NOW);
  s.sales = [];
  s.creditPayments = [];
  return s;
}

describe("cashierExceptions", () => {
  test("tiga jenis dari data: void kasir, batal pelunasan kasir, kasbon lewat limit (penjualan dibatalkan tidak ikut lewat limit); batal oleh pemilik tidak ikut", () => {
    const s = state();
    const sari = s.customers.find((c) => c.name === "Bu Sari");
    s.sales.push(
      voided(NOW - HOUR, "kasir", { customerId: sari?.id ?? null }),
      voided(NOW - HOUR, "pemilik"),
      sale({
        customerId: sari?.id ?? null,
        creditOverLimit: { excess: 26_000, reason: "hajatan" },
      }),
      voided(NOW - 30 * 60_000, "pemilik", {
        creditOverLimit: { excess: 9_000, reason: "batal" },
      }),
    );
    s.creditPayments.push(
      payment({ customerId: sari?.id ?? "" }),
      payment({
        cancelledChannel: "pemilik",
        cancelledByName: "Pak Ahmad",
      }),
      payment({ cancelledAt: null, cancelledChannel: null }),
    );
    const [batal] = s.sales;
    expect(cashierExceptions(s, "batal_transaksi")).toEqual([
      {
        id: batal?.id,
        kind: "batal_transaksi",
        at: NOW - HOUR,
        kasirName: "Budi",
        amount: 50_000,
        reason: "salah input",
        customerName: "Bu Sari",
        saleId: batal?.id,
        saleNumber: batal?.number,
        paymentId: null,
        fromClosedShift: false,
        refund: 0,
        qrisToOwner: 0,
      },
    ]);
    const [p] = s.creditPayments;
    expect(cashierExceptions(s, "batal_pelunasan")).toEqual([
      {
        id: p?.id,
        kind: "batal_pelunasan",
        at: NOW - HOUR,
        kasirName: "Rina",
        amount: 75_000,
        reason: "salah pelanggan",
        customerName: "Bu Sari",
        saleId: null,
        saleNumber: null,
        paymentId: p?.id,
        fromClosedShift: false,
        refund: 0,
        qrisToOwner: 0,
      },
    ]);
    const over = s.sales[2];
    expect(cashierExceptions(s, "kasbon_lewat_limit")).toEqual([
      {
        id: over?.id,
        kind: "kasbon_lewat_limit",
        at: NOW - 2 * HOUR,
        kasirName: "Rina",
        amount: 26_000,
        reason: "hajatan",
        customerName: "Bu Sari",
        saleId: over?.id,
        saleNumber: over?.number,
        paymentId: null,
        fromClosedShift: false,
        refund: 0,
        qrisToOwner: 0,
      },
    ]);
  });

  test("(ruling R12, koreksi mockup M1) void kasir transaksi shift lama → batal_transaksi dengan fromClosedShift true, refund = voidRefund.drawer, qrisToOwner = bagian QRIS `pemilik`", () => {
    const s = state();
    const [lama] = s.closedShifts.slice(-1);
    s.sales.push(
      voided(NOW - HOUR, "kasir", {
        shiftId: lama?.shiftId ?? "",
        createdAt: (lama?.closedAt ?? 0) - HOUR,
        voidRefund: refund({
          cash: 30_000,
          qris: 20_000,
          qrisSource: "pemilik",
          drawer: 30_000,
        }),
      }),
    );
    expect(cashierExceptions(s, "batal_transaksi")[0]).toMatchObject({
      fromClosedShift: true,
      refund: 30_000,
      qrisToOwner: 20_000,
    });
  });

  test("(cek ulang M1) angka persis: shift lama tunai 30.000 + QRIS 20.000 pemilik → {true, 30.000, 20.000}; laci → {refund 50.000, qrisToOwner 0}; shift ini QRIS 20.000 laci → {false, 20.000, 0}; shift ini QRIS pemilik → {refund 0, qrisToOwner 20.000}", () => {
    const s = state();
    const lama = s.closedShifts.at(-1);
    const old = {
      shiftId: lama?.shiftId ?? "",
      createdAt: (lama?.closedAt ?? 0) - HOUR,
    };
    const rows: [Partial<MockSale>, MockVoidRefund][] = [
      [
        old,
        refund({
          cash: 30_000,
          qris: 20_000,
          qrisSource: "pemilik",
          drawer: 30_000,
        }),
      ],
      [
        old,
        refund({
          cash: 30_000,
          qris: 20_000,
          qrisSource: "laci",
          drawer: 50_000,
        }),
      ],
      [{}, refund({ qris: 20_000, qrisSource: "laci", drawer: 20_000 })],
      [{}, refund({ qris: 20_000, qrisSource: "pemilik" })],
    ];
    s.sales.push(
      ...rows.map(([o, r], i) =>
        voided(NOW - (10 - i) * 60_000, "kasir", { ...o, voidRefund: r }),
      ),
    );
    const pick = ({
      fromClosedShift,
      refund: drawer,
      qrisToOwner,
    }: {
      fromClosedShift: boolean;
      refund: number;
      qrisToOwner: number;
    }) => [fromClosedShift, drawer, qrisToOwner];
    // Terbaru dulu.
    expect(cashierExceptions(s, "batal_transaksi").map(pick)).toEqual([
      [false, 0, 20_000],
      [false, 20_000, 0],
      [true, 50_000, 0],
      [true, 30_000, 20_000],
    ]);
  });
});

describe("exceptionAttention & reviewExceptions (ruling R9)", () => {
  test("menumpuk sejak reviewedAt tanpa batas umur: kejadian 40 hari lalu tetap terhitung; from/to tanggal WIB; urutan jenis tetap", () => {
    const s = state();
    expect(exceptionAttention(s)).toEqual([]);
    s.sales.push(
      sale({
        createdAt: NOW - HOUR,
        creditOverLimit: { excess: 5_000, reason: "x" },
      }),
      voided(NOW - 40 * DAY_MS, "kasir", { total: 12_000 }),
      // 00.30 WIB 5 Nov = 4 Nov 17.30 UTC → tanggal WIB 5 Nov.
      voided(Date.UTC(2026, 10, 4, 17, 30), "kasir", { total: 8_000 }),
    );
    s.creditPayments.push(payment());
    expect(exceptionAttention(s)).toEqual([
      {
        kind: "batal_transaksi",
        count: 2,
        total: 20_000,
        from: "2026-09-26",
        to: "2026-11-05",
      },
      {
        kind: "batal_pelunasan",
        count: 1,
        total: 75_000,
        from: "2026-11-05",
        to: "2026-11-05",
      },
      {
        kind: "kasbon_lewat_limit",
        count: 1,
        total: 5_000,
        from: "2026-11-05",
        to: "2026-11-05",
      },
    ]);
  });

  test("review upTo: kejadian sesudah upTo tetap muncul; upTo di masa depan dijepit ke now; review ulang dengan upTo lebih kecil tidak memundurkan", () => {
    const s = state();
    s.sales.push(
      voided(NOW - 3 * HOUR, "kasir"),
      voided(NOW - HOUR, "kasir", { total: 7_000 }),
    );
    reviewExceptions(s, "batal_transaksi", NOW - 2 * HOUR, NOW);
    expect(s.exceptionReviews.batal_transaksi).toBe(NOW - 2 * HOUR);
    expect(exceptionAttention(s)).toEqual([
      {
        kind: "batal_transaksi",
        count: 1,
        total: 7_000,
        from: "2026-11-05",
        to: "2026-11-05",
      },
    ]);
    reviewExceptions(s, "batal_transaksi", NOW + DAY_MS, NOW);
    expect(s.exceptionReviews.batal_transaksi).toBe(NOW);
    expect(exceptionAttention(s)).toEqual([]);
    reviewExceptions(s, "batal_transaksi", NOW - 5 * HOUR, NOW);
    expect(s.exceptionReviews.batal_transaksi).toBe(NOW);
    expect(s.exceptionReviews.batal_pelunasan).toBeNull();
    // Kejadian tepat di reviewedAt sudah ditinjau (at > reviewedAt).
    s.sales.push(voided(NOW, "kasir"));
    expect(exceptionAttention(s)).toEqual([]);
  });
});
