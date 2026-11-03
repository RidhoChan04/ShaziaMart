import { expect, test } from "vitest";
import type {
  ReceiptLine,
  StaffProduct,
  StaffReceipt,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formFromReceipt, toReceiptEdit } from "./edit-model";
import { formTotal } from "./form-model";

const line = (patch: Partial<ReceiptLine> = {}): ReceiptLine => ({
  lineId: "l1",
  productId: "p1",
  productName: "Kopi Uji",
  unitId: "u2",
  unitName: "dus",
  unitSize: 40,
  qty: 2,
  unitCost: 112_000,
  subtotal: 224_000,
  expiryDate: "2027-04-20",
  newProduct: false,
  ...patch,
});

const receipt = (patch: Partial<StaffReceipt> = {}): StaffReceipt => ({
  id: "r1",
  supplierName: "CV Sumber Rejeki",
  notaDate: "2026-11-02",
  photoId: null,
  lines: [line(), line({ lineId: "l2", unitCost: 0, subtotal: 0, qty: 1 })],
  payment: {
    timing: "sekarang",
    method: "tunai",
    cashSource: "laci",
    dueDate: null,
  },
  paymentEditable: false,
  total: 224_000,
  status: "aktif",
  createdAt: 0,
  createdByName: "Rina",
  editedAt: null,
  editedByName: null,
  ...patch,
});

test("formFromReceipt: harga memakai pemisah ribuan, ED dan jumlah dibawa, total sama dengan nota", () => {
  const f = formFromReceipt(receipt(), null);
  expect(f.supplierName).toBe("CV Sumber Rejeki");
  expect(f.lines[0]).toMatchObject({
    lineId: "l1",
    unitId: "u2",
    qty: 2,
    unitCostText: "112.000",
    expiryDate: "2027-04-20",
    newProduct: null,
  });
  expect(f.lines[1]?.unitCostText).toBe("0");
  expect(formTotal(f)).toBe(224_000);
});

test("tanpa daftar barang: satuan nota disalin dari baris (nama, isi)", () => {
  const p = formFromReceipt(receipt(), null).lines[0]?.product;
  expect(p).toMatchObject({ id: "p1", name: "Kopi Uji" });
  expect(p?.units).toEqual([
    { id: "u2", name: "dus", unitSize: 40, barcodes: [] },
  ]);
});

test("dengan daftar barang: salinan barang lengkap dipakai", () => {
  const product: StaffProduct = {
    id: "p1",
    name: "Kopi Uji",
    category: "Minuman",
    isCurah: false,
    baseUnit: "pcs",
    status: "aktif",
    units: [
      { id: "u1", name: "pcs", unitSize: 1, barcodes: [] },
      { id: "u2", name: "dus", unitSize: 40, barcodes: [] },
    ],
  };
  const p = formFromReceipt(receipt(), new Map([["p1", product]])).lines[0]
    ?.product;
  expect(p?.units.map((u) => u.name)).toEqual(["pcs", "dus"]);
  expect(p?.category).toBe("Minuman");
});

test("pembayaran nanti: jatuh tempo dibawa; cara bayar kosong → bawaan form", () => {
  const f = formFromReceipt(
    receipt({
      payment: {
        timing: "nanti",
        method: null,
        cashSource: null,
        dueDate: "2026-11-16",
      },
    }),
    null,
  );
  expect(f.payment).toMatchObject({ timing: "nanti", dueDate: "2026-11-16" });
});

test("toReceiptEdit: hanya lineId, jumlah, harga, ED; pembayaran kembali seperti nota", () => {
  const r = receipt();
  const f = formFromReceipt(r, null);
  expect(toReceiptEdit(f)).toEqual({
    supplierName: "CV Sumber Rejeki",
    notaDate: "2026-11-02",
    lines: [
      { lineId: "l1", qty: 2, unitCost: 112_000, expiryDate: "2027-04-20" },
      { lineId: "l2", qty: 1, unitCost: 0, expiryDate: "2027-04-20" },
    ],
    payment: r.payment,
  });
});

test("toReceiptEdit: transfer tanpa sumber uang; supplier dipangkas", () => {
  const r = receipt({
    payment: {
      timing: "sekarang",
      method: "transfer",
      cashSource: null,
      dueDate: null,
    },
  });
  const f = formFromReceipt(r, null);
  const edit = toReceiptEdit({ ...f, supplierName: "  CV Baru " });
  expect(edit.payment).toEqual(r.payment);
  expect(edit.supplierName).toBe("CV Baru");
});
