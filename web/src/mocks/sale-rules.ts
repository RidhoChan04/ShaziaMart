import type {
  Customer,
  PaymentInput,
  PaymentInputMethod,
  PriceChange,
  Product,
  SaleItem,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { cartTotal, priceLine } from "@/shared/lib/pricing";
import type { MockUser } from "./db";

/** Penolakan 422; handler mengubahnya menjadi problem+json. */
export type Rejection = {
  code: "VALIDATION" | "INVALID_QUANTITY";
  detail: string;
};

export type PricedItem = {
  productId: string;
  expectedUnitPrice: number;
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

/** Aturan 5: harga klien vs harga efektif server. */
export function priceChanges(items: readonly PricedItem[]): PriceChange[] {
  return items
    .filter((p) => p.expectedUnitPrice !== p.item.unitPrice)
    .map((p) => ({
      unitId: p.item.unitId,
      oldUnitPrice: p.expectedUnitPrice,
      newUnitPrice: p.item.unitPrice,
    }));
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

export const isOwnerPin = (users: readonly MockUser[], pin: unknown): boolean =>
  typeof pin === "string" &&
  users.some((u) => u.role === "pemilik" && u.pin === pin);
