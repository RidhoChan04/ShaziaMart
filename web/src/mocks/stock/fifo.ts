import type { MockState } from "../db";

/** Satu kiriman = satu baris nota aktif; `lineId` hanya unik di dalam notanya (K9). */
export type Shipment = {
  receiptId: string;
  lineId: string;
  notaDate: string;
  createdAt: number;
  /** Urutan baris di notanya. */
  order: number;
  qtyBase: number;
  removedQtyBase: number;
  expiryDate: string | null;
};
export type Allocation = {
  receiptId: string;
  lineId: string;
  capacityQtyBase: number;
  estimateQtyBase: number;
};

const newestFirst = (a: Shipment, b: Shipment): number =>
  b.notaDate.localeCompare(a.notaDate) ||
  b.createdAt - a.createdAt ||
  b.order - a.order;

/**
 * K9 (J6): barang lama dianggap terjual lebih dulu, jadi stok yang tersisa ada di kiriman
 * terbaru. Hasil mengikuti urutan `shipments`.
 */
export function allocateFifo(
  shipments: readonly Shipment[],
  stock: number,
): Allocation[] {
  const rows = shipments.map((s) => ({
    s,
    a: {
      receiptId: s.receiptId,
      lineId: s.lineId,
      capacityQtyBase: Math.max(0, s.qtyBase - s.removedQtyBase),
      estimateQtyBase: 0,
    },
  }));
  let left = Math.max(stock, 0);
  for (const { a } of [...rows].sort((x, y) => newestFirst(x.s, y.s))) {
    a.estimateQtyBase = Math.min(a.capacityQtyBase, left);
    left -= a.estimateQtyBase;
  }
  return rows.map((r) => r.a);
}

/** Baris nota aktif barang ini; `removedQtyBase` dari entri `keluar_kedaluwarsa` baris itu. */
export function shipmentsOf(
  state: Readonly<MockState>,
  productId: string,
): Shipment[] {
  const removed = new Map<string, number>();
  for (const e of state.stockEntries) {
    if (e.productId !== productId || e.kind !== "keluar_kedaluwarsa") continue;
    const k = JSON.stringify([e.receiptId, e.lineId]);
    removed.set(k, (removed.get(k) ?? 0) - e.qtyBase);
  }
  return state.receipts
    .filter((r) => r.status === "aktif")
    .flatMap((r) =>
      r.lines.flatMap((l, order) =>
        l.productId !== productId
          ? []
          : [
              {
                receiptId: r.id,
                lineId: l.lineId,
                notaDate: r.notaDate,
                createdAt: r.createdAt,
                order,
                qtyBase: l.qty * l.unitSize,
                removedQtyBase:
                  removed.get(JSON.stringify([r.id, l.lineId])) ?? 0,
                expiryDate: l.expiryDate,
              },
            ],
      ),
    );
}
