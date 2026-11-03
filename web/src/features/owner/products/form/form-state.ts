import type {
  FieldError,
  OwnerProduct,
  ProductField,
  ProductInput,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatRupiah, parseRupiah } from "@/shared/lib/money";
import {
  activeBigUnit,
  hppFromDraft,
  markup,
  type ProductDraft,
  type RuleProblem,
  sellUnitKind,
  unitCost,
} from "@/shared/lib/product-rules";
import { roundHalfUp } from "@/shared/lib/quantity";

/** Teks mentah tiap isian form, urutan sama dengan template Excel. */
export type FormValues = Record<ProductField, string>;

export function emptyFormValues(): FormValues {
  return {
    name: "",
    category: "",
    sellUnit: "",
    barcode: "",
    cost: "",
    price: "",
    tierMinQty: "",
    tierPrice: "",
    bigName: "",
    bigSize: "",
    bigBarcode: "",
    bigCost: "",
    bigPrice: "",
    minStock: "",
  };
}

const rupiahText = (n: number | null): string =>
  n === null ? "" : formatRupiah(n);

/** 2500 / 1000 -> "2,5"; bilangan bulat tanpa pemisah. */
const quantityText = (n: number): string => String(n).replace(".", ",");

/**
 * Barang -> isian form. Satuan besar = satuan aktif pertama setelah eceran; HPP yang
 * dicatat per isi satuan besar ditaruh di `bigCost`, selain itu modal eceran di `cost`.
 */
export function formValuesFromProduct(p: OwnerProduct): FormValues {
  const eceran = p.units[0];
  const big = activeBigUnit(p);
  if (!eceran) return emptyFormValues();
  const tier = eceran.wholesaleTiers[0];
  const costOnBig = big !== null && p.cost?.qtyBase === big.unitSize;
  return {
    name: p.name,
    category: p.category ?? "",
    sellUnit: eceran.name,
    barcode: eceran.barcodes[0] ?? "",
    cost: costOnBig ? "" : rupiahText(unitCost(p.cost, eceran.unitSize)),
    price: rupiahText(eceran.price),
    tierMinQty: tier ? String(tier.minQty) : "",
    tierPrice: rupiahText(tier?.price ?? null),
    bigName: big?.name ?? "",
    bigSize: big ? String(big.unitSize / eceran.unitSize) : "",
    bigBarcode: big?.barcodes[0] ?? "",
    bigCost: costOnBig ? rupiahText(p.cost?.amount ?? null) : "",
    bigPrice: rupiahText(big?.price ?? null),
    minStock:
      p.minStock === null ? "" : quantityText(p.minStock / eceran.unitSize),
  };
}

const MONEY_LABEL = {
  cost: "Harga modal",
  price: "Harga jual",
  tierPrice: "Harga grosir",
  bigCost: "Harga modal satuan besar",
  bigPrice: "Harga jual satuan besar",
} as const;

const COUNT_MESSAGE = {
  tierMinQty: "Grosir: beli minimal 2 ke atas",
  bigSize: "Satuan besar: isi berapa? (min. 2)",
} as const;

const MIN_STOCK_MESSAGE = "Batas stok menipis: isi angka, mis. 20";

/**
 * Isian -> draft yang sama bentuknya dengan baris impor. `problems` hanya berisi
 * angka yang tidak terbaca (nilainya jadi null); aturan bisnis ada di `validateDraft`.
 */
export function draftFromForm(v: FormValues): {
  draft: ProductDraft;
  problems: RuleProblem[];
} {
  const problems: RuleProblem[] = [];
  const text = (s: string): string | null =>
    s.trim() === "" ? null : s.trim();
  const parsed = <T>(
    field: ProductField,
    raw: string,
    parse: (s: string) => T | null,
    message: string,
  ): T | null => {
    if (raw.trim() === "") return null;
    const n = parse(raw);
    if (n === null) problems.push({ field, message });
    return n;
  };
  const money = (field: keyof typeof MONEY_LABEL) =>
    parsed(
      field,
      v[field],
      parseRupiah,
      `${MONEY_LABEL[field]}: ketik angka saja, mis. 3500`,
    );
  const count = (field: keyof typeof COUNT_MESSAGE) =>
    parsed(
      field,
      v[field],
      (s) => (/^\d+$/.test(s.trim()) ? Number(s.trim()) : null),
      COUNT_MESSAGE[field],
    );
  const minStock = parsed(
    "minStock",
    v.minStock,
    (s) => {
      const m = /^(\d+)(?:[.,](\d+))?$/.exec(s.trim());
      return m ? Number(`${m[1]}.${m[2] ?? "0"}`) : null;
    },
    MIN_STOCK_MESSAGE,
  );

  // Urutan field mengikuti form agar pesan pertama per field = yang tertua.
  const draft: ProductDraft = {
    name: text(v.name),
    category: text(v.category),
    sellUnit: text(v.sellUnit),
    barcode: text(v.barcode),
    cost: money("cost"),
    price: money("price"),
    tierMinQty: count("tierMinQty"),
    tierPrice: money("tierPrice"),
    bigName: text(v.bigName),
    bigSize: count("bigSize"),
    bigBarcode: text(v.bigBarcode),
    bigCost: money("bigCost"),
    bigPrice: money("bigPrice"),
    minStock,
  };
  return { draft, problems };
}

/** Draft yang sudah lolos `validateDraft` -> badan request. Satuan besar ada bila ada isiannya. */
export function inputFromDraft(
  d: ProductDraft,
  bigUnitId: string | null,
): ProductInput {
  const hasBig =
    d.bigName !== null && d.bigSize !== null && d.bigPrice !== null;
  const hasTier = d.tierMinQty !== null && d.tierPrice !== null;
  return {
    name: d.name ?? "",
    category: d.category,
    sellUnit: d.sellUnit ?? "",
    barcode: d.barcode,
    // Modal satuan besar menang; modal eceran lama tidak dikirim.
    cost: hasBig && d.bigCost !== null ? null : d.cost,
    price: d.price ?? 0,
    tier: hasTier
      ? { minQty: d.tierMinQty ?? 0, price: d.tierPrice ?? 0 }
      : null,
    bigUnit: hasBig
      ? {
          unitId: bigUnitId,
          name: d.bigName ?? "",
          size: d.bigSize ?? 0,
          barcode: d.bigBarcode,
          cost: d.bigCost,
          price: d.bigPrice ?? 0,
        }
      : null,
    minStock: d.minStock,
  };
}

/** Pesan pertama per field. */
export function firstErrorByField(
  problems: readonly (RuleProblem | FieldError)[],
): Partial<Record<ProductField, string>> {
  const out: Partial<Record<ProductField, string>> = {};
  for (const { field, message } of problems) {
    if (out[field] === undefined) out[field] = message;
  }
  return out;
}

export type Hints = {
  /** Modal eceran dihitung dari modal satuan besar (bukan diketik). */
  computedCostFrom: { bigName: string; cost: number } | null;
  eceran: string | null;
  grosir: string | null;
  besar: string | null;
};

function profitText(
  price: number | null,
  cost: number | null,
  per: string,
): string | null {
  if (price === null || price < 1 || cost === null) return null;
  const m = markup(price, cost);
  if (m === null) return null;
  const pct = m.percent === null ? "" : ` (${Math.abs(m.percent)}% dari modal)`;
  return `${m.profit < 0 ? "Rugi" : "Untung"} ${formatRupiah(Math.abs(m.profit))}${pct} per ${per}`;
}

/** Petunjuk untung dari draft apa adanya; angka di luar batas aman atau satuan belum diisi -> tanpa petunjuk. */
export function hintsFromDraft(d: ProductDraft): Hints {
  const none: Hints = {
    computedCostFrom: null,
    eceran: null,
    grosir: null,
    besar: null,
  };
  const kind = sellUnitKind(d.sellUnit ?? "");
  if (kind === null || d.sellUnit === null) return none;
  try {
    const unit = d.sellUnit;
    const hpp = hppFromDraft(d);
    const m = unitCost(hpp, kind.unitSize);
    const bigSize =
      d.bigSize !== null && Number.isSafeInteger(d.bigSize) && d.bigSize >= 2
        ? d.bigSize
        : null;
    const bigM =
      bigSize === null ? null : unitCost(hpp, bigSize * kind.unitSize);
    const bigProfit = profitText(d.bigPrice, bigM, d.bigName ?? "satuan besar");
    const perUnit =
      bigProfit !== null && bigSize !== null && d.bigPrice !== null
        ? ` · setara ${formatRupiah(roundHalfUp(d.bigPrice, bigSize))} per ${unit}`
        : "";
    return {
      computedCostFrom:
        d.bigCost !== null && bigSize !== null && m !== null
          ? { bigName: d.bigName ?? "satuan besar", cost: m }
          : null,
      eceran: profitText(d.price, m, unit),
      grosir: profitText(d.tierPrice, m, unit),
      besar: bigProfit === null ? null : bigProfit + perUnit,
    };
  } catch {
    return none;
  }
}

/** Kosongkan bagian satuan besar; modal yang tadinya terhitung darinya menjadi modal eceran. */
export function clearBigValues(
  v: FormValues,
  computedCost: number | null,
): FormValues {
  return {
    ...v,
    bigName: "",
    bigSize: "",
    bigBarcode: "",
    bigCost: "",
    bigPrice: "",
    cost: computedCost === null ? v.cost : formatRupiah(computedCost),
  };
}
