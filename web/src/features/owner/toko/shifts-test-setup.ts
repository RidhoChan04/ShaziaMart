import { vi } from "vitest";
import { mockDb } from "@/mocks/db";
import {
  get,
  json,
  login,
  loginWithShift,
  ownerLogin,
  post,
  saleItem,
} from "@/mocks/handlers/test-helpers";
import type { OwnerShiftDetail } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { newId } from "@/shared/lib/id";

/** Jam dinding WIB Kamis 19 Nov 2026 → epoch UTC. */
export const wib = (h: number, min = 0): number =>
  Date.UTC(2026, 10, 19, h - 7, min);
export const at = (h: number, min = 0): void => {
  vi.setSystemTime(wib(h, min));
};

export const detail = async (id: string): Promise<OwnerShiftDetail> =>
  json<OwnerShiftDetail>(await get(`/api/owner/shifts/${id}`));

const must = async (res: Promise<Response>, status = 201): Promise<void> => {
  const r = await res;
  if (r.status !== status) throw new Error(`status ${r.status} ≠ ${status}`);
};
export const take = (id: string, amount: number, note: string | null = null) =>
  must(post("/api/owner/cash-takes", { id, amount, note }));
export const expense = (id: string, amount: number, reason: string) =>
  must(post("/api/shifts/current/expenses", { id, amount, reason }));
export const closeShift = (countedCash: number) =>
  must(post("/api/shifts/current/close", { countedCash }), 200);

/**
 * Kamis 19 Nov. Rina 07.00–14.58 (jual tunai + QRIS, kas keluar 15.000 dan 20.000, ambil uang
 * dibatalkan 100.000 dan ambil uang 1.000.000 di dalam shift, tutup 400.000); pemilik ambil
 * 50.000 di sela 14.59 (terpakai modal Budi); Budi 15.00 masih buka (kas keluar 15.000, ambil
 * 500.000). Sekarang 20.15. Mengembalikan id kedua shift.
 */
export async function seedDay(): Promise<{ rina: string; budi: string }> {
  at(7);
  await loginWithShift(200_000);
  await ownerLogin();
  const rina = mockDb.get().shift?.id ?? "";
  at(8, 30);
  await must(
    post("/api/sales", {
      saleId: newId(),
      items: [saleItem("Gula Pasir", { amount: 50_000 }, 18000)],
      payments: [
        { method: "cash", amount: 30_000 },
        { method: "qris", amount: 20_000 },
      ],
      cashReceived: 30_000,
      print: false,
    }),
  );
  at(9, 20);
  await expense("kk-r1", 15_000, "Beli es batu");
  at(11, 40);
  await expense("kk-r2", 20_000, "Bayar iuran sampah");
  at(12, 25);
  await take("tk-r0", 100_000, "Salah nominal");
  at(12, 28);
  await must(
    post("/api/owner/cash-takes/tk-r0/cancel", { reason: "Salah nominal" }),
    200,
  );
  at(12, 30);
  await take("tk-r1", 1_000_000, "Setor ke bank");
  at(14, 58);
  await closeShift(400_000);
  at(14, 59);
  await take("tk-sela", 50_000, "Setoran harian");
  at(15);
  await login("654321", "Budi");
  const suggestion = await json<{ suggestedCash: number }>(
    await get("/api/shifts/opening-suggestion"),
  );
  await must(post("/api/shifts", { openingCash: suggestion.suggestedCash }));
  const budi = mockDb.get().shift?.id ?? "";
  at(18, 40);
  await expense("kk-b1", 15_000, "Beli es batu");
  at(19, 30);
  await take("tk-b1", 500_000, "Untuk belanja grosir");
  at(20, 15);
  return { rina, budi };
}
