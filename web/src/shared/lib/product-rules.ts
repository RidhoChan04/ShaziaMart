import type {
  OwnerProductUnit,
  ProductCost,
  ProductField,
} from "../api/gen/shaziaMartAPI.schemas";
import { formatRupiah } from "./money";
import { roundHalfUp } from "./quantity";

/** Isian form barang; sama bentuknya dengan baris impor. Kosong = null. */
export type ProductDraft = {
  name: string | null;
  category: string | null;
  sellUnit: string | null;
  barcode: string | null;
  cost: number | null;
  price: number | null;
  tierMinQty: number | null;
  tierPrice: number | null;
  bigName: string | null;
  bigSize: number | null; // dalam satuan eceran
  bigBarcode: string | null;
  bigCost: number | null;
  bigPrice: number | null;
  minStock: number | null; // dalam satuan eceran
};

export type RuleProblem = { field: ProductField; message: string };

export type SellUnitKind = {
  baseUnit: "pcs" | "gram" | "ml";
  isCurah: boolean;
  unitSize: number;
};

/** `Dijual per` (tanpa beda huruf & spasi ujung); kosong -> null. */
export function sellUnitKind(sellUnit: string): SellUnitKind | null {
  const s = sellUnit.trim().toLowerCase();
  if (s === "") return null;
  if (s === "kg") return { baseUnit: "gram", isCurah: true, unitSize: 1000 };
  if (s === "ons") return { baseUnit: "gram", isCurah: true, unitSize: 100 };
  if (s === "liter" || s === "l") {
    return { baseUnit: "ml", isCurah: true, unitSize: 1000 };
  }
  return { baseUnit: "pcs", isCurah: false, unitSize: 1 };
}

/** EAN-13 / UPC-A / EAN-8 / GTIN-14 dengan check digit GS1 mod-10 benar. */
export function isValidBarcode(code: string): boolean {
  if (!/^\d+$/.test(code)) return false;
  if (![8, 12, 13, 14].includes(code.length)) return false;
  let sum = 0;
  for (let i = code.length - 2, w = 3; i >= 0; i--, w = w === 3 ? 1 : 3) {
    sum += Number(code[i]) * w;
  }
  return (10 - (sum % 10)) % 10 === Number(code[code.length - 1]);
}

function ecerSize(d: ProductDraft): number {
  return sellUnitKind(d.sellUnit ?? "")?.unitSize ?? 1;
}

function isBigSize(n: number | null): n is number {
  return n !== null && Number.isSafeInteger(n) && n >= 2;
}

/**
 * HPP per satuan dasar. Modal satuan besar terisi menang
 * (`{modal besar, isi x ukuran eceran}`); selain itu modal eceran; kosong -> null.
 */
export function hppFromDraft(d: ProductDraft): ProductCost | null {
  const size = ecerSize(d);
  if (d.bigCost !== null && isBigSize(d.bigSize)) {
    return { amount: d.bigCost, qtyBase: d.bigSize * size };
  }
  if (d.cost !== null) return { amount: d.cost, qtyBase: size };
  return null;
}

/** Modal per satuan berukuran `unitSize`, dibulatkan setengah ke atas. */
export function unitCost(
  cost: ProductCost | null,
  unitSize: number,
): number | null {
  if (cost === null) return null;
  return roundHalfUp(cost.amount * unitSize, cost.qtyBase);
}

/** Untung dan persen dari modal (bertanda); modal 0 -> tanpa persen. */
export function markup(
  price: number,
  cost: number | null,
): { profit: number; percent: number | null } | null {
  if (cost === null) return null;
  const profit = price - cost;
  if (cost === 0) return { profit, percent: null };
  const pct = roundHalfUp(Math.abs(profit) * 100, cost);
  return { profit, percent: profit < 0 ? -pct : pct };
}

/** Harga sekarang x modal baru / modal lama, dibulatkan ke atas ke Rp500; tanpa modal yang berarti -> null. */
export function suggestedPrice(
  price: number,
  oldCost: number,
  newCost: number,
): number | null {
  if (oldCost === 0 || newCost <= 0) return null;
  const n = newCost * price;
  const d = oldCost * 500;
  if (!Number.isSafeInteger(n) || !Number.isSafeInteger(d)) {
    throw new RangeError("Hasil di luar batas aman");
  }
  let q = Math.ceil(n / d);
  // koreksi galat floating point: q * d >= n > (q - 1) * d
  if (q * d < n) q += 1;
  else if (q > 0 && (q - 1) * d >= n) q -= 1;
  return q * 500;
}

/** Satuan besar aktif pertama (units[0] = eceran dilewati); tidak ada -> null. */
export function activeBigUnit<
  U extends Pick<OwnerProductUnit, "active">,
>(product: { units: readonly U[] }): U | null {
  return product.units.slice(1).find((u) => u.active) ?? null;
}

const filled = (s: string | null): s is string => s !== null && s.trim() !== "";

type Ctx = {
  d: ProductDraft;
  size: number; // ukuran satuan eceran
  m: number | null; // modal efektif eceran
  price: number | null; // harga jual bila valid
  bigSize: number | null; // isi satuan besar bila valid
  bigM: number | null; // modal efektif satuan besar
};

type Add = (field: ProductField, message: string) => void;

function checkName(d: ProductDraft, add: Add): void {
  const name = d.name?.trim() ?? "";
  if (name === "") {
    add("name", "Nama barang belum diisi");
    return;
  }
  if (/\s{2,}/.test(name)) add("name", "Ada spasi dobel di nama");
  if (name.length > 100) add("name", "Nama terlalu panjang (maks. 100 huruf)");
}

function checkEceran({ d, m, price }: Ctx, add: Add): void {
  if (!filled(d.sellUnit)) add("sellUnit", "'Dijual per' belum diisi");
  if (price === null) add("price", "Harga jual belum diisi");
  else if (m !== null && price < m) {
    add("price", `Harga jual di bawah modal (${formatRupiah(m)})`);
  }
  if (filled(d.barcode) && !isValidBarcode(d.barcode)) {
    add("barcode", "Barcode salah, scan ulang");
  }
  if (filled(d.barcode) && d.barcode === d.bigBarcode) {
    add("bigBarcode", "Barcode satuan besar sudah dipakai");
  }
}

function checkTier({ d, m, price }: Ctx, add: Add): void {
  const { tierMinQty, tierPrice } = d;
  if (tierMinQty === null || tierPrice === null) {
    if (tierMinQty !== tierPrice) {
      add("tierMinQty", "Grosir: isi 'beli minimal' dan harganya");
    }
    return;
  }
  if (tierMinQty < 2) add("tierMinQty", "Grosir: beli minimal 2 ke atas");
  if (price !== null && tierPrice >= price) {
    add("tierPrice", "Harga grosir harus lebih murah");
  }
  if (m !== null && tierPrice < m) {
    add("tierPrice", `Harga grosir di bawah modal (${formatRupiah(m)})`);
  }
}

function checkBig({ d, bigSize, bigM }: Ctx, add: Add): void {
  const bigAny =
    filled(d.bigName) ||
    d.bigSize !== null ||
    filled(d.bigBarcode) ||
    d.bigCost !== null ||
    d.bigPrice !== null;
  if (!bigAny) return;
  if (!filled(d.bigName)) {
    add("bigName", "Satuan besar: nama satuan belum diisi");
  } else if (
    filled(d.sellUnit) &&
    d.bigName.trim().toLowerCase() === d.sellUnit.trim().toLowerCase()
  ) {
    add("bigName", "Satuan besar sama dengan satuan eceran");
  }
  if (bigSize === null) add("bigSize", "Satuan besar: isi berapa? (min. 2)");
  if (d.bigPrice === null || d.bigPrice < 1) {
    add("bigPrice", "Satuan besar: harga jual belum diisi");
  } else if (bigM !== null && d.bigPrice < bigM) {
    add(
      "bigPrice",
      `Satuan besar: harga jual di bawah modal (${formatRupiah(bigM)})`,
    );
  }
  if (filled(d.bigBarcode) && !isValidBarcode(d.bigBarcode)) {
    add("bigBarcode", "Barcode satuan besar salah");
  }
}

function checkMinStock({ d, size }: Ctx, add: Add): void {
  if (d.minStock === null) return;
  const base = d.minStock * size;
  // 1,005 kg x 1000 = 1004.9999999999999: galat biner desimal, bukan pecahan gram.
  const whole =
    Number.isFinite(base) && Math.abs(base - Math.round(base)) < 1e-9;
  if (d.minStock < 0 || !whole) {
    add("minStock", "Batas stok menipis: isi angka, mis. 20");
  }
}

/** Aturan form/impor berurutan; kosong = valid. */
export function validateDraft(d: ProductDraft): RuleProblem[] {
  const out: RuleProblem[] = [];
  const add: Add = (field, message) => out.push({ field, message });

  const size = ecerSize(d);
  const hpp = hppFromDraft(d);
  const bigSize = isBigSize(d.bigSize) ? d.bigSize : null;
  const ctx: Ctx = {
    d,
    size,
    m: unitCost(hpp, size),
    price: d.price !== null && d.price >= 1 ? d.price : null,
    bigSize,
    bigM: bigSize !== null ? unitCost(hpp, bigSize * size) : null,
  };

  checkName(d, add);
  checkEceran(ctx, add);
  checkTier(ctx, add);
  checkBig(ctx, add);
  checkMinStock(ctx, add);
  return out;
}
