import type {
  Attention,
  CashDifference,
  CostChangeItem,
  HourBucket,
  OwnerTodaySummary,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  businessDay,
  DAY_MS,
  daysBefore,
  HOUR_MS,
} from "@/shared/lib/business-day";
import { unitCost } from "@/shared/lib/product-rules";
import { roundHalfUp } from "@/shared/lib/quantity";
import type { MockState } from "./db";
import { oldestUnpaidAt } from "./ledger";
import { meaningfulCostAlert } from "./products/cost-alert";
import { eceranOf, stockAlertOf } from "./products/views";
import { debtAttention } from "./receipts/debts";

const WEEKDAYS = [
  "Minggu",
  "Senin",
  "Selasa",
  "Rabu",
  "Kamis",
  "Jumat",
  "Sabtu",
];
const OVERDUE_MS = 30 * DAY_MS;
const MINUTE_MS = 60_000;

const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);

function attention(state: Readonly<MockState>, now: number): Attention {
  const today = businessDay(now);
  const alerts = state.products.map((p) => stockAlertOf(state, p));
  const cashDifferences: CashDifference[] = state.closedShifts
    .filter(
      (c) => c.difference !== 0 && businessDay(c.closedAt).key === today.key,
    )
    .sort((a, b) => b.closedAt - a.closedAt)
    .map(({ shiftId, kasirName, closedAt, difference }) => ({
      shiftId,
      kasirName,
      closedAt,
      difference,
    }));
  const overdue = state.customers.filter((c) => {
    const oldest = oldestUnpaidAt(state, c.id);
    return c.balance > 0 && oldest !== null && now - oldest > OVERDUE_MS;
  });
  return {
    lowStockCount: alerts.filter((a) => a === "menipis").length,
    negativeStockCount: alerts.filter((a) => a === "minus").length,
    cashDifferences,
    overdueCredit: {
      count: overdue.length,
      total: sum(overdue.map((c) => c.balance)),
    },
    costChanges: costChanges(state),
    stockOuts: state.products
      .filter(
        (p) =>
          p.status === "tidak_diambil" &&
          p.stockCounted &&
          (state.stock[p.id] ?? 0) <= 0,
      )
      .map((p) => ({ productId: p.id, productName: p.name }))
      .sort((a, b) => a.productName.localeCompare(b.productName, "id")),
    supplierDebts: debtAttention(state, now),
    awaitingPriceCount: state.products.filter(
      (p) => p.status === "menunggu_harga",
    ).length,
    // Sementara nol: server kedaluwarsa & opname belum ada.
    expiry: { expiredCount: 0, soonCount: 0, soonDays: 30 },
    opnameHeldCount: 0,
    opnameFlags: [],
  };
}

/** Butir modal berubah (C12, sama dengan detail): modal eceran saat butir dibuat → sekarang. */
function costChanges(state: Readonly<MockState>): CostChangeItem[] {
  return state.products
    .flatMap((p): CostChangeItem[] => {
      const alert = meaningfulCostAlert(state, p);
      if (alert === null) return [];
      const eceran = eceranOf(p);
      const oldCost = unitCost(alert.fromCost, eceran.unitSize);
      const newCost = unitCost(p.cost, eceran.unitSize);
      if (oldCost === null || newCost === null) return [];
      return [
        {
          productId: p.id,
          productName: p.name,
          unitName: eceran.name,
          oldCost,
          newCost,
          price: eceran.price,
          changedAt: alert.changedAt,
          source: alert.source,
        },
      ];
    })
    .sort((a, b) => b.changedAt - a.changedAt);
}

/**
 * Ringkasan beranda pemilik (murni). Hanya penjualan selesai; pembanding minggu lalu
 * dipotong di jam:menit yang sama (sampai akhir menit itu), sedangkan bucket per jam
 * memuat jam penuh. HPP dari `costTotal` yang disalin saat penjualan.
 */
export function ownerTodaySummary(
  state: Readonly<MockState>,
  now: number,
): OwnerTodaySummary {
  const today = businessDay(now);
  const lastWeek = daysBefore(today, 7);
  const done = state.sales.filter((s) => s.status === "selesai");
  const mine = done.filter(
    (s) => s.createdAt - today.start >= 0 && s.createdAt - today.start < DAY_MS,
  );
  const theirs = done.filter(
    (s) =>
      s.createdAt - lastWeek.start >= 0 &&
      s.createdAt - lastWeek.start < DAY_MS,
  );

  const minuteOfDay = Math.floor((now - today.start) / MINUTE_MS);
  const cutoff = lastWeek.start + (minuteOfDay + 1) * MINUTE_MS;
  const hourly: HourBucket[] = Array.from({ length: 24 }, (_, hour) => {
    const inHour = (start: number) => (s: { createdAt: number }) =>
      Math.floor((s.createdAt - start) / HOUR_MS) === hour;
    return {
      hour,
      revenue: sum(mine.filter(inHour(today.start)).map((s) => s.total)),
      lastWeekRevenue: sum(
        theirs.filter(inHour(lastWeek.start)).map((s) => s.total),
      ),
    };
  });

  const revenue = sum(mine.map((s) => s.total));
  return {
    date: today.date,
    weekdayLastWeek: WEEKDAYS[lastWeek.weekday] ?? "",
    revenue,
    grossProfit: revenue - sum(mine.map((s) => s.costTotal)),
    salesCount: mine.length,
    newCredit: sum(
      mine.flatMap((s) =>
        s.payments.filter((p) => p.method === "credit").map((p) => p.amount),
      ),
    ),
    avgTicket: mine.length === 0 ? 0 : roundHalfUp(revenue, mine.length),
    lastWeekRevenue: sum(
      theirs.filter((s) => s.createdAt < cutoff).map((s) => s.total),
    ),
    hourly,
    attention: attention(state, now),
  };
}
