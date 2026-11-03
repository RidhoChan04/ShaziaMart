import type {
  ProductCost,
  ReceiptLine,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import type { MockProduct, MockState } from "../db";
import { noteCostChange, sameCost } from "../products/cost-alert";
import { usableCost } from "./check";
import { reviseCost } from "./hpp";

// K4 per baris nota (ubah & batal): stok, HPP, dan butir modal.

export function productOf(state: Readonly<MockState>, id: string): MockProduct {
  const p = state.products.find((x) => x.id === id);
  if (!p) throw new Error(`Barang nota tidak ditemukan: ${id}`);
  return p;
}

type Step = { delta: number; stock: number; cost: ProductCost | null };

/**
 * K4 untuk satu baris (`next` null = batal): selisih stok dan HPP baru (null = HPP tetap).
 * HPP rusak dianggap belum ada; hasil di luar bilangan bulat aman → "besar" (R13).
 */
export function stepOf(
  cost: ProductCost | null,
  stock: number,
  l: ReceiptLine,
  next: { qty: number; unitCost: number } | null,
): Step | "besar" {
  const old = { qtyBase: l.qty * l.unitSize, cost: l.subtotal };
  const nq = next === null ? 0 : next.qty * l.unitSize;
  const nc = next === null ? 0 : next.qty * next.unitCost;
  const delta = nq - old.qtyBase;
  const after = stock + delta;
  if (![nq, nc, delta, after].every(Number.isSafeInteger)) return "besar";
  try {
    const nextLine = next === null ? null : { qtyBase: nq, cost: nc };
    const c = reviseCost(usableCost(cost), stock, old, nextLine);
    if (c !== null && !Number.isSafeInteger(c.amount)) return "besar";
    return { delta, stock: after, cost: c };
  } catch (e) {
    if (e instanceof RangeError) return "besar";
    throw e;
  }
}

/** HPP baru (null = tetap) dengan butir modal bersumber `ubah_nota` bila rasionya berubah. */
export function setCost(
  state: MockState,
  p: MockProduct,
  cost: ProductCost | null,
  now: number,
): void {
  if (cost === null) return;
  if (usableCost(p.cost) !== null && !sameCost(p.cost, cost)) {
    noteCostChange(state, p, cost, "ubah_nota", now);
  }
  p.cost = cost;
}
