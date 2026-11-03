import type {
  ReceiptEdit,
  ReceiptLine,
  StaffProduct,
  StaffReceipt,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatAngka } from "@/shared/lib/money";
import type { DraftLine } from "@/shared/lib/receipt-rules";
import type { ReceiptForm } from "../drafts/draft-types";
import { toPayment } from "../drafts/receipt-input";
import { parseCost } from "./line-model";

/** Salinan barang untuk lembar baris: dari daftar bila ada, selain itu hanya satuan nota baris itu. */
function productOf(l: ReceiptLine, p: StaffProduct | undefined) {
  if (p) {
    return {
      id: p.id,
      name: p.name,
      category: p.category,
      baseUnit: p.baseUnit,
      units: p.units,
    };
  }
  return {
    id: l.productId,
    name: l.productName,
    category: null,
    baseUnit: "pcs" as const,
    units: [
      { id: l.unitId, name: l.unitName, unitSize: l.unitSize, barcodes: [] },
    ],
  };
}

function lineOf(
  l: ReceiptLine,
  products: Map<string, StaffProduct> | null,
): DraftLine {
  return {
    lineId: l.lineId,
    product: productOf(l, products?.get(l.productId)),
    unitId: l.unitId,
    newProduct: null,
    qty: l.qty,
    unitCostText: formatAngka(l.unitCost),
    expiryDate: l.expiryDate,
  };
}

/** Nota tersimpan → isian form ubah (barang dan satuan terkunci di lembar baris). */
export function formFromReceipt(
  r: StaffReceipt,
  products: Map<string, StaffProduct> | null,
): ReceiptForm {
  const p = r.payment;
  return {
    supplierName: r.supplierName,
    notaDate: r.notaDate,
    lines: r.lines.map((l) => lineOf(l, products)),
    payment: {
      timing: p.timing,
      method: p.method ?? "tunai",
      cashSource: p.cashSource ?? "laci",
      dueDate: p.dueDate,
    },
  };
}

/** Isian form → isi PUT; harga yang tidak terbaca ditolak server dengan pesan harga. */
export function toReceiptEdit(f: ReceiptForm): ReceiptEdit {
  return {
    supplierName: f.supplierName.trim(),
    notaDate: f.notaDate,
    lines: f.lines.map((l) => ({
      lineId: l.lineId,
      qty: l.qty,
      unitCost: parseCost(l.unitCostText) ?? -1,
      expiryDate: l.expiryDate,
    })),
    payment: toPayment(f.payment),
  };
}
