import type { OpnameScope } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { CHOOSABLE_REASONS } from "@/shared/lib/stock-rules";

// Bentuk & tipe body opname; nilai per barang diperiksa terpisah dengan galat per barang. Rusak → null.

const ID_MAX = 64;

type Obj = Record<string, unknown>;
const isObj = (x: unknown): x is Obj =>
  typeof x === "object" && x !== null && !Array.isArray(x);
const isStr = (x: unknown): x is string => typeof x === "string";

/** Epoch ms atau jumlah: bilangan bulat aman ≥ 0. */
export const isWhole = (x: unknown): x is number =>
  typeof x === "number" && Number.isSafeInteger(x) && x >= 0;

/** `category` wajib (tidak kosong) iff `kind = kategori`; selain itu null. */
export function toScope(kind: unknown, category: unknown): OpnameScope | null {
  if (kind === "kategori") {
    return isStr(category) && category.trim() !== ""
      ? { kind, category }
      : null;
  }
  return (kind === "semua" || kind === "tanpa_kategori") && category === null
    ? { kind, category }
    : null;
}

export type CountInput = {
  productId: string;
  qtyBase: unknown;
  countedAt: unknown;
};
export type SessionInput = {
  id: string;
  scope: OpnameScope;
  deviceNow: number;
  items: CountInput[];
};

export function readSessionInput(x: unknown): SessionInput | null {
  if (!isObj(x)) return null;
  const { id, deviceNow, items } = x;
  const scope = isObj(x.scope) ? toScope(x.scope.kind, x.scope.category) : null;
  if (!isStr(id) || id.length < 1 || id.length > ID_MAX) return null;
  if (scope === null || !isWhole(deviceNow) || !Array.isArray(items)) {
    return null;
  }
  const counts: CountInput[] = [];
  for (const i of items) {
    if (!isObj(i) || !isStr(i.productId)) return null;
    counts.push({
      productId: i.productId,
      qtyBase: i.qtyBase,
      countedAt: i.countedAt,
    });
  }
  return { id, scope, deviceNow, items: counts };
}

export type ReasonInput = {
  productId: string;
  reason: (typeof CHOOSABLE_REASONS)[number];
  receiptId: string | null;
};

/** `receiptId` tidak ada dianggap null (tidak tahu notanya). */
export function readReasons(x: unknown): ReasonInput[] | null {
  if (!isObj(x) || !Array.isArray(x.reasons)) return null;
  const out: ReasonInput[] = [];
  for (const r of x.reasons) {
    if (!isObj(r) || !isStr(r.productId)) return null;
    const reason = CHOOSABLE_REASONS.find((c) => c === r.reason);
    const receiptId = r.receiptId ?? null;
    if (reason === undefined || (receiptId !== null && !isStr(receiptId))) {
      return null;
    }
    out.push({ productId: r.productId, reason, receiptId });
  }
  return out;
}
