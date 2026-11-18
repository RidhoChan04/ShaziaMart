import type {
  CategorySales,
  KasirSales,
  ProductSales,
  ProductSalesSort,
  ReportBucket,
  ReportPeriod,
  ReportSeries,
  SaleItem,
  SalesReport,
  SalesTotals,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  addIsoDays,
  DAY_MS,
  HOUR_MS,
  isoDaysBetween,
  jakartaIsoDate,
} from "@/shared/lib/business-day";
import { roundHalfUp } from "@/shared/lib/quantity";
import {
  clampToToday,
  type IsoRange,
  previousCutAtNow,
  previousRange,
} from "@/shared/lib/report-period";
import type { MockProduct, MockSale, MockState } from "../db";
import { eceranOf } from "../products/views";
import {
  byName,
  dayStart,
  marginPermille,
  nullsLast,
  type Window,
  windowOf,
} from "./report-utils";

export type SalesQuery = { period: ReportPeriod; from: string; to: string };

const MINUTE_MS = 60_000;
const TOP_PRODUCTS = 3;

const inWindow =
  (w: Window) =>
  (s: MockSale): boolean =>
    s.createdAt >= w.start && s.createdAt < w.end;

const sum = (xs: readonly number[]): number => xs.reduce((a, b) => a + b, 0);

/** Total penjualan selesai; aturan sama dengan `ownerTodaySummary` (HPP = `costTotal`). */
function totalsOf(done: readonly MockSale[]): SalesTotals {
  const revenue = sum(done.map((s) => s.total));
  const grossProfit = revenue - sum(done.map((s) => s.costTotal));
  return {
    revenue,
    grossProfit,
    salesCount: done.length,
    avgTicket: done.length === 0 ? 0 : roundHalfUp(revenue, done.length),
    newCredit: sum(
      done.flatMap((s) =>
        s.payments.filter((p) => p.method === "credit").map((p) => p.amount),
      ),
    ),
    marginPermille: marginPermille(revenue, grossProfit),
  };
}

/**
 * Jendela pembanding (K12, jawaban pemilik Q7): bila hari terakhir pembanding sejajar dengan hari
 * ini (`previousCutAtNow`), berhenti di akhir menit sekarang pada hari itu; selain itu (periode
 * lewat, atau tanggal sejajar dijepit ke bulan yang lebih pendek) dihitung penuh.
 */
function previousWindow(previous: IsoRange, cut: boolean, now: number): Window {
  const full = windowOf(previous);
  if (!cut) return full;
  const minuteOfDay = Math.floor(
    (now - dayStart(jakartaIsoDate(now))) / MINUTE_MS,
  );
  return {
    start: full.start,
    end: dayStart(previous.to) + (minuteOfDay + 1) * MINUTE_MS,
  };
}

/** Bucket jam (period hari) atau tanggal (period lain, rentang permintaan); belum terjadi → null. */
function seriesOf(
  period: ReportPeriod,
  requested: IsoRange,
  done: readonly MockSale[],
  now: number,
): ReportSeries {
  const start = dayStart(requested.from);
  const hourly = period === "hari";
  const size = hourly ? HOUR_MS : DAY_MS;
  const count = hourly ? 24 : isoDaysBetween(requested.from, requested.to) + 1;
  const revenue = new Array<number>(count).fill(0);
  const cost = new Array<number>(count).fill(0);
  for (const s of done) {
    const i = Math.floor((s.createdAt - start) / size);
    if (i < 0 || i >= count) continue;
    revenue[i] = (revenue[i] ?? 0) + s.total;
    cost[i] = (cost[i] ?? 0) + s.costTotal;
  }
  const buckets = Array.from({ length: count }, (_, i): ReportBucket => {
    const key = hourly ? String(i) : addIsoDays(requested.from, i);
    if (start + i * size > now)
      return { key, revenue: null, grossProfit: null };
    const r = revenue[i] ?? 0;
    return { key, revenue: r, grossProfit: r - (cost[i] ?? 0) };
  });
  return { kind: hourly ? "jam" : "hari", buckets };
}

type ProductAcc = Omit<ProductSales, "grossProfit"> & {
  key: string;
  category: string | null;
  cost: number;
  costKnown: boolean;
};

/** Penjualan per barang (semua satuan dalam satuan dasar); HPP dari `lineCosts` saat jual. */
function productAccs(
  state: Readonly<MockState>,
  done: readonly MockSale[],
): ProductAcc[] {
  const byUnit = new Map<string, MockProduct>();
  for (const p of state.products) for (const u of p.units) byUnit.set(u.id, p);
  const accs = new Map<string, ProductAcc>();
  for (const sale of done) {
    sale.items.forEach((item, i) => {
      const p = byUnit.get(item.unitId);
      // Barang yang sudah tidak ada dikelompokkan menurut nama di struk.
      const key = p ? p.id : `?${item.productName}`;
      const acc = accs.get(key) ?? newAcc(key, p, item);
      accs.set(key, acc);
      addLine(acc, item, sale.lineCosts[i] ?? null, p === undefined);
    });
  }
  return [...accs.values()];
}

/** Wadah baru: satuan eceran barang sekarang, atau satuan baris bila barang sudah tidak ada. */
function newAcc(
  key: string,
  p: MockProduct | undefined,
  item: SaleItem,
): ProductAcc {
  const base = { key, qtyBase: 0, revenue: 0, cost: 0, costKnown: true };
  if (p === undefined) {
    return {
      ...base,
      productId: null,
      productName: item.productName,
      unitName: item.unitName,
      unitSize: item.unitSize,
      isCurah: item.isCurah,
      category: null,
    };
  }
  const eceran = eceranOf(p);
  return {
    ...base,
    productId: p.id,
    productName: p.name,
    unitName: eceran.name,
    unitSize: eceran.unitSize,
    isCurah: p.isCurah,
    category: p.category,
  };
}

function addLine(
  acc: ProductAcc,
  item: SaleItem,
  lineCost: number | null,
  orphan: boolean,
): void {
  // Barang yang sudah tidak ada memakai satuan terkecil di struk.
  if (orphan && item.unitSize < acc.unitSize) {
    acc.unitName = item.unitName;
    acc.unitSize = item.unitSize;
  }
  acc.qtyBase += item.qtyBase;
  acc.revenue += item.subtotal;
  if (lineCost === null) acc.costKnown = false;
  else acc.cost += lineCost;
}

const toProductSales = (a: ProductAcc): ProductSales => ({
  productId: a.productId,
  productName: a.productName,
  unitName: a.unitName,
  unitSize: a.unitSize,
  isCurah: a.isCurah,
  qtyBase: a.qtyBase,
  revenue: a.revenue,
  grossProfit: a.costKnown ? a.revenue - a.cost : null,
});

/** Urutan server (K15); seri terakhir → nama barang. */
const PRODUCT_ORDER: Record<
  ProductSalesSort,
  (a: ProductSales, b: ProductSales) => number
> = {
  omzet: (a, b) => b.revenue - a.revenue,
  // qtyBase ÷ unitSize dibandingkan silang agar tetap bilangan bulat.
  jumlah: (a, b) =>
    b.qtyBase * a.unitSize - a.qtyBase * b.unitSize || b.revenue - a.revenue,
  laba: (a, b) =>
    nullsLast(a.grossProfit, b.grossProfit) ||
    (b.grossProfit ?? 0) - (a.grossProfit ?? 0) ||
    b.revenue - a.revenue,
};

const sortProducts = (
  rows: ProductSales[],
  sort: ProductSalesSort,
): ProductSales[] =>
  rows.sort(
    (a, b) => PRODUCT_ORDER[sort](a, b) || byName(a.productName, b.productName),
  );

/** Omzet per kategori (HPP kosong = 0), urut omzet terbesar; tanpa kategori terakhir. */
function categoriesOf(accs: readonly ProductAcc[]): CategorySales[] {
  const groups = new Map<string | null, CategorySales>();
  for (const a of accs) {
    const g = groups.get(a.category) ?? {
      category: a.category,
      revenue: 0,
      grossProfit: 0,
      productCount: 0,
    };
    g.revenue += a.revenue;
    g.grossProfit += a.revenue - a.cost;
    g.productCount += 1;
    groups.set(a.category, g);
  }
  return [...groups.values()].sort((a, b) => {
    return (
      nullsLast(a.category, b.category) ||
      b.revenue - a.revenue ||
      byName(a.category ?? "", b.category ?? "")
    );
  });
}

/** Per kasir (K14): semua penjualan yang dibuat di rentang, menurut status sekarang. */
function kasirOf(created: readonly MockSale[]): KasirSales[] {
  const groups = new Map<string, KasirSales>();
  for (const s of created) {
    const g = groups.get(s.kasirName) ?? {
      kasirName: s.kasirName,
      revenue: 0,
      salesCount: 0,
      voidedCount: 0,
    };
    if (s.status === "selesai") {
      g.revenue += s.total;
      g.salesCount += 1;
    } else {
      g.voidedCount += 1;
    }
    groups.set(s.kasirName, g);
  }
  return [...groups.values()].sort(
    (a, b) => b.revenue - a.revenue || byName(a.kasirName, b.kasirName),
  );
}

const doneIn = (state: Readonly<MockState>, w: Window): MockSale[] =>
  state.sales.filter((s) => s.status === "selesai" && inWindow(w)(s));

function rangeOf(q: SalesQuery, now: number) {
  return clampToToday({ from: q.from, to: q.to }, jakartaIsoDate(now));
}

/**
 * Laporan penjualan satu periode (K12–K16, jawaban pemilik Q5/Q7). `q` sudah lolos `checkRange`.
 * Status penjualan dibaca sekarang; HPP dari salinan saat jual.
 */
export function salesReport(
  state: Readonly<MockState>,
  q: SalesQuery,
  now: number,
): SalesReport {
  const { running, ...range } = rangeOf(q, now);
  const previous = previousRange(q.period, range, running);
  const cut = previousCutAtNow(q.period, range, running);
  const current = windowOf(range);
  const done = doneIn(state, current);
  const accs = productAccs(state, done);
  return {
    period: q.period,
    range,
    previous,
    running,
    current: totalsOf(done),
    previousTotals: totalsOf(doneIn(state, previousWindow(previous, cut, now))),
    series: seriesOf(q.period, { from: q.from, to: q.to }, done, now),
    topProducts: sortProducts(accs.map(toProductSales), "omzet").slice(
      0,
      TOP_PRODUCTS,
    ),
    categories: categoriesOf(accs),
    kasir: kasirOf(state.sales.filter(inWindow(current))),
  };
}

/** Semua barang terjual di periode, urut server (`Lihat semua`, K15). */
export function productSales(
  state: Readonly<MockState>,
  q: SalesQuery & { sort: ProductSalesSort },
  now: number,
): ProductSales[] {
  const { running: _, ...range } = rangeOf(q, now);
  const done = doneIn(state, windowOf(range));
  return sortProducts(productAccs(state, done).map(toProductSales), q.sort);
}
