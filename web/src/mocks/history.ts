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
import { saleCost } from "./sale-rules";
import { KIND, makeId, rng } from "./seed";

const HISTORY_DAYS = 14;
const HISTORY_SEED = 0x5eed1d;
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

function buildItems(products: readonly Product[], rand: Rand): Line[] {
  const count = 1 + Math.floor(rand() ** 1.5 * 6);
  const chosen = new Set<Product>();
  while (chosen.size < count) chosen.add(pick(products, rand));
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

/** Satu hari: waktu penjualan berurutan, nomor struk berurutan per hari. */
function timesFor(day: BusinessDay, rand: Rand): number[] {
  const base = 40 + Math.floor(rand() * 121);
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
  rand: Rand;
  today: BusinessDay;
  dewi: MockState["customers"][number] | undefined;
  pending: Pending[];
  credits: Omit<CreditEntry, "id">[];
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

function makeSale(
  ctx: Ctx,
  day: BusinessDay,
  at: number,
  seq: number,
): MockSale {
  const { state, rand } = ctx;
  const lines = buildItems(state.products, rand);
  const items = lines.map((l) => l.item);
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
  return {
    id,
    number: formatSaleNumber(at, seq),
    createdAt: at,
    kasirName: at - day.start < 13 * HOUR_MS ? "Rina" : "Budi",
    items,
    total,
    payments: [{ method, amount: total }],
    cashReceived,
    change: cashReceived === 0 ? 0 : cashReceived - total,
    customerId,
    status: "selesai",
    printStatus: "tercetak",
    costTotal: saleCost(state.unitCosts, items),
  };
}

/** Shift pagi (Rina) dan sore (Budi) ditutup dengan selisih acak. */
function closeShifts(ctx: Ctx, day: BusinessDay, sales: readonly MockSale[]) {
  for (const [kasirName, closeHour] of [
    ["Rina", 13],
    ["Budi", 21],
  ] as const) {
    const own = sales.filter((s) => s.kasirName === kasirName);
    const cashSales = own.reduce(
      (a, s) => a + (s.payments.find((p) => p.method === "cash")?.amount ?? 0),
      0,
    );
    const expectedCash = OPENING_CASH + cashSales;
    const difference = pick(SHIFT_DIFFS, ctx.rand);
    ctx.shiftN += 1;
    ctx.state.closedShifts.push({
      shiftId: makeId(KIND.shift, ctx.shiftN),
      openingCash: OPENING_CASH,
      cashSales,
      expectedCash,
      countedCash: expectedCash + difference,
      difference,
      salesCount: own.length,
      kasirName,
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
 * Isi penjualan selesai 14 hari sebelum hari bisnis `now` (hari ini sengaja kosong),
 * lengkap dengan shift tertutup, stok, dan kasbon Mbak Dewi yang lunas 1-7 hari kemudian.
 * Pengacak sendiri yang hanya bergantung pada tanggal bisnis.
 */
export function generateHistory(state: MockState, now: number): void {
  const today = businessDay(now);
  const baseStock = { ...state.stock };
  const low = new Set(
    state.products
      .filter((p) => (state.stock[p.id] ?? 0) < (state.minStock[p.id] ?? 0))
      .map((p) => p.id),
  );
  const ctx: Ctx = {
    state,
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
    const sales = timesFor(day, ctx.rand).map((at, i) =>
      makeSale(ctx, day, at, i + 1),
    );
    state.sales.push(...sales);
    state.saleSeq[day.key] = sales.length;
    closeShifts(ctx, day, sales);
  }
  for (const entry of ctx.credits.sort((a, b) => a.at - b.at)) {
    appendCredit(state, entry);
  }
  restock(state, baseStock, low);
}
