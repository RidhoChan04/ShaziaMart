import type {
  CreditLimitProblem,
  Customer,
  PaymentInput,
  PaymentInputMethod,
  PriceChange,
  Product,
  SaleItem,
  WholesaleTier,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { cartTotal, priceLine } from "@/shared/lib/pricing";
import { unitCost } from "@/shared/lib/product-rules";
import { cleanReason } from "@/shared/lib/reason-rules";
import type { MockProduct } from "./db";

/** Penolakan 422; handler mengubahnya menjadi problem+json. */
export type Rejection = {
  code: "VALIDATION" | "INVALID_QUANTITY";
  detail: string;
};

export type PricedItem = {
  productId: string;
  expectedUnitPrice: number;
  /** Harga normal & tier grosir satuan saat ini, dikirim balik bila harga berubah. */
  normalPrice: number;
  wholesaleTiers: WholesaleTier[];
  item: SaleItem;
};

export type CheckedPayments = {
  payments: PaymentInput[];
  cash: number;
  credit: number;
  cashReceived: number;
  change: number;
  customer: Customer | null;
};

const METHODS: readonly PaymentInputMethod[] = ["cash", "qris", "credit"];

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

const isPositiveInt = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v > 0;

const isMoney = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

const quantity = (detail: string): Rejection => ({
  code: "INVALID_QUANTITY",
  detail,
});
const validation = (detail: string): Rejection => ({
  code: "VALIDATION",
  detail,
});

export const isRejection = (x: unknown): x is Rejection =>
  isObj(x) && typeof x.code === "string" && typeof x.detail === "string";

function findUnit(products: readonly Product[], unitId: unknown) {
  for (const product of products) {
    const unit = product.units.find((u) => u.id === unitId);
    if (unit) return { product, unit };
  }
  return null;
}

function priceItem(
  products: readonly Product[],
  raw: unknown,
): PricedItem | Rejection {
  if (!isObj(raw)) return quantity("Barang tidak valid");
  const found = findUnit(products, raw.unitId);
  if (!found) return quantity("Barang tidak ditemukan");
  const { product, unit } = found;
  if (!isMoney(raw.expectedUnitPrice)) return validation("Harga tidak valid");
  const hasQty = raw.qtyBase !== undefined;
  if (hasQty === (raw.amount !== undefined)) {
    return quantity("Isi tepat salah satu dari jumlah atau nominal");
  }
  const value = hasQty ? raw.qtyBase : raw.amount;
  if (!isPositiveInt(value)) {
    return quantity("Jumlah harus bilangan bulat positif");
  }
  if (!hasQty && !product.isCurah) {
    return quantity("Nominal hanya untuk barang curah");
  }
  let line: ReturnType<typeof priceLine>;
  try {
    line = priceLine(unit, hasQty ? { qtyBase: value } : { amount: value });
  } catch {
    return quantity("Jumlah di luar batas");
  }
  if (line.qtyBase <= 0) return quantity("Nominal terlalu kecil");
  return {
    productId: product.id,
    expectedUnitPrice: raw.expectedUnitPrice,
    normalPrice: unit.price,
    wholesaleTiers: unit.wholesaleTiers,
    item: {
      unitId: unit.id,
      productName: product.name,
      unitName: unit.name,
      isCurah: product.isCurah,
      baseUnit: product.baseUnit,
      unitSize: unit.unitSize,
      qtyBase: line.qtyBase,
      unitPrice: line.unitPrice,
      subtotal: line.subtotal,
      wholesale: line.wholesale,
    },
  };
}

/** Aturan 3: validasi & harga server tiap item (lewat `priceLine`). */
export function priceItems(
  products: readonly Product[],
  raw: unknown,
): PricedItem[] | Rejection {
  if (!Array.isArray(raw) || raw.length === 0) {
    return validation("Barang wajib diisi");
  }
  const priced: PricedItem[] = [];
  for (const entry of raw) {
    const result = priceItem(products, entry);
    if (isRejection(result)) return result;
    priced.push(result);
  }
  return priced;
}

/** Aturan 5: harga klien vs harga efektif server; satu entri per unitId (yang pertama). */
export function priceChanges(items: readonly PricedItem[]): PriceChange[] {
  const changes: PriceChange[] = [];
  for (const p of items) {
    const { unitId, unitPrice } = p.item;
    if (p.expectedUnitPrice === unitPrice) continue;
    if (changes.some((c) => c.unitId === unitId)) continue;
    changes.push({
      unitId,
      oldUnitPrice: p.expectedUnitPrice,
      newUnitPrice: unitPrice,
      newNormalPrice: p.normalPrice,
      newWholesaleTiers: p.wholesaleTiers,
    });
  }
  return changes;
}

function safeSum(values: readonly number[]): number | null {
  try {
    return cartTotal(values);
  } catch {
    return null;
  }
}

/** Total penjualan, atau null bila di luar rentang aman. */
export const saleTotal = (items: readonly PricedItem[]): number | null =>
  safeSum(items.map((p) => p.item.subtotal));

/**
 * (K10) HPP per baris, sejajar `items`: round_half_up(HPP.amount × qtyBase ÷ HPP.qtyBase); HPP
 * kosong atau satuan tak dikenal → null. Disalin ke penjualan saat jual (`MockSale.lineCosts`).
 */
export const saleLineCosts = (
  products: readonly MockProduct[],
  items: readonly SaleItem[],
): (number | null)[] =>
  items.map((i) => {
    const product = products.find((p) =>
      p.units.some((u) => u.id === i.unitId),
    );
    return unitCost(product?.cost ?? null, i.qtyBase);
  });

/** Σ HPP per baris dengan null = 0 (`MockSale.costTotal`, angka Beranda). */
export const sumLineCosts = (lineCosts: readonly (number | null)[]): number =>
  lineCosts.reduce<number>((sum, c) => sum + (c ?? 0), 0);

/** HPP penjualan: Σ `saleLineCosts` dengan HPP kosong = 0. */
export const saleCost = (
  products: readonly MockProduct[],
  items: readonly SaleItem[],
): number => sumLineCosts(saleLineCosts(products, items));

function parsePayments(raw: unknown): PaymentInput[] | Rejection {
  if (!Array.isArray(raw) || raw.length === 0) {
    return validation("Pembayaran wajib diisi");
  }
  const payments: PaymentInput[] = [];
  for (const p of raw) {
    if (!isObj(p) || !isPositiveInt(p.amount)) {
      return validation("Pembayaran tidak valid");
    }
    const method = METHODS.find((m) => m === p.method);
    if (!method) return validation("Metode pembayaran tidak dikenal");
    if (payments.some((q) => q.method === method)) {
      return validation("Metode pembayaran ganda");
    }
    payments.push({ method, amount: p.amount });
  }
  return payments;
}

/** Aturan 6: pembayaran harus pas dengan total; tunai butuh uang diterima. */
export function checkPayments(
  body: Record<string, unknown>,
  total: number,
  customers: readonly Customer[],
): CheckedPayments | Rejection {
  const payments = parsePayments(body.payments);
  if (isRejection(payments)) return payments;
  if (safeSum(payments.map((p) => p.amount)) !== total) {
    return validation("Jumlah pembayaran harus sama dengan total");
  }
  const amountOf = (m: PaymentInputMethod) =>
    payments.find((p) => p.method === m)?.amount ?? 0;
  const cash = amountOf("cash");
  const credit = amountOf("credit");
  const { customerId } = body;
  if (credit > 0 && customerId === undefined) {
    return validation("Pelanggan wajib dipilih");
  }
  let customer: Customer | null = null;
  if (customerId !== undefined) {
    customer = customers.find((c) => c.id === customerId) ?? null;
    if (!customer) return validation("Pelanggan tidak ditemukan");
  }
  if (cash === 0) {
    return { payments, cash, credit, cashReceived: 0, change: 0, customer };
  }
  const { cashReceived } = body;
  if (!isMoney(cashReceived) || cashReceived < cash) {
    return validation("Uang diterima kurang dari pembayaran tunai");
  }
  return {
    payments,
    cash,
    credit,
    cashReceived,
    change: cashReceived - cash,
    customer,
  };
}

type LimitFields = Pick<
  CreditLimitProblem,
  "balance" | "creditLimit" | "attempted" | "excess"
>;

/**
 * Aturan 7: limit hanya berlaku untuk bagian kasbon; null bila tidak melewati limit.
 * `excess = min(attempted, balance + attempted − creditLimit)`: satu rumus untuk 409 dan catatan.
 */
export function creditExcess({
  customer,
  credit,
}: CheckedPayments): LimitFields | null {
  if (!customer || credit === 0) return null;
  const { balance, creditLimit } = customer;
  const over = balance + credit - creditLimit;
  return over > 0
    ? {
        balance,
        creditLimit,
        attempted: credit,
        excess: Math.min(credit, over),
      }
    : null;
}

/**
 * Aturan 7 (ruling R3, K28): limit = batas peringatan. Melewati limit tanpa alasan (atau kosong
 * setelah trim) → `limit` (409 CREDIT_LIMIT); dengan alasan → `creditOverLimit` dengan
 * `excess = min(attempted, balance + attempted − creditLimit)` (bagian kasbon ini di atas limit,
 * agar kasbon berturut-turut tidak menghitung dobel). Tidak melewati limit → alasan diabaikan.
 */
export function creditGate(
  paid: CheckedPayments,
  rawReason: unknown,
):
  | { limit: LimitFields }
  | { creditOverLimit: { excess: number; reason: string } | null }
  | Rejection {
  // Kontrak: maxLength 200 berlaku tanpa syarat, juga bila tidak melewati limit.
  const blank = typeof rawReason !== "string" || rawReason.trim() === "";
  const reason = cleanReason(rawReason);
  if (!blank && reason === null) {
    return validation("Alasan maksimal 200 karakter");
  }
  const over = creditExcess(paid);
  if (!over) return { creditOverLimit: null };
  if (reason === null) return { limit: over };
  return { creditOverLimit: { excess: over.excess, reason } };
}
