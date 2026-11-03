import {
  BIMOLI,
  post,
  receiptInput,
  staffLogin,
  unitOf,
} from "@/mocks/handlers/test-helpers";
import type {
  ReceiptInput,
  ReceiptLineInput,
  ReceiptPayment,
} from "@/shared/api/gen/shaziaMartAPI.schemas";

/** Hari ini di tes utang: 2 Nov 2026 10.00 WIB. */
export const DEBT_NOW = Date.UTC(2026, 10, 2, 3);

export const nanti = (dueDate: string): ReceiptPayment => ({
  timing: "nanti",
  method: null,
  cashSource: null,
  dueDate,
});

function line(
  name: string,
  unitName: string,
  qty: number,
  unitCost: number,
): ReceiptLineInput {
  const unit = unitOf(name, unitName);
  return {
    lineId: "l1",
    productId: unit.productId,
    unitId: unit.id,
    newProduct: null,
    qty,
    unitCost,
    expiryDate: null,
  };
}

async function receive(input: ReceiptInput): Promise<void> {
  const res = await post("/api/staff/receipts", input);
  if (res.status !== 201) throw new Error(`nota ${input.id} gagal`);
}

/**
 * Tiga utang mockup (dicatat Rina lewat HP): Toko Grosir Makmur 20 Okt Rp1.275.000 jatuh tempo 30 Okt (`nota-a`),
 * Toko Grosir Makmur 28 Okt Rp1.370.000 jt 11 Nov (`nota-b`), CV Sumber Rejeki 2 Nov Rp1.442.000 jt 16 Nov (`nota-c`).
 * Pemanggil memalsukan `Date` ke `DEBT_NOW` lebih dulu.
 */
export async function seedDebts(): Promise<void> {
  if ((await staffLogin()).status !== 200) throw new Error("login staf gagal");
  await receive(
    receiptInput({
      id: "nota-a",
      supplierName: "Toko Grosir Makmur",
      notaDate: "2026-10-20",
      lines: [line("Gula Pasir", "kg", 50, 25_500)],
      payment: nanti("2026-10-30"),
    }),
  );
  await receive(
    receiptInput({
      id: "nota-b",
      supplierName: "Toko Grosir Makmur",
      notaDate: "2026-10-28",
      lines: [line(BIMOLI, "pcs", 40, 34_250)],
      payment: nanti("2026-11-11"),
    }),
  );
  await receive(receiptInput({ id: "nota-c", payment: nanti("2026-11-16") }));
}
