import { describe, expect, test } from "vitest";
import type {
  CashierException,
  ExceptionAttention,
  ExceptionKind,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { DAY_MS } from "@/shared/lib/business-day";
import { reviewSeedSamples } from "./attention-fixtures";
import type {
  MockClosedShift,
  MockCreditPayment,
  MockDrawerExpense,
  MockSale,
  MockShift,
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
  // (K20) Contoh seed F3c-2a sudah ditinjau: tes F3c-1 di bawah hanya melihat butir buatannya.
  reviewSeedSamples(s, NOW);
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
    expect(cashierExceptions(s, "batal_transaksi", NOW)).toEqual([
      {
        id: batal?.id,
        kind: "batal_transaksi",
        at: NOW - HOUR,
        kasirId: "u-budi",
        kasirName: "Budi",
        amount: 50_000,
        reason: "salah input",
        customerName: "Bu Sari",
        saleId: batal?.id,
        saleNumber: batal?.number,
        paymentId: null,
        shiftId: null,
        durationMinutes: null,
        fromClosedShift: false,
        refund: 0,
        qrisToOwner: 0,
        overLimitExcess: null,
      },
    ]);
    const [p] = s.creditPayments;
    expect(cashierExceptions(s, "batal_pelunasan", NOW)).toEqual([
      {
        id: p?.id,
        kind: "batal_pelunasan",
        at: NOW - HOUR,
        kasirId: "u-rina",
        kasirName: "Rina",
        amount: 75_000,
        reason: "salah pelanggan",
        customerName: "Bu Sari",
        saleId: null,
        saleNumber: null,
        paymentId: p?.id,
        shiftId: null,
        durationMinutes: null,
        fromClosedShift: false,
        refund: 0,
        qrisToOwner: 0,
        overLimitExcess: null,
      },
    ]);
    const over = s.sales[2];
    expect(cashierExceptions(s, "kasbon_lewat_limit", NOW)).toEqual([
      {
        id: over?.id,
        kind: "kasbon_lewat_limit",
        at: NOW - 2 * HOUR,
        // Shift "buka" tidak dikenal state uji → id kasir tidak diketahui.
        kasirId: null,
        kasirName: "Rina",
        amount: 26_000,
        reason: "hajatan",
        customerName: "Bu Sari",
        saleId: over?.id,
        saleNumber: over?.number,
        paymentId: null,
        shiftId: null,
        durationMinutes: null,
        fromClosedShift: false,
        refund: 0,
        qrisToOwner: 0,
        overLimitExcess: null,
      },
    ]);
  });

  test("(fix final 10) batal_transaksi membawa kelebihan limit kasbon transaksi itu (creditOverLimit.excess); tanpa lewat limit → null; kasbon lewat limit yang dibatalkan hilang dari daftarnya (K29)", () => {
    const s = state();
    s.sales.push(
      voided(NOW - HOUR, "kasir", {
        creditOverLimit: { excess: 70_000, reason: "Anak sakit" },
      }),
      voided(NOW - HOUR / 2, "kasir"),
    );
    const items = cashierExceptions(s, "batal_transaksi", NOW);
    expect(items.map((e) => e.overLimitExcess)).toEqual([null, 70_000]);
    expect(cashierExceptions(s, "kasbon_lewat_limit", NOW)).toEqual([]);
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
    expect(cashierExceptions(s, "batal_transaksi", NOW)[0]).toMatchObject({
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
    expect(cashierExceptions(s, "batal_transaksi", NOW).map(pick)).toEqual([
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
    expect(exceptionAttention(s, NOW)).toEqual([]);
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
    expect(exceptionAttention(s, NOW)).toEqual([
      {
        kind: "batal_transaksi",
        count: 2,
        total: 20_000,
        shortage: 0,
        from: "2026-09-26",
        to: "2026-11-05",
        latestAt: Date.UTC(2026, 10, 4, 17, 30),
        kasirId: null,
        kasirName: null,
        longestMinutes: null,
      },
      {
        kind: "batal_pelunasan",
        count: 1,
        total: 75_000,
        shortage: 0,
        from: "2026-11-05",
        to: "2026-11-05",
        latestAt: NOW - HOUR,
        kasirId: null,
        kasirName: null,
        longestMinutes: null,
      },
      {
        kind: "kasbon_lewat_limit",
        count: 1,
        total: 5_000,
        shortage: 0,
        from: "2026-11-05",
        to: "2026-11-05",
        latestAt: NOW - HOUR,
        kasirId: null,
        kasirName: null,
        longestMinutes: null,
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
    expect(exceptionAttention(s, NOW)).toEqual([
      {
        kind: "batal_transaksi",
        count: 1,
        total: 7_000,
        shortage: 0,
        from: "2026-11-05",
        to: "2026-11-05",
        latestAt: NOW - HOUR,
        kasirId: null,
        kasirName: null,
        longestMinutes: null,
      },
    ]);
    reviewExceptions(s, "batal_transaksi", NOW + DAY_MS, NOW);
    expect(s.exceptionReviews.batal_transaksi).toBe(NOW);
    expect(exceptionAttention(s, NOW)).toEqual([]);
    reviewExceptions(s, "batal_transaksi", NOW - 5 * HOUR, NOW);
    expect(s.exceptionReviews.batal_transaksi).toBe(NOW);
    expect(s.exceptionReviews.batal_pelunasan).toBeNull();
    // Kejadian tepat di reviewedAt sudah ditinjau (at > reviewedAt).
    s.sales.push(voided(NOW, "kasir"));
    expect(exceptionAttention(s, NOW)).toEqual([]);
  });
});

describe("(T4) kejadian F3c-2a dari state: ambang Pengaturan, butir, tinjau", () => {
  const MIN = 60_000;
  let seq = 0;

  /** Seed tanpa sumber kejadian (shift, kas keluar, penjualan) dan belum pernah ditinjau. */
  function clean(): MockState {
    const s = createSeedState(NOW);
    s.sales = [];
    s.creditPayments = [];
    s.closedShifts = [];
    s.drawerExpenses = [];
    s.cashTakes = [];
    s.shift = null;
    for (const kind of Object.keys(s.exceptionReviews) as ExceptionKind[]) {
      s.exceptionReviews[kind] = null;
    }
    s.smallShortageReviews = {};
    return s;
  }

  const kasir = (s: MockState, name: "Rina" | "Budi") => {
    const user = s.users.find((u) => u.name === name);
    if (!user) throw new Error(`seed tanpa ${name}`);
    return user;
  };

  function closed(
    s: MockState,
    name: "Rina" | "Budi",
    over: Partial<MockClosedShift> = {},
  ): MockClosedShift {
    seq += 1;
    const user = kasir(s, name);
    const c: MockClosedShift = {
      shiftId: `sh-${seq}`,
      kasirId: user.id,
      kasirName: user.name,
      openedAt: NOW - 8 * HOUR,
      closedAt: NOW - HOUR,
      openingCash: 200_000,
      suggestedOpening: null,
      openingNote: null,
      cashSales: 0,
      supplierPayments: 0,
      creditPayments: 0,
      saleRefunds: 0,
      expenses: 0,
      ownerTakes: 0,
      expectedCash: 200_000,
      countedCash: 200_000,
      difference: 0,
      salesCount: 0,
      ...over,
    };
    s.closedShifts.push(c);
    return c;
  }

  function open(
    s: MockState,
    name: "Rina" | "Budi",
    over: Partial<MockShift> = {},
  ): MockShift {
    const user = kasir(s, name);
    const shift: MockShift = {
      id: "sh-buka",
      kasirId: user.id,
      kasirName: user.name,
      openedAt: NOW - HOUR,
      openingCash: 200_000,
      suggestedOpening: null,
      openingNote: null,
      cashSales: 0,
      salesCount: 0,
      cashOuts: [],
      creditCash: [],
      saleRefunds: [],
      ...over,
    };
    s.shift = shift;
    return shift;
  }

  function expense(
    s: MockState,
    shiftId: string,
    at: number,
    amount: number,
    over: Partial<MockDrawerExpense> = {},
  ): MockDrawerExpense {
    seq += 1;
    const rina = kasir(s, "Rina");
    const e: MockDrawerExpense = {
      id: `kk-${seq}`,
      at,
      amount,
      reason: `Kas keluar ${seq}`,
      shiftId,
      createdById: rina.id,
      createdByName: rina.name,
      cancelledAt: null,
      cancelledById: null,
      cancelledByName: null,
      cancelledChannel: null,
      cancelReason: null,
      ...over,
    };
    s.drawerExpenses.push(e);
    return e;
  }

  const event = (
    e: Pick<
      CashierException,
      "id" | "kind" | "at" | "kasirId" | "kasirName" | "amount" | "shiftId"
    > &
      Partial<CashierException>,
  ): CashierException => ({
    reason: null,
    customerName: null,
    saleId: null,
    saleNumber: null,
    paymentId: null,
    durationMinutes: null,
    fromClosedShift: false,
    refund: 0,
    qrisToOwner: 0,
    overLimitExcess: null,
    ...e,
  });

  const butir = (
    e: Pick<
      ExceptionAttention,
      "kind" | "count" | "total" | "from" | "to" | "latestAt"
    > &
      Partial<ExceptionAttention>,
  ): ExceptionAttention => ({
    shortage: 0,
    kasirId: null,
    kasirName: null,
    longestMinutes: null,
    ...e,
  });

  const items = (s: MockState, kind: ExceptionKind, now = NOW) =>
    exceptionAttention(s, now).filter((a) => a.kind === kind);
  const kinds = (s: MockState, now = NOW) =>
    exceptionAttention(s, now).map((a) =>
      a.kasirName === null ? a.kind : `${a.kind}:${a.kasirName}`,
    );

  test("(Review Focus 3) tepi ambang lewat state: selisih −4.999 bukan / −5.000 butir; kas keluar 50.000 bukan / 50.001 butir; Σ shift 150.000 bukan / 150.001 butir; shift tepat 12 jam bukan / 12 jam 1 menit butir", () => {
    const s = clean();
    closed(s, "Rina", { difference: -4_999 });
    expect(exceptionAttention(s, NOW)).toEqual([]);
    const diff = closed(s, "Rina", { difference: -5_000 });
    expect(cashierExceptions(s, "selisih_kas", NOW).map((e) => e.id)).toEqual([
      diff.shiftId,
    ]);

    const sh = closed(s, "Budi");
    expense(s, sh.shiftId, NOW - 7 * HOUR, 50_000);
    expect(items(s, "kas_keluar")).toEqual([]);
    const big = expense(s, sh.shiftId, NOW - 6 * HOUR, 50_001);
    expense(s, sh.shiftId, NOW - 5 * HOUR, 49_999);
    // Σ shift tepat 150.000: hanya kejadian satuan 50.001.
    expect(cashierExceptions(s, "kas_keluar", NOW).map((e) => e.id)).toEqual([
      big.id,
    ]);
    const last = expense(s, sh.shiftId, NOW - 4 * HOUR, 1);
    expect(cashierExceptions(s, "kas_keluar", NOW)).toMatchObject([
      { id: `kas_keluar_shift-${sh.shiftId}`, at: last.at, amount: 150_001 },
      { id: big.id, amount: 50_001 },
    ]);

    const openedAt = NOW - 30 * HOUR;
    closed(s, "Rina", { openedAt, closedAt: openedAt + 12 * HOUR });
    expect(items(s, "shift_lama")).toEqual([]);
    const long = closed(s, "Budi", {
      openedAt,
      closedAt: openedAt + 12 * HOUR + MIN,
    });
    expect(cashierExceptions(s, "shift_lama", NOW)).toMatchObject([
      { id: long.shiftId, at: openedAt + 12 * HOUR, durationMinutes: 721 },
    ]);
  });

  test("(berubah karena keputusan S6) selisih_kas: −12.000 kemarin & +6.000 hari ini → satu butir count 2, total −6.000, shortage −12.000; besok tetap ada sampai ditinjau", () => {
    const s = clean();
    const old = closed(s, "Rina", {
      openedAt: NOW - DAY_MS - 6 * HOUR,
      closedAt: NOW - DAY_MS,
      difference: -12_000,
    });
    const today = closed(s, "Budi", { difference: 6_000 });
    expect(cashierExceptions(s, "selisih_kas", NOW)).toEqual([
      event({
        id: today.shiftId,
        kind: "selisih_kas",
        at: NOW - HOUR,
        kasirId: today.kasirId,
        kasirName: "Budi",
        amount: 6_000,
        shiftId: today.shiftId,
      }),
      event({
        id: old.shiftId,
        kind: "selisih_kas",
        at: NOW - DAY_MS,
        kasirId: old.kasirId,
        kasirName: "Rina",
        amount: -12_000,
        shiftId: old.shiftId,
      }),
    ]);
    const item = butir({
      kind: "selisih_kas",
      count: 2,
      total: -6_000,
      shortage: -12_000,
      from: "2026-11-04",
      to: "2026-11-05",
      latestAt: NOW - HOUR,
    });
    expect(exceptionAttention(s, NOW)).toEqual([item]);
    expect(exceptionAttention(s, NOW + DAY_MS)).toEqual([item]);
  });

  test("(K18) selisih_kecil per kasir: Rina & Budi 6 × −4.000 dalam 7 hari → dua butir urut nama; shift 8 hari lalu & selisih lebih tidak ikut; tinjau Rina hanya menghapus butir Rina; jendela 7 hari bergeser → butir hilang sendiri", () => {
    const s = clean();
    const rina = kasir(s, "Rina");
    const budi = kasir(s, "Budi");
    for (let i = 0; i < 6; i++) {
      closed(s, "Rina", {
        closedAt: NOW - i * DAY_MS - HOUR,
        difference: -4_000,
      });
      closed(s, "Budi", {
        closedAt: NOW - i * DAY_MS - 2 * HOUR,
        difference: -4_000,
      });
    }
    const old = closed(s, "Rina", {
      openedAt: NOW - 8 * DAY_MS - 8 * HOUR,
      closedAt: NOW - 8 * DAY_MS,
      difference: -4_000,
    });
    closed(s, "Rina", { closedAt: NOW - 3 * HOUR, difference: 3_000 });

    const events = cashierExceptions(s, "selisih_kecil", NOW);
    expect(events).toHaveLength(12);
    expect(events.map((e) => e.id)).not.toContain(old.shiftId);
    expect(events[0]).toEqual(
      event({
        id: s.closedShifts[0]?.shiftId ?? "",
        kind: "selisih_kecil",
        at: NOW - HOUR,
        kasirId: rina.id,
        kasirName: "Rina",
        amount: -4_000,
        shiftId: s.closedShifts[0]?.shiftId ?? "",
      }),
    );
    const budiItem = butir({
      kind: "selisih_kecil",
      count: 6,
      total: -24_000,
      shortage: -24_000,
      from: "2026-10-31",
      to: "2026-11-05",
      latestAt: NOW - 2 * HOUR,
      kasirId: budi.id,
      kasirName: "Budi",
    });
    expect(exceptionAttention(s, NOW)).toEqual([
      budiItem,
      butir({
        kind: "selisih_kecil",
        count: 6,
        total: -24_000,
        shortage: -24_000,
        from: "2026-10-31",
        to: "2026-11-05",
        latestAt: NOW - HOUR,
        kasirId: rina.id,
        kasirName: "Rina",
      }),
    ]);

    expect(() =>
      reviewExceptions(s, "selisih_kecil", NOW - HOUR, NOW),
    ).toThrow();
    reviewExceptions(s, "selisih_kecil", NOW - HOUR, NOW, rina.id);
    expect(s.smallShortageReviews).toEqual({ [rina.id]: NOW - HOUR });
    expect(s.exceptionReviews.selisih_kecil).toBeNull();
    expect(exceptionAttention(s, NOW)).toEqual([budiItem]);

    // Dua hari kemudian shift Budi tertua keluar jendela: Σ 20.000 tepat → bukan butir.
    expect(items(s, "selisih_kecil", NOW + 2 * DAY_MS)).toEqual([]);
  });

  test("(K18) selisih_kecil: Rina ganti nama → tetap satu butir (dikelompokkan kasirId, nama sekarang); Budi Σ tepat 20.000 → tidak ada", () => {
    const s = clean();
    const rina = kasir(s, "Rina");
    const shifts = [0, 1, 2, 3, 4, 5].map((i) =>
      closed(s, "Rina", {
        closedAt: NOW - (5 - i) * DAY_MS - HOUR,
        difference: -4_000,
      }),
    );
    // Ganti nama setelah 3 shift: salinan nama shift sesudahnya memakai nama baru (K12).
    rina.name = "Rina Wati";
    for (const c of shifts.slice(3)) c.kasirName = "Rina Wati";
    for (let i = 0; i < 5; i++) {
      closed(s, "Budi", {
        closedAt: NOW - i * DAY_MS - 2 * HOUR,
        difference: -4_000,
      });
    }
    expect(new Set(s.closedShifts.map((c) => c.kasirName))).toEqual(
      new Set(["Rina", "Rina Wati", "Budi"]),
    );
    expect(items(s, "selisih_kecil")).toEqual([
      butir({
        kind: "selisih_kecil",
        count: 6,
        total: -24_000,
        shortage: -24_000,
        from: "2026-10-31",
        to: "2026-11-05",
        latestAt: NOW - HOUR,
        kasirId: rina.id,
        kasirName: "Rina Wati",
      }),
    ]);
  });

  test("(K4, K22) kas_keluar: 60.000 + shift Σ 160.000 yang memuatnya → count 2, total 160.000 (unik); shift 4 × 40.000 → satu kejadian per shift di kas keluar ke-4", () => {
    const s = clean();
    const rina = kasir(s, "Rina");
    const budi = kasir(s, "Budi");
    const a = closed(s, "Rina");
    const e60 = expense(s, a.shiftId, NOW - 7 * HOUR, 60_000, {
      reason: "Beli gas elpiji",
    });
    expense(s, a.shiftId, NOW - 6 * HOUR, 50_000);
    const third = expense(s, a.shiftId, NOW - 5 * HOUR, 50_000);
    expect(cashierExceptions(s, "kas_keluar", NOW)).toEqual([
      event({
        id: `kas_keluar_shift-${a.shiftId}`,
        kind: "kas_keluar",
        at: third.at,
        kasirId: rina.id,
        kasirName: "Rina",
        amount: 160_000,
        shiftId: a.shiftId,
      }),
      event({
        id: e60.id,
        kind: "kas_keluar",
        at: e60.at,
        kasirId: rina.id,
        kasirName: "Rina",
        amount: 60_000,
        reason: "Beli gas elpiji",
        shiftId: a.shiftId,
      }),
    ]);
    expect(items(s, "kas_keluar")).toEqual([
      butir({
        kind: "kas_keluar",
        count: 2,
        total: 160_000,
        from: "2026-11-05",
        to: "2026-11-05",
        latestAt: third.at,
      }),
    ]);

    const b = closed(s, "Budi", {
      openedAt: NOW - 30 * HOUR,
      closedAt: NOW - 22 * HOUR,
    });
    const four = [0, 1, 2, 3].map((i) =>
      expense(s, b.shiftId, NOW - (29 - i) * HOUR, 40_000, {
        createdById: budi.id,
        createdByName: "Budi",
      }),
    );
    expect(
      cashierExceptions(s, "kas_keluar", NOW).filter(
        (e) => e.shiftId === b.shiftId,
      ),
    ).toEqual([
      event({
        id: `kas_keluar_shift-${b.shiftId}`,
        kind: "kas_keluar",
        at: four[3]?.at ?? 0,
        kasirId: budi.id,
        kasirName: "Budi",
        amount: 160_000,
        shiftId: b.shiftId,
      }),
    ]);
    expect(items(s, "kas_keluar")).toEqual([
      butir({
        kind: "kas_keluar",
        count: 3,
        total: 320_000,
        from: "2026-11-04",
        to: "2026-11-05",
        latestAt: third.at,
      }),
    ]);
  });

  test("(S10) batal_kas_keluar: batal oleh kasir → kejadian (nominal, alasan batal, pembatal); batal oleh pemilik bukan kejadian; kas keluar yang dibatalkan tidak membuat kas_keluar dan tidak ikut Σ shift", () => {
    const s = clean();
    const budi = kasir(s, "Budi");
    const sh = open(s, "Rina", { openedAt: NOW - 3 * HOUR });
    const x = expense(s, sh.id, NOW - 2 * HOUR, 60_000, {
      cancelledAt: NOW - HOUR,
      cancelledById: budi.id,
      cancelledByName: "Budi",
      cancelledChannel: "kasir",
      cancelReason: "Salah catat nominal",
    });
    expense(s, sh.id, NOW - 2 * HOUR + MIN, 50_000);
    expense(s, sh.id, NOW - 2 * HOUR + 2 * MIN, 50_000);
    const c = closed(s, "Budi", {
      openedAt: NOW - 30 * HOUR,
      closedAt: NOW - 22 * HOUR,
    });
    expense(s, c.shiftId, NOW - 25 * HOUR, 70_000, {
      cancelledAt: NOW - 2 * HOUR,
      cancelledById: "u-pemilik",
      cancelledByName: "Pak Ahmad",
      cancelledChannel: "pemilik",
      cancelReason: "Dobel catat",
    });
    expect(cashierExceptions(s, "batal_kas_keluar", NOW)).toEqual([
      event({
        id: x.id,
        kind: "batal_kas_keluar",
        at: NOW - HOUR,
        kasirId: budi.id,
        kasirName: "Budi",
        amount: 60_000,
        reason: "Salah catat nominal",
        shiftId: sh.id,
      }),
    ]);
    expect(cashierExceptions(s, "kas_keluar", NOW)).toEqual([]);
    expect(kinds(s)).toEqual(["batal_kas_keluar"]);
  });

  test("(S4, K22) serah_terima: modal beda dari saran → kejadian amount = openingCash − suggestedOpening, reason = catatan (shift tutup & buka); catatan dengan modal sama atau tanpa saran → bukan kejadian", () => {
    const s = clean();
    const c = closed(s, "Rina", {
      openedAt: NOW - 30 * HOUR,
      closedAt: NOW - 22 * HOUR,
      openingCash: 190_000,
      suggestedOpening: 200_000,
      openingNote: "Salah hitung kemarin",
    });
    closed(s, "Budi", {
      openingCash: 200_000,
      suggestedOpening: 200_000,
      openingNote: "Catatan tanpa beda",
    });
    closed(s, "Budi", { openingCash: 150_000, suggestedOpening: null });
    const sh = open(s, "Budi", {
      openingCash: 205_000,
      suggestedOpening: 200_000,
      openingNote: "Tambah uang receh",
    });
    expect(cashierExceptions(s, "serah_terima", NOW)).toEqual([
      event({
        id: sh.id,
        kind: "serah_terima",
        at: sh.openedAt,
        kasirId: sh.kasirId,
        kasirName: "Budi",
        amount: 5_000,
        reason: "Tambah uang receh",
        shiftId: sh.id,
      }),
      event({
        id: c.shiftId,
        kind: "serah_terima",
        at: c.openedAt,
        kasirId: c.kasirId,
        kasirName: "Rina",
        amount: -10_000,
        reason: "Salah hitung kemarin",
        shiftId: c.shiftId,
      }),
    ]);
    expect(items(s, "serah_terima")).toEqual([
      butir({
        kind: "serah_terima",
        count: 2,
        total: -5_000,
        shortage: -10_000,
        from: "2026-11-04",
        to: "2026-11-05",
        latestAt: sh.openedAt,
      }),
    ]);
  });

  test("(S3, K5) shift_lama: shift buka 13 jam → durationMinutes 780; longestMinutes = terlama di butir (870); tinjau dengan upTo = latestAt lalu shift tetap buka → tidak muncul lagi", () => {
    const s = clean();
    closed(s, "Rina", {
      openedAt: NOW - 30 * HOUR,
      closedAt: NOW - 18 * HOUR,
    });
    const long = closed(s, "Budi", {
      openedAt: NOW - 40 * HOUR,
      closedAt: NOW - 40 * HOUR + 14.5 * HOUR,
    });
    const sh = open(s, "Rina", { openedAt: NOW - 13 * HOUR });
    expect(cashierExceptions(s, "shift_lama", NOW)).toEqual([
      event({
        id: sh.id,
        kind: "shift_lama",
        at: sh.openedAt + 12 * HOUR,
        kasirId: sh.kasirId,
        kasirName: "Rina",
        amount: 0,
        shiftId: sh.id,
        durationMinutes: 780,
      }),
      event({
        id: long.shiftId,
        kind: "shift_lama",
        at: long.openedAt + 12 * HOUR,
        kasirId: long.kasirId,
        kasirName: "Budi",
        amount: 0,
        shiftId: long.shiftId,
        durationMinutes: 870,
      }),
    ]);
    const item = butir({
      kind: "shift_lama",
      count: 2,
      total: 0,
      from: "2026-11-04",
      to: "2026-11-05",
      latestAt: sh.openedAt + 12 * HOUR,
      longestMinutes: 870,
    });
    expect(items(s, "shift_lama")).toEqual([item]);
    // Shift buka terus bertambah lama: 16 jam > 14,5 jam.
    expect(items(s, "shift_lama", NOW + 3 * HOUR)).toEqual([
      { ...item, longestMinutes: 960 },
    ]);
    reviewExceptions(s, "shift_lama", item.latestAt, NOW);
    expect(items(s, "shift_lama", NOW + 5 * HOUR)).toEqual([]);
  });

  test("(K7) mengubah attentionRules mengubah butir tanpa data baru", () => {
    const s = clean();
    const c = closed(s, "Rina", {
      openedAt: NOW - 9 * HOUR,
      difference: -5_000,
    });
    expense(s, c.shiftId, NOW - 2 * HOUR, 60_000);
    expect(kinds(s)).toEqual(["selisih_kas", "kas_keluar"]);
    s.attentionRules = {
      ...s.attentionRules,
      cashDiffMin: 6_000,
      smallShortageWeekMax: 4_000,
      expenseSingleMax: 60_000,
      shiftMaxHours: 7,
    };
    expect(kinds(s)).toEqual(["shift_lama", "selisih_kecil:Rina"]);
  });

  test("(S8) latestAt = at kejadian terbaru; tinjau dengan upTo = latestAt menghapus butir; kejadian sesudahnya membuatnya muncul lagi", () => {
    const s = clean();
    const rina = kasir(s, "Rina");
    const sh = open(s, "Rina", { openedAt: NOW - 3 * HOUR });
    const cancelAt = (at: number) =>
      expense(s, sh.id, NOW - 3 * HOUR + MIN, 10_000, {
        cancelledAt: at,
        cancelledById: rina.id,
        cancelledByName: "Rina",
        cancelledChannel: "kasir",
        cancelReason: "Salah catat",
      });
    cancelAt(NOW - HOUR);
    cancelAt(NOW - 2 * HOUR);
    const [item] = items(s, "batal_kas_keluar");
    expect(item).toMatchObject({
      count: 2,
      total: 20_000,
      latestAt: NOW - HOUR,
    });
    reviewExceptions(s, "batal_kas_keluar", item?.latestAt ?? 0, NOW);
    expect(items(s, "batal_kas_keluar")).toEqual([]);
    cancelAt(NOW - MIN);
    expect(items(s, "batal_kas_keluar")).toMatchObject([
      { count: 1, total: 10_000, latestAt: NOW - MIN },
    ]);
  });

  test("(K2) urutan butir persis: tiga jenis F3c-1, batal_kas_keluar, selisih_kas, kas_keluar, serah_terima, shift_lama, selisih_kecil per kasir urut nama", () => {
    const s = clean();
    const rina = kasir(s, "Rina");
    s.sales.push(
      voided(NOW - HOUR, "kasir"),
      sale({ creditOverLimit: { excess: 5_000, reason: "hajatan" } }),
    );
    s.creditPayments.push(payment());
    for (let i = 0; i < 6; i++) {
      closed(s, "Rina", {
        closedAt: NOW - i * DAY_MS - HOUR,
        difference: -4_000,
      });
      closed(s, "Budi", {
        closedAt: NOW - i * DAY_MS - 2 * HOUR,
        difference: -4_000,
      });
    }
    const c = closed(s, "Budi", {
      openedAt: NOW - 30 * HOUR,
      closedAt: NOW - 17 * HOUR,
      difference: -10_000,
      openingCash: 190_000,
      suggestedOpening: 200_000,
      openingNote: "Kurang receh",
    });
    expense(s, c.shiftId, NOW - 29 * HOUR, 60_000);
    const sh = open(s, "Rina");
    expense(s, sh.id, NOW - 30 * MIN, 5_000, {
      cancelledAt: NOW - 10 * MIN,
      cancelledById: rina.id,
      cancelledByName: "Rina",
      cancelledChannel: "kasir",
      cancelReason: "Salah catat",
    });
    expect(kinds(s)).toEqual([
      "batal_transaksi",
      "batal_pelunasan",
      "kasbon_lewat_limit",
      "batal_kas_keluar",
      "selisih_kas",
      "kas_keluar",
      "serah_terima",
      "shift_lama",
      "selisih_kecil:Budi",
      "selisih_kecil:Rina",
    ]);
  });
});
