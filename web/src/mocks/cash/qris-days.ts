import type {
  QrisDay,
  QrisTransaction,
  QrisUnreconciled,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { jakartaIsoDate } from "@/shared/lib/business-day";
import {
  customerNameOf,
  type MockCreditPayment,
  type MockSale,
  type MockState,
} from "../db";

/**
 * (S7, K11) QRIS harian. Hari = tanggal Asia/Jakarta `createdAt` penjualan / `at` pelunasan; hanya
 * bagian QRIS penjualan dan pelunasan kasbon jalur kasir ber-metode QRIS. Yang dibatalkan tidak
 * masuk `total`, hanya `voidedCount`/`voidedTotal` (info).
 */
export type QrisDayTotals = Omit<
  QrisDay,
  "status" | "note" | "markedByName" | "markedAt"
>;

/** Bagian QRIS sebuah penjualan (0 bila tanpa QRIS). */
const qrisPart = (sale: MockSale): number =>
  sale.payments
    .filter((p) => p.method === "qris")
    .reduce((sum, p) => sum + p.amount, 0);

const isQrisRepayment = (p: MockCreditPayment): boolean =>
  p.channel === "kasir" && p.method === "qris";

/** Transaksi QRIS (bertanggal WIB) dari penjualan & pelunasan kasir, belum diurutkan. */
function qrisTransactions(
  state: Readonly<MockState>,
  keep: (date: string) => boolean,
): (QrisTransaction & { date: string })[] {
  const out: (QrisTransaction & { date: string })[] = [];
  for (const sale of state.sales) {
    const amount = qrisPart(sale);
    if (amount === 0) continue;
    const date = jakartaIsoDate(sale.createdAt);
    if (!keep(date)) continue;
    out.push({
      date,
      at: sale.createdAt,
      amount,
      kind: "penjualan",
      kasirName: sale.kasirName,
      ref: sale.number,
      status: sale.status === "dibatalkan" ? "dibatalkan" : "aktif",
    });
  }
  for (const p of state.creditPayments) {
    if (!isQrisRepayment(p)) continue;
    const date = jakartaIsoDate(p.at);
    if (!keep(date)) continue;
    out.push({
      date,
      at: p.at,
      amount: p.amount,
      kind: "pelunasan",
      kasirName: p.createdByName,
      ref: customerNameOf(state, p.customerId) ?? "—",
      status: p.cancelledAt === null ? "aktif" : "dibatalkan",
    });
  }
  return out;
}

type Sums = Pick<
  QrisDayTotals,
  "sales" | "repayments" | "voidedCount" | "voidedTotal"
>;

const emptySums = (): Sums => ({
  sales: 0,
  repayments: 0,
  voidedCount: 0,
  voidedTotal: 0,
});

/** Jumlah per tanggal untuk tanggal yang lolos `keep` (satu kali lewat semua transaksi). */
function sumsByDate(
  state: Readonly<MockState>,
  keep: (date: string) => boolean,
): Map<string, Sums> {
  const byDate = new Map<string, Sums>();
  for (const t of qrisTransactions(state, keep)) {
    const sums = byDate.get(t.date) ?? emptySums();
    if (t.status === "dibatalkan") {
      sums.voidedCount += 1;
      sums.voidedTotal += t.amount;
    } else if (t.kind === "penjualan") {
      sums.sales += t.amount;
    } else {
      sums.repayments += t.amount;
    }
    byDate.set(t.date, sums);
  }
  return byDate;
}

function totalsOf(
  state: Readonly<MockState>,
  date: string,
  sums: Sums,
  today: string,
): QrisDayTotals {
  const total = sums.sales + sums.repayments;
  const mark = state.qrisDays[date];
  return {
    date,
    ...sums,
    total,
    closed: date < today,
    changedAfterMark: mark !== undefined && mark.markedTotal !== total,
  };
}

/**
 * (K21) Status dibaca: tanda tersimpan, kecuali total sekarang ≠ total saat ditandai → `belum`
 * dengan `changedAfterMark` (penanda lama tetap ditampilkan).
 */
function withMark(state: Readonly<MockState>, totals: QrisDayTotals): QrisDay {
  const mark = state.qrisDays[totals.date];
  if (mark === undefined) {
    return {
      ...totals,
      status: "belum",
      note: null,
      markedByName: null,
      markedAt: null,
    };
  }
  return {
    ...totals,
    status: totals.changedAfterMark ? "belum" : mark.status,
    note: mark.note,
    markedByName: mark.markedByName,
    markedAt: mark.markedAt,
  };
}

/** Angka QRIS satu hari (tanpa tanda pencocokan); `now` menentukan `closed`. */
export function qrisDayTotals(
  state: Readonly<MockState>,
  date: string,
  now: number,
): QrisDayTotals {
  const sums = sumsByDate(state, (d) => d === date).get(date) ?? emptySums();
  return totalsOf(state, date, sums, jakartaIsoDate(now));
}

/** QRIS satu hari beserta status dibaca (K21). */
export const qrisDayOf = (
  state: Readonly<MockState>,
  date: string,
  now: number,
): QrisDay => withMark(state, qrisDayTotals(state, date, now));

/** (S11) Transaksi QRIS satu hari, urut jam, termasuk yang dibatalkan. */
export const qrisDayItems = (
  state: Readonly<MockState>,
  date: string,
): QrisTransaction[] =>
  qrisTransactions(state, (d) => d === date)
    .sort((a, b) => a.at - b.at)
    .map(({ date: _date, ...t }) => t);

/**
 * Hari bulan `month` (YYYY-MM) sampai hari ini yang punya QRIS (total > 0), QRIS dibatalkan, atau
 * tanda; terbaru dulu.
 */
export function qrisMonth(
  state: Readonly<MockState>,
  month: string,
  now: number,
): QrisDay[] {
  const today = jakartaIsoDate(now);
  const inMonth = (d: string) => d.startsWith(`${month}-`) && d <= today;
  const byDate = sumsByDate(state, inMonth);
  for (const date of Object.keys(state.qrisDays)) {
    if (inMonth(date) && !byDate.has(date)) byDate.set(date, emptySums());
  }
  return [...byDate]
    .sort(([a], [b]) => b.localeCompare(a))
    .map(([date, sums]) => withMark(state, totalsOf(state, date, sums, today)));
}

/**
 * (S7, K11, K21) Hari yang perlu dicocokkan: `qrisSince ≤ tanggal < hari ini`, total > 0, status
 * dibaca `belum`; terlama dulu, lintas bulan.
 */
export function unreconciledQrisDays(
  state: Readonly<MockState>,
  now: number,
): QrisDay[] {
  const today = jakartaIsoDate(now);
  const byDate = sumsByDate(state, (d) => d >= state.qrisSince && d < today);
  return [...byDate]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, sums]) => withMark(state, totalsOf(state, date, sums, today)))
    .filter((d) => d.total > 0 && d.status === "belum");
}

/** Butir `QRIS belum dicocokkan: {n} hari` (tanpa memeriksa setelan; lihat owner-summary). */
export function unreconciledQris(
  state: Readonly<MockState>,
  now: number,
): QrisUnreconciled | null {
  const days = unreconciledQrisDays(state, now);
  const first = days[0];
  const last = days[days.length - 1];
  if (first === undefined || last === undefined) return null;
  return { count: days.length, from: first.date, to: last.date };
}

/** QRIS satu shift yang tidak dibatalkan (rincian shift pemilik; tidak masuk laci). */
export function shiftQris(
  state: Readonly<MockState>,
  shiftId: string,
): { sales: number; repayments: number } {
  let sales = 0;
  for (const sale of state.sales) {
    if (sale.shiftId === shiftId && sale.status !== "dibatalkan") {
      sales += qrisPart(sale);
    }
  }
  let repayments = 0;
  for (const p of state.creditPayments) {
    if (p.shiftId === shiftId && isQrisRepayment(p) && p.cancelledAt === null) {
      repayments += p.amount;
    }
  }
  return { sales, repayments };
}
