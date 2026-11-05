import { vi } from "vitest";
import { mockDb } from "@/mocks/db";
import {
  BIMOLI,
  loginWithShift,
  post,
  receiptInput,
  staffLogin,
} from "@/mocks/handlers/test-helpers";
import type { OpnameScope } from "@/shared/api/gen/shaziaMartAPI.schemas";

export const KOPI = "Kopi Kapal Api 165 g";
export const BERAS5 = "Beras Pandan Wangi 5 kg";
export const INDOMIE = "Indomie Goreng";
export { BIMOLI };

const MI_INSTAN: OpnameScope = { kind: "kategori", category: "Mi Instan" };

/** 5 Nov 2026, jam WIB `HH.MM` -> epoch ms UTC. */
export const T = (hm: string): number => {
  const [h = 0, m = 0] = hm.split(".").map(Number);
  return Date.UTC(2026, 10, 5, h - 7, m);
};
const at = (hm: string) => vi.setSystemTime(T(hm));

export const idOf = (name: string): string => {
  const p = mockDb.get().products.find((x) => x.name === name);
  if (!p) throw new Error(`seed tanpa ${name}`);
  return p.id;
};

export function setStock(name: string, qty: number): void {
  const id = idOf(name);
  mockDb.update((s) => {
    s.stock[id] = qty;
  });
}

export function setCost(
  name: string,
  cost: { amount: number; qtyBase: number } | null,
): void {
  mockDb.update((s) => {
    const p = s.products.find((x) => x.name === name);
    if (p) p.cost = cost;
  });
}

async function ok(res: Response, what: string): Promise<void> {
  if (res.status >= 300) throw new Error(`${what} gagal: ${res.status}`);
}

export const countOf = (name: string, qtyBase: number, hm = "10.00") => ({
  productId: idOf(name),
  qtyBase,
  countedAt: T(hm),
});

/** Kirim hitungan sebagai staf (Rina); pemanggil sudah login staf dan memalsukan `Date`. */
export async function submitCount(
  id: string,
  scope: OpnameScope,
  items: ReturnType<typeof countOf>[],
): Promise<void> {
  await ok(
    await post("/api/staff/opname-sessions", {
      id,
      scope,
      deviceNow: Date.now(),
      items,
    }),
    "kirim hitungan",
  );
}

/**
 * Sesi opname "A" (Rina; dihitung 5 Nov 2026 10.00, alasan disimpan 10.05):
 * Indomie -40 (Rp104.000, ditahan, salah input nota CV Sumber Rejeki 3 Nov), Kopi -40 (Rp120.000, ditahan),
 * Bimoli +1 (Rp36.000, disesuaikan), Beras cocok. Total selisih Rp260.000 -> ditandai.
 * Pemanggil memasang `vi.useFakeTimers({ toFake: ["Date"] })` lebih dulu; jam berakhir 10.05.
 */
export async function seedOpname(): Promise<void> {
  at("09.00");
  await loginWithShift(1_500_000);
  await staffLogin();
  await ok(
    await post(
      "/api/staff/receipts",
      receiptInput({ id: "nota-3nov", notaDate: "2026-11-03" }),
    ),
    "nota",
  );
  setStock(INDOMIE, 60);
  setStock(KOPI, 50);
  setStock(BIMOLI, 10);
  setStock(BERAS5, 10);
  setCost(INDOMIE, { amount: 104_000, qtyBase: 40 });
  setCost(KOPI, { amount: 3000, qtyBase: 1 });
  setCost(BIMOLI, { amount: 36_000, qtyBase: 1 });
  at("10.00");
  await submitCount("A", MI_INSTAN, [
    countOf(INDOMIE, 20),
    countOf(KOPI, 10),
    countOf(BIMOLI, 11),
    countOf(BERAS5, 10),
  ]);
  at("10.05");
  await ok(
    await post("/api/staff/opname-sessions/A/finish", {
      reasons: [
        {
          productId: idOf(INDOMIE),
          reason: "salah_input",
          receiptId: "nota-3nov",
        },
        { productId: idOf(KOPI), reason: "rusak", receiptId: null },
        { productId: idOf(BIMOLI), reason: "hilang", receiptId: null },
      ],
    }),
    "simpan alasan",
  );
}
