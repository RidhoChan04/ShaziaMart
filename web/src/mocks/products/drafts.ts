import type {
  FieldError,
  ProductField,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  activeBigUnit,
  type ProductDraft,
  unitCost,
} from "@/shared/lib/product-rules";
import type { MockProduct, MockState } from "../db";
import { eceranOf } from "./views";

type Raw = Record<string, unknown>;

/** Isi form barang (`ProductInput`) yang dibaca dari body mentah. */
export type InputDraft = {
  draft: ProductDraft;
  /** Satuan besar yang diubah (`bigUnit.unitId`); null = satuan besar baru. */
  bigUnitId: string | null;
  /** Field bertipe salah; nilainya dianggap kosong. */
  errors: FieldError[];
};

/** Nama kolom uang untuk pesan "{Kolom}: ketik angka saja". */
export const MONEY_LABEL = {
  cost: "Harga modal",
  price: "Harga jual",
  tierPrice: "Harga grosir",
  bigCost: "Harga modal satuan besar",
  bigPrice: "Harga jual satuan besar",
} as const;

const isObj = (x: unknown): x is Raw =>
  typeof x === "object" && x !== null && !Array.isArray(x);

const absent = (v: unknown): boolean => v === null || v === undefined;

/**
 * Body mentah → draft. Batas skema hanya panduan klien: tipe yang salah menjadi
 * pesan per field, sisanya divalidasi `validateDraft` (lewat `applyDraft`).
 */
export function draftFromInput(body: unknown): InputDraft {
  const errors: FieldError[] = [];
  const fail = (field: ProductField, message: string) => {
    errors.push({ field, message });
    return null;
  };
  const text = (v: unknown): string | null =>
    typeof v === "string" && v.trim() !== "" ? v.trim() : null;
  const barcode = (v: unknown, field: ProductField, message: string) =>
    absent(v) || typeof v === "string" ? text(v) : fail(field, message);
  const money = (v: unknown, field: keyof typeof MONEY_LABEL) =>
    absent(v)
      ? null
      : typeof v === "number" && Number.isSafeInteger(v) && v >= 0
        ? v
        : fail(field, `${MONEY_LABEL[field]}: ketik angka saja, mis. 3500`);
  const count = (v: unknown, field: ProductField, message: string) =>
    absent(v)
      ? null
      : typeof v === "number" && Number.isSafeInteger(v)
        ? v
        : fail(field, message);
  const decimal = (v: unknown, field: ProductField, message: string) =>
    absent(v)
      ? null
      : typeof v === "number" && Number.isFinite(v)
        ? v
        : fail(field, message);

  const b = isObj(body) ? body : {};
  const tier = isObj(b.tier) ? b.tier : {};
  const big = isObj(b.bigUnit) ? b.bigUnit : {};
  const draft: ProductDraft = {
    name: text(b.name),
    category: text(b.category),
    sellUnit: text(b.sellUnit),
    barcode: barcode(b.barcode, "barcode", "Barcode salah, scan ulang"),
    cost: money(b.cost, "cost"),
    price: money(b.price, "price"),
    tierMinQty: count(
      tier.minQty,
      "tierMinQty",
      "Grosir: beli minimal 2 ke atas",
    ),
    tierPrice: money(tier.price, "tierPrice"),
    bigName: text(big.name),
    bigSize: count(big.size, "bigSize", "Satuan besar: isi berapa? (min. 2)"),
    bigBarcode: barcode(
      big.barcode,
      "bigBarcode",
      "Barcode satuan besar salah",
    ),
    bigCost: money(big.cost, "bigCost"),
    bigPrice: money(big.price, "bigPrice"),
    minStock: decimal(
      b.minStock,
      "minStock",
      "Batas stok menipis: isi angka, mis. 20",
    ),
  };
  return {
    draft,
    bigUnitId: typeof big.unitId === "string" ? big.unitId : null,
    errors,
  };
}

/**
 * Barang → isi form. Satuan besar = satuan aktif pertama setelah eceran; HPP yang
 * dicatat per isi satuan besar ditaruh di `bigCost`, selain itu modal eceran di `cost`.
 */
export function draftFromProduct(
  state: Readonly<MockState>,
  p: MockProduct,
): ProductDraft {
  const eceran = eceranOf(p);
  const big = activeBigUnit(p);
  const tier = eceran.wholesaleTiers[0];
  const costOnBig = big !== null && p.cost?.qtyBase === big.unitSize;
  const minStock = state.minStock[p.id];
  return {
    name: p.name,
    category: p.category,
    sellUnit: eceran.name,
    barcode: eceran.barcodes[0] ?? null,
    cost: costOnBig ? null : unitCost(p.cost, eceran.unitSize),
    price: eceran.price,
    tierMinQty: tier?.minQty ?? null,
    tierPrice: tier?.price ?? null,
    bigName: big?.name ?? null,
    bigSize: big ? big.unitSize / eceran.unitSize : null,
    bigBarcode: big?.barcodes[0] ?? null,
    bigCost: costOnBig ? (p.cost?.amount ?? null) : null,
    bigPrice: big?.price ?? null,
    minStock: minStock === undefined ? null : minStock / eceran.unitSize,
  };
}
