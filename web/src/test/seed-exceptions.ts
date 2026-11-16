/** Pembantu khusus tes (data pengecualian kasir untuk tes halaman Pemilik); jangan diimpor dari kode produksi. */
import {
  cashSale,
  customerId,
  json,
  loginWithShift,
  post,
  saleItem,
  voidSale,
} from "@/mocks/handlers/test-helpers";
import type { Sale } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { newId } from "@/shared/lib/id";

/** Kamis 5 Nov 2026 14.00 WIB. */
export const EXC_NOW = Date.UTC(2026, 10, 5, 7);

type Pay = { method: "cash" | "qris" | "credit"; amount: number };

/** Gula curah per nominal = total persis; pembayaran bebas (tunai butuh `cashReceived`). */
export const gulaBody = (
  payments: Pay[],
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({
  saleId: newId(),
  items: [
    saleItem(
      "Gula Pasir",
      { amount: payments.reduce((sum, p) => sum + p.amount, 0) },
      18000,
    ),
  ],
  payments,
  print: false,
  ...extra,
});

/** Tunai 30.000 (diterima 50.000) + QRIS 20.000 (+ kasbon 10.000 untuk pelanggan bila ada). */
export const mixedBody = (customer: string | null = "Bu Sari") =>
  gulaBody(
    [
      { method: "cash", amount: 30_000 },
      { method: "qris", amount: 20_000 },
      ...(customer ? [{ method: "credit" as const, amount: 10_000 }] : []),
    ],
    {
      cashReceived: 50_000,
      ...(customer ? { customerId: customerId(customer) } : {}),
    },
  );

export async function sell(
  body: Record<string, unknown> = cashSale(),
): Promise<Sale> {
  const res = await post("/api/sales", body);
  if (res.status !== 201) throw new Error(`jual gagal ${res.status}`);
  return json<Sale>(res);
}

/** Tutup shift Rina lalu buka shift berikutnya (penjualan lama jadi "shift sebelumnya"). */
export async function nextShift(): Promise<void> {
  await post("/api/shifts/current/close", { countedCash: 0 });
  await loginWithShift();
}

export async function kasirVoid(
  sale: Sale,
  reason: string,
  qrisRefundSource?: "laci" | "pemilik",
): Promise<void> {
  const res = await voidSale(sale.id, {
    reason,
    ...(qrisRefundSource ? { qrisRefundSource } : {}),
  });
  if (res.status !== 200) throw new Error(`batal gagal ${res.status}`);
}
