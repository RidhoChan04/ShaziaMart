import type { MockState } from "../db";

/**
 * K7: stok barang pada jam `t` = stok sekarang − Σ mutasi yang berlaku sesudah `t`
 * (penjualan `createdAt`, batal jual `voidedAt`, entri ledger `effectiveAt`). Tidak memakai
 * `movementsOf`, yang memakai jam dicatat.
 */
export function stockAt(
  state: Readonly<MockState>,
  productId: string,
  t: number,
): number {
  const product = state.products.find((p) => p.id === productId);
  const unitIds = new Set(product?.units.map((u) => u.id));
  let after = 0;
  for (const sale of state.sales) {
    const qty = sale.items
      .filter((i) => unitIds.has(i.unitId))
      .reduce((sum, i) => sum + i.qtyBase, 0);
    if (qty === 0) continue;
    if (sale.createdAt > t) after -= qty;
    if (sale.status === "dibatalkan" && (sale.voidedAt ?? sale.createdAt) > t) {
      after += qty;
    }
  }
  for (const e of state.stockEntries) {
    if (e.productId === productId && e.effectiveAt > t) after += e.qtyBase;
  }
  return (state.stock[productId] ?? 0) - after;
}
