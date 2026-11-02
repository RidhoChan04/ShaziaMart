import type { FieldError } from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  activeBigUnit,
  type ProductDraft,
  sellUnitKind,
} from "@/shared/lib/product-rules";
import type { MockProduct, MockState, MockUnit } from "../db";
import { eceranOf } from "./views";

/** Pembanding nama/satuan: tanpa beda huruf & spasi ujung. */
export const key = (s: string): string => s.trim().toLowerCase();

/** Draft yang diterapkan ke barang lama (`target` null = barang baru). */
export type Ctx = {
  state: Readonly<MockState>;
  target: MockProduct | null;
  d: ProductDraft;
  /** Satuan besar lama yang diubah draft. */
  matched: MockUnit | null;
  /** Satuan non-eceran lain yang tersisa (lihat `otherUnits`). */
  others: MockUnit[];
  sold: ReadonlySet<string>;
};

/** Satuan besar lama yang diubah draft: lewat unitId (form) atau nama (impor). */
export function matchBig(
  target: MockProduct | null,
  d: ProductDraft,
  mode: "replace" | "merge",
  bigUnitId: string | null | undefined,
): MockUnit | null {
  if (target === null || d.bigName === null) return null;
  const others = target.units.slice(1);
  if (mode === "replace") {
    return others.find((u) => u.id === bigUnitId) ?? null;
  }
  const name = key(d.bigName);
  const active = activeBigUnit(target);
  if (active && key(active.name) === name) return active;
  return others.find((u) => key(u.name) === name) ?? null;
}

/** Satuan non-eceran selain `matched`: satuan besar aktif yang diganti → nonaktif bila terjual, selain itu dibuang. */
export function otherUnits(
  target: MockProduct | null,
  matched: MockUnit | null,
  sold: ReadonlySet<string>,
): MockUnit[] {
  if (target === null) return [];
  const replaced = activeBigUnit(target);
  return target.units.slice(1).flatMap((u) => {
    if (u === matched) return [];
    if (u !== replaced) return [u];
    return sold.has(u.id) ? [{ ...u, active: false }] : [];
  });
}

export function uniqueErrors(
  { state, target, d, others }: Ctx,
  taken: ReadonlySet<string>,
): FieldError[] {
  const errors: FieldError[] = [];
  const name = d.name;
  if (
    name !== null &&
    !taken.has("name") &&
    state.products.some((p) => p.id !== target?.id && key(p.name) === key(name))
  ) {
    errors.push({ field: "name", message: "Nama sudah dipakai barang lain" });
  }
  const codes = [
    ["barcode", d.barcode],
    ["bigBarcode", d.bigBarcode],
  ] as const;
  for (const [field, code] of codes) {
    if (code === null || taken.has(field)) continue;
    const owner =
      state.products.find(
        (p) =>
          p.id !== target?.id && p.units.some((u) => u.barcodes.includes(code)),
      ) ?? (others.some((u) => u.barcodes.includes(code)) ? target : undefined);
    if (owner) {
      errors.push({ field, message: `Barcode sudah dipakai: ${owner.name}` });
    }
  }
  return errors;
}

/**
 * Spec §12d: satuan dasar dan isi satuan yang pernah terjual dikunci. C11: satuan dasar
 * juga dikunci bila stok ≠ 0, karena stok tersimpan dalam qtyBase satuan dasar lama.
 */
export function lockErrors({
  state,
  target,
  d,
  matched,
  sold,
}: Ctx): FieldError[] {
  const kind = sellUnitKind(d.sellUnit ?? "");
  if (target === null || kind === null) return [];
  const errors: FieldError[] = [];
  const eceran = eceranOf(target);
  if (
    (target.units.some((u) => sold.has(u.id)) ||
      (state.stock[target.id] ?? 0) !== 0) &&
    (kind.baseUnit !== target.baseUnit || kind.unitSize !== eceran.unitSize)
  ) {
    errors.push({
      field: "sellUnit",
      message: "'Dijual per' tidak bisa diubah — barang sudah terjual",
    });
  }
  if (
    matched !== null &&
    sold.has(matched.id) &&
    d.bigSize !== matched.unitSize / eceran.unitSize
  ) {
    errors.push({
      field: "bigSize",
      message: `Isi ${matched.name} tidak bisa diubah — sudah terjual`,
    });
  }
  return errors;
}
