import {
  loginWithShift,
  post,
  put,
  receiptInput,
  staffLogin,
} from "@/mocks/handlers/test-helpers";

/** Hari ini di tes barang masuk: 2 Nov 2026 10.00 WIB. Pemanggil memalsukan `Date` ke nilai ini lebih dulu. */
export const RECEIPT_NOW = Date.UTC(2026, 10, 2, 3);

export const TEH_NAME = "Teh Pucuk Harum 350 ml";

/** Nota mockup (`draf-1`, CV Sumber Rejeki, Rp1.442.000, tunai dari laci) dicatat Rina lewat HP; shift kasir dibuka lebih dulu. */
export async function seedReceipt(): Promise<void> {
  await loginWithShift(1_500_000);
  if ((await staffLogin()).status !== 200) throw new Error("login staf gagal");
  const res = await post("/api/staff/receipts", receiptInput());
  if (res.status !== 201) throw new Error("nota gagal");
}

/** Rina mengubah Gula Pasir 50 kg → 48 kg pada `draf-1`; sisanya tetap. */
export async function editReceipt(): Promise<void> {
  const lines = receiptInput().lines.map((l) => ({
    lineId: l.lineId,
    qty: l.lineId === "l3" ? 48 : l.qty,
    unitCost: l.unitCost,
    expiryDate: l.expiryDate,
  }));
  const res = await put("/api/staff/receipts/draf-1", {
    supplierName: "CV Sumber Rejeki",
    notaDate: "2026-11-02",
    lines,
    payment: receiptInput().payment,
  });
  if (res.status !== 200) throw new Error("ubah nota gagal");
}

/** Nota barang baru: Teh Pucuk botol (dus isi 24, 2 dus × Rp80.000), transfer; barangnya menunggu harga jual. */
export async function receiveTeh(): Promise<void> {
  await staffLogin();
  const res = await post(
    "/api/staff/receipts",
    receiptInput({
      id: "nota-teh",
      payment: {
        timing: "sekarang",
        method: "transfer",
        cashSource: null,
        dueDate: null,
      },
      lines: [
        {
          lineId: "l1",
          productId: null,
          unitId: null,
          newProduct: {
            name: TEH_NAME,
            sellUnit: "botol",
            notaUnit: "dus",
            notaUnitSize: 24,
            barcode: "8996001600269",
          },
          qty: 2,
          unitCost: 80_000,
          expiryDate: null,
        },
      ],
    }),
  );
  if (res.status !== 201) throw new Error("nota teh gagal");
}
