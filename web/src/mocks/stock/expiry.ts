import type {
  ExpiryAttention,
  ExpiryEvent,
  OwnerExpiryList,
  StaffExpiryList,
  StaffExpiryLot,
  StaffLowStockItem,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { DAY_MS, jakartaIsoDate } from "@/shared/lib/business-day";
import { expiryStage } from "@/shared/lib/stock-rules";
import type { MockExpiryEvent, MockProduct, MockState } from "../db";
import { eceranOf, stockAlertOf } from "../products/views";
import { allocateFifo, shipmentsOf } from "./fifo";
import { diffValue } from "./opname-value";

const RECENT_DAYS = 14;
const RECENT_MAX = 20;

export const productById = (
  state: Readonly<MockState>,
  id: string,
): MockProduct => {
  const p = state.products.find((x) => x.id === id);
  if (!p) throw new Error(`Barang ${id} tidak ada`);
  return p;
};

export const supplierNameOf = (
  state: Readonly<MockState>,
  id: string,
): string => state.suppliers.find((s) => s.id === id)?.name ?? "";
const stageRank = (l: StaffExpiryLot): number => (l.stage === "lewat" ? 0 : 1);

/**
 * K9/K10: kiriman ber-ED dengan perkiraan FIFO > 0 di tahap `lewat`/`segera`; urut lewat dulu,
 * lalu ED naik (nama dan nota sebagai penentu agar stabil).
 */
export function expiryLots(
  state: Readonly<MockState>,
  today: string,
): StaffExpiryLot[] {
  const soonDays = state.stockRules.expirySoonDays;
  const receipts = new Map(state.receipts.map((r) => [r.id, r]));
  const productIds = new Set(
    state.receipts
      .filter((r) => r.status === "aktif")
      .flatMap((r) => r.lines.filter((l) => l.expiryDate !== null))
      .map((l) => l.productId),
  );
  const lots: StaffExpiryLot[] = [];
  for (const productId of productIds) {
    const p = productById(state, productId);
    const eceran = eceranOf(p);
    const shipments = shipmentsOf(state, productId);
    const allocations = allocateFifo(shipments, state.stock[productId] ?? 0);
    shipments.forEach((s, i) => {
      const a = allocations[i];
      const r = receipts.get(s.receiptId);
      if (!a || !r || s.expiryDate === null || a.estimateQtyBase <= 0) return;
      const stage = expiryStage(s.expiryDate, today, soonDays);
      if (stage === null) return;
      lots.push({
        lineId: s.lineId,
        receiptId: s.receiptId,
        productId,
        productName: p.name,
        unitName: eceran.name,
        unitSize: eceran.unitSize,
        isCurah: p.isCurah,
        estimateQtyBase: a.estimateQtyBase,
        capacityQtyBase: a.capacityQtyBase,
        expiryDate: s.expiryDate,
        stage,
        supplierName: supplierNameOf(state, r.supplierId),
        notaDate: s.notaDate,
      });
    });
  }
  return lots.sort(
    (a, b) =>
      stageRank(a) - stageRank(b) ||
      a.expiryDate.localeCompare(b.expiryDate) ||
      a.productName.localeCompare(b.productName, "id") ||
      a.notaDate.localeCompare(b.notaDate) ||
      a.receiptId.localeCompare(b.receiptId),
  );
}

/** Log 14 hari terakhir, terbaru dulu, maks. 20. */
function recentEvents(
  state: Readonly<MockState>,
  now: number,
): MockExpiryEvent[] {
  return state.expiryLog
    .filter((e) => now - e.at <= RECENT_DAYS * DAY_MS)
    .sort((a, b) => b.at - a.at)
    .slice(0, RECENT_MAX);
}

/** Nama & satuan dari salinan saat kejadian: barangnya boleh sudah dihapus (I3). */
const toEvent = (e: MockExpiryEvent): ExpiryEvent => ({
  id: e.id,
  at: e.at,
  actorName: e.actorName,
  kind: e.kind,
  receiptId: e.receiptId,
  lineId: e.lineId,
  productId: e.productId,
  productName: e.productName,
  unitName: e.unitName,
  unitSize: e.unitSize,
  isCurah: e.isCurah,
  qtyBase: e.qtyBase,
  fromDate: e.fromDate,
  toDate: e.toDate,
});

/** Salinan nama & satuan eceran barang untuk log (I3). */
export function productSnapshot(p: MockProduct) {
  const eceran = eceranOf(p);
  return {
    productName: p.name,
    unitName: eceran.name,
    unitSize: eceran.unitSize,
    isCurah: p.isCurah,
  };
}

/** Daftar orang toko: tanpa nilai rupiah. */
export function staffExpiryList(
  state: Readonly<MockState>,
  now: number,
): StaffExpiryList {
  const today = jakartaIsoDate(now);
  return {
    today,
    soonDays: state.stockRules.expirySoonDays,
    lots: expiryLots(state, today),
    recent: recentEvents(state, now).map(toEvent),
  };
}

/** Daftar pemilik: nilai kiriman dari HPP sekarang; log keluar memakai nilai saat kejadian (K28). */
export function ownerExpiryList(
  state: Readonly<MockState>,
  now: number,
): OwnerExpiryList {
  const today = jakartaIsoDate(now);
  const lots = expiryLots(state, today).map((l) => ({
    ...l,
    lossValue: diffValue(
      l.estimateQtyBase,
      productById(state, l.productId).cost,
    ),
  }));
  return {
    today,
    soonDays: state.stockRules.expirySoonDays,
    lots,
    recent: recentEvents(state, now).map((e) => ({
      ...toEvent(e),
      lossValue: e.lossValue,
    })),
    expiredLossValue: lots
      .filter((l) => l.stage === "lewat")
      .reduce((sum, l) => sum + (l.lossValue ?? 0), 0),
  };
}

/** K19: jumlah barang berbeda yang punya â‰¥ 1 kiriman di tiap tahap. */
export function expiryAttention(
  state: Readonly<MockState>,
  now: number,
): ExpiryAttention {
  const lots = expiryLots(state, jakartaIsoDate(now));
  const count = (stage: StaffExpiryLot["stage"]): number =>
    new Set(lots.filter((l) => l.stage === stage).map((l) => l.productId)).size;
  return {
    expiredCount: count("lewat"),
    soonCount: count("segera"),
    soonDays: state.stockRules.expirySoonDays,
  };
}

/** K21 (J7): barang menipis tanpa angka sisa stok; urut nama. */
export function staffLowStock(state: Readonly<MockState>): StaffLowStockItem[] {
  return state.products
    .filter((p) => stockAlertOf(state, p) === "menipis")
    .sort((a, b) => a.name.localeCompare(b.name, "id"))
    .map((p) => {
      const eceran = eceranOf(p);
      return {
        productId: p.id,
        productName: p.name,
        unitName: eceran.name,
        unitSize: eceran.unitSize,
        isCurah: p.isCurah,
        minQtyBase: state.minStock[p.id] ?? 0,
      };
    });
}
