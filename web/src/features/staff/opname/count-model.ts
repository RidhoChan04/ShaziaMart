import type { StaffProduct } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatGram } from "@/shared/lib/quantity";
import type { OpnameDraft } from "./opname-draft-types";

/** Barang yang sedang dihitung di kartu; belum masuk draf sebelum `Simpan, lanjut…`. */
export type Current = {
  productId: string;
  qtyBase: number;
  /** Jam HP saat barang dibuka (K6) → `countedAt` bila disimpan. */
  openedAt: number;
  source: "scan" | "buka";
  /** Jumlah sudah diubah pengguna (dipertahankan saat pindah barang / jeda / selesai). */
  touched: boolean;
};

/** Satuan besar dulu (dus, lalu pcs). */
export const unitsLargestFirst = (p: StaffProduct) =>
  [...p.units].sort((a, b) => b.unitSize - a.unitSize);

/** Satuan eceran (`units[0]`). */
const retailName = (p: StaffProduct): string => p.units[0]?.name ?? p.baseUnit;

/** `125 pcs`; curah dalam kg/liter. */
export function qtyText(p: StaffProduct, qtyBase: number): string {
  if (p.isCurah) return formatGram(qtyBase, p.baseUnit === "ml" ? "L" : "kg");
  return `${qtyBase} ${retailName(p)}`;
}

/** Nama satuan untuk ringkasan penghitung (curah: satuan dasar, dipakai UnitCounter untuk kg/liter). */
export const counterBaseName = (p: StaffProduct): string =>
  p.isCurah ? p.baseUnit : retailName(p);

const digits = (code: string): string => code.replace(/^0+/, "");

/** Barang di salinan daftar yang punya barcode ini (nol di depan diabaikan: UPC-A vs EAN-13). */
export function findByBarcode(
  products: readonly StaffProduct[],
  code: string,
): StaffProduct | undefined {
  const wanted = digits(code);
  return products.find((p) =>
    p.units.some((u) => u.barcodes.some((b) => digits(b) === wanted)),
  );
}

/** Saring salinan daftar menurut nama atau barcode. */
export function searchProducts(
  products: readonly StaffProduct[],
  query: string,
): StaffProduct[] {
  const q = query.trim().toLowerCase();
  if (q === "") return [...products];
  return products.filter(
    (p) =>
      p.name.toLowerCase().includes(q) ||
      p.units.some((u) => u.barcodes.some((b) => b.includes(q))),
  );
}

export function openProduct(
  draft: OpnameDraft,
  product: StaffProduct,
  source: Current["source"],
  now: number,
): Current {
  return {
    productId: product.id,
    qtyBase: draft.counts[product.id]?.qtyBase ?? 0,
    openedAt: now,
    source,
    touched: false,
  };
}

/** Barang belum-dihitung berikutnya setelah `afterId` (urut daftar, berputar); null bila semua sudah. */
export function nextUncounted(
  draft: OpnameDraft,
  afterId: string,
): StaffProduct | null {
  const list = draft.products;
  const from = list.findIndex((p) => p.id === afterId);
  for (let i = 1; i <= list.length; i++) {
    const p = list[(from + i) % list.length];
    if (p && draft.counts[p.id] === undefined) return p;
  }
  return null;
}

/** Jumlah di kartu dimasukkan ke draf bila sudah diubah pengguna; selain itu draf apa adanya. */
export function withTouched(
  draft: OpnameDraft,
  current: Current | null,
  now: number,
): OpnameDraft {
  if (!current?.touched) return draft;
  return setCount(draft, current, now);
}

export function setCount(
  draft: OpnameDraft,
  current: Current,
  now: number,
): OpnameDraft {
  return {
    ...draft,
    updatedAt: now,
    counts: {
      ...draft.counts,
      [current.productId]: {
        qtyBase: current.qtyBase,
        countedAt: current.openedAt,
      },
    },
  };
}
