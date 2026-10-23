import type { ProductUnit } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { type MockSale, type MockState, mockDb } from "../db";
import { KIND, makeId } from "../seed";

export function post(path: string, body: unknown): Promise<Response> {
  return fetch(path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export function userId(name: string): string {
  const user = mockDb.get().users.find((u) => u.name === name);
  if (!user) throw new Error(`seed tanpa ${name}`);
  return user.id;
}

export const login = (pin: string, name = "Rina"): Promise<Response> =>
  post("/api/auth/pin-login", { userId: userId(name), pin });

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
