import type {
  ProductUnit,
  ReceiptInput,
  ReceiptLineInput,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { newId } from "@/shared/lib/id";
import { type MockSale, type MockState, mockDb } from "../db";
import { KIND, makeId } from "../seed";

export function post(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

export function put(
  path: string,
  body: unknown,
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetch(path, {
    method: "PUT",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
}

export function get(
  path: string,
  headers: Record<string, string> = {},
): Promise<Response> {
  return fetch(path, { headers });
}

export function userId(name: string): string {
  const user = mockDb.get().users.find((u) => u.name === name);
  if (!user) throw new Error(`seed tanpa ${name}`);
  return user.id;
}

export const login = (pin: string, name = "Rina"): Promise<Response> =>
  post("/api/auth/pin-login", { userId: userId(name), pin });

/** Login orang toko (realm `/api/staff`, terpisah dari sesi kasir & pemilik). */
export const staffLogin = (name = "Rina", pin = "123456"): Promise<Response> =>
  post("/api/staff/login", { userId: userId(name), pin });

/** Key yang tidak boleh ada di respons `/api/staff` di kedalaman mana pun. */
export const FORBIDDEN_STAFF_KEYS: readonly string[] = [
  "cost",
  "costAlert",
  "fromCost",
  "oldCost",
  "newCost",
  "price",
  "stock",
  "grossProfit",
  "openingCash",
  "value",
  "totalValue",
  "lossValue",
  "gainValue",
];

/** Semua key objek di nilai JSON, rekursif (termasuk di dalam array). */
export function deepKeys(value: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(value)) {
    for (const v of value) deepKeys(v, out);
  } else if (value !== null && typeof value === "object") {
    for (const [key, v] of Object.entries(value)) {
      out.add(key);
      deepKeys(v, out);
    }
  }
  return out;
}

/** Login pemilik (realm `/api/owner`, terpisah dari sesi kasir). */
export const ownerLogin = (
  name = "Pak Ahmad",
  password = "pemilik123",
): Promise<Response> => post("/api/owner/login", { name, password });

/** Login sebagai Rina lalu buka shift dengan modal awal. */
export async function loginWithShift(openingCash = 200_000): Promise<void> {
  if ((await login("123456")).status !== 200) throw new Error("login gagal");
  const res = await post("/api/shifts", { openingCash });
  if (res.status !== 201) throw new Error("buka shift gagal");
}

/** Satuan jual dari seed; tanpa `unitName` diambil satuan pertama. */
export function unitOf(productName: string, unitName?: string): ProductUnit {
  const product = mockDb.get().products.find((p) => p.name === productName);
  const unit = product?.units.find((u) => !unitName || u.name === unitName);
  if (!unit) throw new Error(`seed tanpa ${productName} ${unitName ?? ""}`);
  return unit;
}

export function customerId(name: string): string {
  const customer = mockDb.get().customers.find((c) => c.name === name);
  if (!customer) throw new Error(`seed tanpa ${name}`);
  return customer.id;
}

export const customerBalance = (name: string) =>
  mockDb.get().customers.find((c) => c.name === name)?.balance;

export const json = async <T>(res: Response) => (await res.json()) as T;

type Qty = { qtyBase: number } | { amount: number };

/** Baris penjualan dengan harga satuan yang diharapkan klien. */
export const saleItem = (
  name: string,
  qty: Qty,
  expectedUnitPrice: number,
  unitName?: string,
) => ({ unitId: unitOf(name, unitName).id, expectedUnitPrice, ...qty });

export const BIMOLI = "Minyak Goreng Bimoli 2 L";

/** Bimoli ×n dibayar tunai pas. */
export const cashSale = (n = 1, extra: Record<string, unknown> = {}) => ({
  saleId: newId(),
  items: [saleItem(BIMOLI, { qtyBase: n }, 36000)],
  payments: [{ method: "cash", amount: 36000 * n }],
  cashReceived: 36000 * n,
  print: false,
  ...extra,
});

export const voidSale = (id: string, body: unknown) =>
  post(`/api/sales/${id}/void`, body);

const HISTORY_SALE = makeId(KIND.sale, 0).slice(0, 8);
const HISTORY_SHIFT = makeId(KIND.shift, 0).slice(0, 8);

/** Penjualan yang dibuat test ini; riwayat 14 hari seed tidak ikut. */
export function placedSales(
  state: Readonly<MockState> = mockDb.get(),
): MockSale[] {
  return state.sales.filter((s) => !s.id.startsWith(HISTORY_SALE));
}

/** Shift yang ditutup test ini; shift riwayat seed tidak ikut. */
export function placedShifts(state: Readonly<MockState> = mockDb.get()) {
  return state.closedShifts.filter((c) => !c.shiftId.startsWith(HISTORY_SHIFT));
}

/** Baris nota untuk barang seed `name` dengan satuan `unitName`. */
function receiptLine(
  lineId: string,
  name: string,
  unitName: string,
  qty: number,
  unitCost: number,
  expiryDate: string | null = null,
): ReceiptLineInput {
  const unit = unitOf(name, unitName);
  return {
    lineId,
    productId: unit.productId,
    unitId: unit.id,
    newProduct: null,
    qty,
    unitCost,
    expiryDate,
  };
}

/**
 * Nota mockup `draf-1`: CV Sumber Rejeki, 2026-11-02, Indomie 2 dus × 112.000 ED 2027-04-20 (l1),
 * Bimoli 12 pcs × 34.000 (l2), Gula 50 kg × 16.200 (l3); bayar sekarang, tunai, dari laci.
 */
export function receiptInput(patch: Partial<ReceiptInput> = {}): ReceiptInput {
  return {
    id: "draf-1",
    supplierName: "CV Sumber Rejeki",
    notaDate: "2026-11-02",
    photoId: null,
    lines: [
      receiptLine("l1", "Indomie Goreng", "dus", 2, 112_000, "2027-04-20"),
      receiptLine("l2", BIMOLI, "pcs", 12, 34_000),
      receiptLine("l3", "Gula Pasir", "kg", 50, 16_200),
    ],
    payment: {
      timing: "sekarang",
      method: "tunai",
      cashSource: "laci",
      dueDate: null,
    },
    ...patch,
  };
}

/** Byte JPEG palsu sepanjang `size` (diawali penanda SOI FF D8 FF). */
export const jpegBytes = (size: number): Uint8Array => {
  const bytes = new Uint8Array(size).map((_, i) => i % 251);
  bytes.set([0xff, 0xd8, 0xff].slice(0, size));
  return bytes;
};
