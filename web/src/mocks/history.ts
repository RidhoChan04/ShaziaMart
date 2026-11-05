import type { Product, SaleItem } from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  type BusinessDay,
  businessDay,
  DAY_MS,
  daysBefore,
  HOUR_MS,
} from "@/shared/lib/business-day";
import { priceLine } from "@/shared/lib/pricing";
import type { CreditEntry, MockSale, MockState } from "./db";
import { appendCredit } from "./ledger";
import { formatSaleNumber } from "./sale-number";
import { saleLineCosts, sumLineCosts } from "./sale-rules";
import { KIND, makeId, rng } from "./seed";
import { appendSeedRepayment } from "./seed-customers";

/** (K11) Panjang riwayat contoh; dijaga agar state tersimpan jauh di bawah kuota localStorage. */
export const HISTORY_DAYS = 63;
const HISTORY_SEED = 0x5eed1d;
/**
 * (K11) Barang buatan "lambat" untuk laporan Tidak terjual: 3 pertama tidak pernah terjual, 3
 * sisanya hanya terjual pada hari-ke-belakang di `SLOW_SOLD_BACK` (terakhir 45–57 hari lalu).
 * Dipilih dengan pengacak tetap, jadi sama untuk setiap tanggal bisnis.
 */
export const SLOW_PRODUCTS = 6;
const SLOW_SEED = 0x510e;
const SLOW_SOLD_BACK: readonly (readonly number[])[] = [
  [63, 45],
  [62, 51],
  [61, 57],
];
const OPENING_CASH = 200_000;
const SHIFT_DIFFS = [0, 0, 0, -5000, 2000];
/** Kasbon riwayat hanya Mbak Dewi; saldonya dijaga jauh di bawah limit Rp500.000. */
const CREDIT_CUSTOMER = "Mbak Dewi";
const CREDIT_MAX_SALE = 60_000;
const CREDIT_MAX_OUTSTANDING = 300_000;
const MIN_FIXTURE_UNITS = 20;

/** Bobot jam 06–20: ramai 07–09 dan 16–19. */
const hourWeight = (h: number): number =>
  h === 7 || h === 8 || (h >= 16 && h <= 18) ? 4 : 1;
const HOURS = Array.from({ length: 15 }, (_, i) => 6 + i);

type Rand = () => number;
type Pending = { until: number; amount: number };

const pick = <T>(xs: readonly T[], rand: Rand): T =>
  xs[Math.floor(rand() * xs.length)] as T;

function pickHour(rand: Rand): number {
  const total = HOURS.reduce((a, h) => a + hourWeight(h), 0);
  let r = rand() * total;
  for (const h of HOURS) {
    r -= hourWeight(h);
    if (r < 0) return h;
  }
  return 20;
}

type Line = { productId: string; item: SaleItem };

/** 1–6 barang berbeda dari `pool`; `extra` (barang lambat) selalu ikut sebagai baris pertama. */
function buildItems(
  pool: readonly Product[],
  rand: Rand,
  extra: Product | undefined,
): Line[] {
  const count = 1 + Math.floor(rand() ** 1.5 * 6);
  const chosen = new Set<Product>(extra ? [extra] : []);
  while (chosen.size < count) chosen.add(pick(pool, rand));
  return [...chosen].flatMap((p): Line[] => {
    const unit = p.units.length > 1 && rand() < 0.15 ? p.units[1] : p.units[0];
    if (!unit) return [];
    const line = p.isCurah
      ? priceLine(unit, { amount: (2 + Math.floor(rand() * 19)) * 1000 })
      : priceLine(unit, {
          qtyBase: (1 + Math.floor(rand() ** 2 * 4)) * unit.unitSize,
        });
    return [
      {
        productId: p.id,
        item: {
          unitId: unit.id,
          productName: p.name,
          unitName: unit.name,
          isCurah: p.isCurah,
          baseUnit: p.baseUnit,
          unitSize: unit.unitSize,
          ...line,
        },
      },
    ];
  });
}

/** Satu hari: 20–60 penjualan (akhir pekan ×1,3), waktu & nomor struk berurutan. */
function timesFor(day: BusinessDay, rand: Rand): number[] {
  const base = 20 + Math.floor(rand() * 41);
  const weekend = day.weekday === 0 || day.weekday === 6;
  const count = weekend ? Math.round(base * 1.3) : base;
  return Array.from(
    { length: count },
    () =>
      day.start + pickHour(rand) * HOUR_MS + Math.floor(rand() * 3600) * 1000,
  ).sort((a, b) => a - b);
}

type Ctx = {
  state: MockState;
  /** Barang yang dijual acak: semua kecuali barang lambat. */
  pool: readonly Product[];
  rand: Rand;
  today: BusinessDay;
  dewi: MockState["customers"][number] | undefined;
  pending: Pending[];
  credits: Omit<CreditEntry, "id" | "paymentId">[];
  saleN: number;
  shiftN: number;
};

/** Pembayaran satu penjualan: 80% tunai, 15% QRIS, 5% kasbon (Mbak Dewi bila muat). */
function payFor(ctx: Ctx, at: number, total: number) {
  const roll = ctx.rand();
  const outstanding = ctx.pending
    .filter((p) => p.until > at)
    .reduce((a, p) => a + p.amount, 0);
  const canCredit =
    total <= CREDIT_MAX_SALE && outstanding + total <= CREDIT_MAX_OUTSTANDING;
  if (roll >= 0.95 && ctx.dewi && canCredit) {
    return { method: "credit" as const, customerId: ctx.dewi.id };
  }
  return {
    method: roll >= 0.8 ? ("qris" as const) : ("cash" as const),
    customerId: null,
  };
}

/** Shift pagi (Rina 06.00–13.05) dan sore (Budi 13.00–21.05); tumpang 5 menit. */
const SHIFTS = [
  ["Rina", 6, 13],
  ["Budi", 13, 21],
] as const;

/** Kasir sebuah jam jual: pagi sebelum 13.00, sore sesudahnya (bukan tebakan dari jam tutup). */
const kasirAt = (day: BusinessDay, at: number): "Rina" | "Budi" =>
  at - day.start < 13 * HOUR_MS ? "Rina" : "Budi";

function makeSale(
  ctx: Ctx,
  day: BusinessDay,
  at: number,
  seq: number,
  shiftIds: Readonly<Record<"Rina" | "Budi", string>>,
  slow: Product | undefined,
): MockSale {
  const { state, rand } = ctx;
  const lines = buildItems(ctx.pool, rand, slow);
  const items = lines.map((l) => l.item);
  const lineCosts = saleLineCosts(state.products, items);
  const total = items.reduce((a, it) => a + it.subtotal, 0);
  const { method, customerId } = payFor(ctx, at, total);
  const step = total < 50_000 ? 5000 : 10_000;
  const cashReceived = method === "cash" ? Math.ceil(total / step) * step : 0;
  ctx.saleN += 1;
  const id = makeId(KIND.sale, ctx.saleN);
  for (const { productId, item } of lines) {
    state.stock[productId] = (state.stock[productId] ?? 0) - item.qtyBase;
  }
  if (customerId) {
    const repayAt = Math.min(
      at + (1 + Math.floor(rand() * 7)) * DAY_MS,
      ctx.today.start - 1,
    );
    ctx.pending.push({ until: repayAt, amount: total });
    ctx.credits.push(
      { customerId, amount: total, at, saleId: id },
      { customerId, amount: -total, at: repayAt, saleId: null },
    );
  }
  const kasirName = kasirAt(day, at);
  return {
    id,
    number: formatSaleNumber(at, seq),
    createdAt: at,
    kasirName,
    shiftId: shiftIds[kasirName],
    items,
    total,
    payments: [{ method, amount: total }],
    cashReceived,
    change: cashReceived === 0 ? 0 : cashReceived - total,
    customerId,
    status: "selesai",
    printStatus: "tercetak",
    costTotal: sumLineCosts(lineCosts),
    lineCosts,
    voidedAt: null,
    voidedById: null,
    voidedByName: null,
    voidReason: null,
    voidChannel: null,
    voidRefund: null,
    creditOverLimit: null,
  };
}

/** Id shift pagi & sore hari itu, dibuat sebelum penjualannya (urutan id sama dengan penutupan). */
function shiftIdsFor(ctx: Ctx): Record<"Rina" | "Budi", string> {
  const ids = SHIFTS.map(() => {
    ctx.shiftN += 1;
    return makeId(KIND.shift, ctx.shiftN);
  });
  return { Rina: ids[0] ?? "", Budi: ids[1] ?? "" };
}

/** Shift pagi & sore ditutup dengan selisih acak; isinya = penjualan yang menunjuk shift itu. */
function closeShifts(
  ctx: Ctx,
  day: BusinessDay,
  sales: readonly MockSale[],
  shiftIds: Readonly<Record<"Rina" | "Budi", string>>,
) {
  for (const [kasirName, openHour, closeHour] of SHIFTS) {
    const shiftId = shiftIds[kasirName];
    const own = sales.filter((s) => s.shiftId === shiftId);
    const cashSales = own.reduce(
      (a, s) => a + (s.payments.find((p) => p.method === "cash")?.amount ?? 0),
      0,
    );
    const expectedCash = OPENING_CASH + cashSales;
    const difference = pick(SHIFT_DIFFS, ctx.rand);
    ctx.state.closedShifts.push({
      shiftId,
      openingCash: OPENING_CASH,
      cashSales,
      supplierPayments: 0,
      creditPayments: 0,
      saleRefunds: 0,
      expectedCash,
      countedCash: expectedCash + difference,
      difference,
      salesCount: own.length,
      kasirName,
      openedAt: day.start + openHour * HOUR_MS,
      closedAt: day.start + closeHour * HOUR_MS + 5 * 60_000,
    });
  }
}

/** Restock: barang menipis kembali seperti seed; lainnya tidak turun di bawah 20 satuan. */
function restock(
  state: MockState,
  baseStock: Readonly<Record<string, number>>,
  low: ReadonlySet<string>,
): void {
  for (const p of state.products) {
    const floor = MIN_FIXTURE_UNITS * (p.units[0]?.unitSize ?? 1);
    if (low.has(p.id) || (state.stock[p.id] ?? 0) < floor) {
      state.stock[p.id] = baseStock[p.id] ?? 0;
    }
  }
}

/**
 * (K11) `SLOW_PRODUCTS` barang lambat dari `candidates` (barang buatan), selain yang menipis agar
 * stoknya tetap > 0 dan tampil di laporan Tidak terjual.
 */
function pickSlow(
  state: MockState,
  candidates: readonly string[],
  low: ReadonlySet<string>,
): Product[] {
  const pool = state.products.filter(
    (p) => candidates.includes(p.id) && !low.has(p.id),
  );
  if (pool.length < SLOW_PRODUCTS) {
    throw new Error("Calon barang lambat kurang");
  }
  const rand = rng(SLOW_SEED);
  const chosen = new Set<Product>();
  while (chosen.size < SLOW_PRODUCTS) chosen.add(pick(pool, rand));
  return [...chosen];
}

/** Hari-ke-belakang → barang lambat yang ikut di penjualan ke-i hari itu. */
function slowSalesByDay(slow: readonly Product[]): Map<number, Product[]> {
  const byBack = new Map<number, Product[]>();
  SLOW_SOLD_BACK.forEach((backs, i) => {
    const product = slow[SLOW_PRODUCTS - SLOW_SOLD_BACK.length + i];
    if (!product) return;
    for (const back of backs) {
      byBack.set(back, [...(byBack.get(back) ?? []), product]);
    }
  });
  return byBack;
}

/**
 * Isi penjualan selesai `HISTORY_DAYS` hari sebelum hari bisnis `now` (hari ini sengaja kosong),
 * lengkap dengan HPP per baris, shift tertutup, stok, dan kasbon Mbak Dewi yang lunas 1-7 hari
 * kemudian. `slowCandidates` = id barang yang boleh dijadikan barang lambat (bukan fixture).
 * Pengacak sendiri yang hanya bergantung pada tanggal bisnis.
 */
export function generateHistory(
  state: MockState,
  now: number,
  slowCandidates: readonly string[],
): void {
  const today = businessDay(now);
  const baseStock = { ...state.stock };
  const low = new Set(
    state.products
      .filter((p) => (state.stock[p.id] ?? 0) < (state.minStock[p.id] ?? 0))
      .map((p) => p.id),
  );
  const slow = pickSlow(state, slowCandidates, low);
  const slowByBack = slowSalesByDay(slow);
  const ctx: Ctx = {
    state,
    pool: state.products.filter((p) => !slow.includes(p)),
    rand: rng(HISTORY_SEED ^ Number(today.key)),
    today,
    dewi: state.customers.find((c) => c.name === CREDIT_CUSTOMER),
    pending: [],
    credits: [],
    saleN: 0,
    shiftN: 0,
  };
  for (let back = HISTORY_DAYS; back >= 1; back--) {
    const day = daysBefore(today, back);
    const shiftIds = shiftIdsFor(ctx);
    const forced = slowByBack.get(back) ?? [];
    const sales = timesFor(day, ctx.rand).map((at, i) =>
      makeSale(ctx, day, at, i + 1, shiftIds, forced[i]),
    );
    state.sales.push(...sales);
    state.saleSeq[day.key] = sales.length;
    closeShifts(ctx, day, sales, shiftIds);
  }
  // Pelunasan Mbak Dewi = rekaman pelunasan seed (Tunai jalur kasir oleh Rina, tanpa shift).
  const rina = state.users.find((u) => u.name === "Rina");
  if (!rina) throw new Error("Seed tanpa Rina");
  for (const entry of ctx.credits.sort((a, b) => a.at - b.at)) {
    if (entry.amount < 0 && entry.saleId === null) {
      appendSeedRepayment(state, rina, {
        customerId: entry.customerId,
        amount: -entry.amount,
        at: entry.at,
      });
    } else {
      appendCredit(state, { ...entry, paymentId: null });
    }
  }
  restock(state, baseStock, low);
}
