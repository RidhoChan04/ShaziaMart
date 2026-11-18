import type {
  StockReport,
  StockReportSort,
  UnsoldItem,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { isoDaysBetween, jakartaIsoDate } from "@/shared/lib/business-day";
import { unitCost } from "@/shared/lib/product-rules";
import type { MockProduct, MockState } from "../db";
import { eceranOf } from "../products/views";
import { usableCost } from "../receipts/check";
import { stockAt } from "../stock/stock-at";
import { byName, nullsLast } from "./report-utils";

/** Jam penjualan selesai terakhir per barang (penjualan dibatalkan tidak dihitung). */
function lastSoldByProduct(state: Readonly<MockState>): Map<string, number> {
  const productOfUnit = new Map<string, string>();
  for (const p of state.products) {
    for (const u of p.units) productOfUnit.set(u.id, p.id);
  }
  const last = new Map<string, number>();
  for (const sale of state.sales) {
    if (sale.status !== "selesai") continue;
    for (const item of sale.items) {
      const id = productOfUnit.get(item.unitId);
      if (id !== undefined && sale.createdAt > (last.get(id) ?? -Infinity)) {
        last.set(id, sale.createdAt);
      }
    }
  }
  return last;
}

/** (K17) Entri stok positif pertama per barang (jam berlakunya). */
function firstStockByProduct(state: Readonly<MockState>): Map<string, number> {
  const first = new Map<string, number>();
  for (const e of state.stockEntries) {
    if (e.qtyBase <= 0) continue;
    if (e.effectiveAt < (first.get(e.productId) ?? Infinity)) {
      first.set(e.productId, e.effectiveAt);
    }
  }
  return first;
}

/**
 * (K17, ruling pengendali) Kapan barang yang belum pernah terjual mulai ada: entri stok positif
 * pertama, kecuali stok sudah ada sebelum entri itu (stok awal seed tanpa entri ledger) atau
 * tidak ada entri sama sekali → `catalogSince`.
 */
function firstPresenceAt(
  state: Readonly<MockState>,
  productId: string,
  firstPositive: number | undefined,
): number {
  if (firstPositive === undefined) return state.catalogSince;
  return stockAt(state, productId, firstPositive - 1) > 0
    ? state.catalogSince
    : firstPositive;
}

const COUNTED = (p: MockProduct): boolean =>
  p.status !== "nonaktif" && p.status !== "menunggu_harga";

const SORTS: Record<StockReportSort, (a: UnsoldItem, b: UnsoldItem) => number> =
  {
    modal: (a, b) =>
      nullsLast(a.heldValue, b.heldValue) ||
      (b.heldValue ?? 0) - (a.heldValue ?? 0),
    lama: (a, b) =>
      b.days - a.days ||
      nullsLast(a.heldValue, b.heldValue) ||
      (b.heldValue ?? 0) - (a.heldValue ?? 0),
  };

/**
 * (K17, P8) Barang tidak terjual ≥ `reportRules.unsoldDays` hari: patokan = penjualan selesai
 * terakhir; barang yang pernah terjual tidak pernah dianggap baru. Belum pernah terjual →
 * patokan = mulai ada (`firstPresenceAt`), dan barang baru (mulai ada < batas hari) tidak ikut.
 * Tidak ikut juga: stok ≤ 0, nonaktif, menunggu_harga. `heldValue` = HPP × stok; tanpa HPP →
 * null, tidak dijumlah.
 */
export function unsoldReport(
  state: Readonly<MockState>,
  now: number,
  sort: StockReportSort,
): StockReport["unsold"] {
  const minDays = state.reportRules.unsoldDays;
  const today = jakartaIsoDate(now);
  const daysSince = (at: number) => isoDaysBetween(jakartaIsoDate(at), today);
  const lastSold = lastSoldByProduct(state);
  const firstStock = firstStockByProduct(state);
  const items: UnsoldItem[] = [];
  for (const p of state.products) {
    const stock = state.stock[p.id] ?? 0;
    if (!COUNTED(p) || stock <= 0) continue;
    const lastSoldAt = lastSold.get(p.id) ?? null;
    const ref =
      lastSoldAt ?? firstPresenceAt(state, p.id, firstStock.get(p.id));
    const days = daysSince(ref);
    if (days < minDays) continue;
    const eceran = eceranOf(p);
    items.push({
      productId: p.id,
      productName: p.name,
      unitName: eceran.name,
      unitSize: eceran.unitSize,
      isCurah: p.isCurah,
      stockQtyBase: stock,
      lastSoldAt,
      sinceDate: jakartaIsoDate(ref),
      days,
      heldValue: unitCost(usableCost(p.cost), stock),
    });
  }
  items.sort(
    (a, b) => SORTS[sort](a, b) || byName(a.productName, b.productName),
  );
  return {
    minDays,
    count: items.length,
    heldValue: items.reduce((sum, i) => sum + (i.heldValue ?? 0), 0),
    noCostCount: items.filter((i) => i.heldValue === null).length,
    items,
  };
}
