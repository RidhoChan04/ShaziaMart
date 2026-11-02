import type {
  FieldError,
  PriceHistoryEntry,
  PriceSource,
  ProductCost,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  type ProductDraft,
  sellUnitKind,
  validateDraft,
} from "@/shared/lib/product-rules";
import type { MockProduct, MockState } from "../db";
import { buildProduct, notesOf } from "./build";
import { changesOf, priceEntriesOf } from "./changes";
import {
  type Ctx,
  lockErrors,
  matchBig,
  otherUnits,
  uniqueErrors,
} from "./checks";
import { sameCost } from "./cost-alert";
import { draftFromProduct } from "./drafts";
import { soldUnitIds } from "./views";

export type ApplyOptions = {
  /** replace = form: field kosong menghapus; merge = impor: field kosong mempertahankan nilai lama (K4). */
  mode: "replace" | "merge";
  source: PriceSource;
  now: number;
  /** replace: satuan besar yang diubah (`bigUnit.unitId`); merge mencocokkan lewat nama. */
  bigUnitId?: string | null;
};
export type ApplyOk = {
  ok: true;
  product: MockProduct;
  isNew: boolean;
  changes: string[];
  notes: string[];
  priceEntries: PriceHistoryEntry[];
  costChanged: boolean;
  /** Batas stok menipis dalam qtyBase; null = tanpa batas. */
  minStock: number | null;
};
export type ApplyResult = ApplyOk | { ok: false; errors: FieldError[] };

function mergeDraft(draft: ProductDraft, old: ProductDraft): ProductDraft {
  const out = { ...old };
  for (const k of Object.keys(draft) as (keyof ProductDraft)[]) {
    if (draft[k] !== null) Object.assign(out, { [k]: draft[k] });
  }
  return out;
}

/**
 * Terapkan draft ke barang (`target` null = barang baru) tanpa memutasi state:
 * validasi, keunikan, kunci barang terjual, lalu barang hasil beserta changes,
 * notes, dan entri riwayat harga.
 */
export function applyDraft(
  state: Readonly<MockState>,
  target: MockProduct | null,
  draft: ProductDraft,
  opts: ApplyOptions,
): ApplyResult {
  const d =
    target !== null && opts.mode === "merge"
      ? mergeDraft(draft, draftFromProduct(state, target))
      : draft;
  const sold = soldUnitIds(state);
  const matched = matchBig(target, d, opts.mode, opts.bigUnitId);
  const others = otherUnits(target, matched, sold);
  const ctx: Ctx = { state, target, d, matched, others, sold };
  const errors: FieldError[] = validateDraft(d);
  errors.push(...uniqueErrors(ctx, new Set(errors.map((e) => e.field))));
  errors.push(...lockErrors(ctx));
  // validateDraft sudah menolak 'Dijual per' kosong; cek kind hanya untuk tipe.
  const kind = sellUnitKind(d.sellUnit ?? "");
  if (errors.length > 0 || kind === null) return { ok: false, errors };

  const { product, newCategory } = buildProduct(ctx, kind, opts);
  const minStock =
    d.minStock === null ? null : Math.round(d.minStock * kind.unitSize);
  return {
    ok: true,
    product,
    isNew: target === null,
    changes: target
      ? changesOf(target, state.minStock[target.id] ?? null, product, minStock)
      : [],
    notes: notesOf(d, newCategory),
    priceEntries: target
      ? priceEntriesOf(target, product, opts.source, opts.now)
      : [],
    costChanged: target !== null && !sameCost(target.cost, product.cost),
    minStock,
  };
}

function updateCostAlert(
  state: MockState,
  prev: MockProduct,
  next: ProductCost | null,
  { source, now }: ApplyOptions,
): void {
  const alert = state.costAlerts[prev.id];
  if (next === null || (alert && sameCost(alert.fromCost, next))) {
    delete state.costAlerts[prev.id];
  } else if (alert) {
    alert.changedAt = now;
    alert.source = source;
  } else if (prev.cost !== null) {
    state.costAlerts[prev.id] = { fromCost: prev.cost, changedAt: now, source };
  }
}

/** Simpan hasil `applyDraft`/`applyPriceLines`: barang, stok awal, batas, kategori baru, riwayat harga, peringatan modal. */
export function saveApplied(
  state: MockState,
  result: ApplyOk,
  opts: ApplyOptions,
): void {
  const { product } = result;
  const index = state.products.findIndex((p) => p.id === product.id);
  const prev = state.products[index];
  if (prev) {
    if (result.costChanged) updateCostAlert(state, prev, product.cost, opts);
    state.products[index] = product;
  } else {
    state.products.push(product);
    state.stock[product.id] = 0;
  }
  if (result.minStock === null) delete state.minStock[product.id];
  else state.minStock[product.id] = result.minStock;
  if (
    product.category !== null &&
    !state.categories.includes(product.category)
  ) {
    state.categories.push(product.category);
  }
  state.priceHistory.push(
    ...result.priceEntries.map((e) => ({ ...e, productId: product.id })),
  );
}
