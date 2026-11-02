import { newId } from "@/shared/lib/id";
import {
  hppFromDraft,
  type ProductDraft,
  type SellUnitKind,
} from "@/shared/lib/product-rules";
import type { MockProduct, MockState, MockUnit } from "../db";
import { type Ctx, key } from "./checks";
import { eceranOf } from "./views";

function nextStoreCode(state: Readonly<MockState>): string {
  const codes = state.products
    .map((p) => Number(p.storeCode))
    .filter(Number.isSafeInteger);
  return String(Math.max(0, ...codes) + 1);
}

/** Ejaan sama tanpa beda huruf & spasi ujung → ejaan lama dipertahankan. */
const keepSpelling = (old: string | undefined, next: string): string =>
  old !== undefined && key(old) === key(next) ? old : next.trim();

/** Satuan hasil: eceran (id tetap) lalu satuan lain; satuan besar tetap di posisinya, yang baru di akhir. */
function buildUnits(
  { target, d, matched, others }: Ctx,
  productId: string,
  kind: SellUnitKind,
  now: number,
): MockUnit[] {
  const oldEceran = target ? eceranOf(target) : undefined;
  const eceran: MockUnit = {
    id: oldEceran?.id ?? newId(now),
    productId,
    name: keepSpelling(oldEceran?.name, d.sellUnit ?? ""),
    unitSize: kind.unitSize,
    price: d.price ?? 0,
    wholesaleTiers:
      d.tierMinQty !== null && d.tierPrice !== null
        ? [{ minQty: d.tierMinQty, price: d.tierPrice }]
        : [],
    barcodes: d.barcode !== null ? [d.barcode] : [],
    active: true,
  };
  if (d.bigName === null || d.bigSize === null || d.bigPrice === null) {
    return [eceran, ...others];
  }
  const big: MockUnit = {
    ...(matched ?? { id: newId(now), productId, wholesaleTiers: [] }),
    name: keepSpelling(matched?.name, d.bigName),
    unitSize: d.bigSize * kind.unitSize,
    price: d.bigPrice,
    barcodes: d.bigBarcode !== null ? [d.bigBarcode] : [],
    active: true,
  };
  if (matched === null) return [eceran, ...others, big];
  const rest = (target?.units.slice(1) ?? []).flatMap((u) =>
    u === matched ? [big] : others.filter((o) => o.id === u.id),
  );
  return [eceran, ...rest];
}

/** Kategori dengan ejaan daftar bila sudah ada (tanpa beda huruf); `isNew` = belum ada di daftar. */
function categoryOf(
  state: Readonly<MockState>,
  category: string | null,
): { category: string | null; isNew: boolean } {
  const typed = category?.trim() || null;
  if (typed === null) return { category: null, isNew: false };
  const listed = state.categories.find((c) => key(c) === key(typed));
  return { category: listed ?? typed, isNew: listed === undefined };
}

export function notesOf(d: ProductDraft, newCategory: string | null): string[] {
  const notes: string[] = [];
  if (d.cost !== null && d.bigCost !== null) {
    notes.push("Modal eceran diabaikan — memakai modal satuan besar");
  }
  if (newCategory !== null) notes.push(`Kategori baru: ${newCategory}`);
  return notes;
}

/** Barang hasil draft yang sudah lolos `validateDraft`, keunikan, dan kunci. */
export function buildProduct(
  ctx: Ctx,
  kind: SellUnitKind,
  opts: { mode: "replace" | "merge"; now: number },
): { product: MockProduct; newCategory: string | null } {
  const { state, target, d } = ctx;
  const id = target?.id ?? newId(opts.now);
  const name = d.name ?? "";
  const { category, isNew } = categoryOf(state, d.category);
  const product: MockProduct = {
    id,
    name:
      opts.mode === "merge" ? keepSpelling(target?.name, name) : name.trim(),
    storeCode: target?.storeCode ?? nextStoreCode(state),
    isCurah: kind.isCurah,
    baseUnit: kind.baseUnit,
    units: buildUnits(ctx, id, kind, opts.now),
    category,
    status: target?.status ?? "aktif",
    scarce: target?.scarce ?? false,
    stockCounted: target?.stockCounted ?? false,
    cost: hppFromDraft(d),
  };
  return { product, newCategory: isNew ? category : null };
}
