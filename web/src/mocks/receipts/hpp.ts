import type { ProductCost } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { roundHalfUp } from "@/shared/lib/quantity";

/**
 * K3 — HPP rata-rata tertimbang saat barang masuk, disimpan sebagai `{nilai stok Rp, qty}`.
 * Stok ≤ 0 atau HPP lama null → HPP = harga beli terbaru.
 */
export function receiveCost(
  prev: ProductCost | null,
  stockBefore: number,
  qtyIn: number,
  lineCost: number,
): ProductCost {
  const s = Math.max(stockBefore, 0);
  if (prev === null || s === 0) return { amount: lineCost, qtyBase: qtyIn };
  return {
    amount: roundHalfUp(s * prev.amount, prev.qtyBase) + lineCost,
    qtyBase: s + qtyIn,
  };
}

/**
 * K4 — HPP setelah baris nota diubah (`next`) atau dibatalkan (`next` null): nilai stok
 * dikurangi nilai baris lama lalu ditambah nilai baris baru. Penyebut ≤ 0 atau nilai < 0
 * → ubah: harga baru; batal: HPP tetap. Baris tidak berubah → objek `current` yang sama.
 */
export function reviseCost(
  current: ProductCost | null,
  stock: number,
  old: { qtyBase: number; cost: number },
  next: { qtyBase: number; cost: number } | null,
): ProductCost | null {
  const s = Math.max(stock, 0);
  const nq = next?.qtyBase ?? 0;
  const nc = next?.cost ?? 0;
  if (next && old.qtyBase === nq && old.cost === nc) return current;
  const value =
    current === null
      ? null
      : roundHalfUp(s * current.amount, current.qtyBase) - old.cost + nc;
  const qty = s - old.qtyBase + nq;
  if (value === null || qty <= 0 || value < 0) {
    return next ? { amount: nc, qtyBase: nq } : current;
  }
  return { amount: value, qtyBase: qty };
}
