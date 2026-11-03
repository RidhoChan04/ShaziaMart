import type {
  StaffReceipt,
  StaffReceiptRow,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { receiptTotal } from "@/shared/lib/receipt-rules";
import type { MockReceipt, MockState } from "../db";

export const receiptTotalOf = (r: MockReceipt): number => receiptTotal(r.lines);

const supplierNameOf = (state: Readonly<MockState>, r: MockReceipt): string =>
  state.suppliers.find((s) => s.id === r.supplierId)?.name ?? "";

/** Nota untuk pembuatnya: tanpa HPP/harga jual/stok, hanya harga beli yang diketik. */
export function toStaffReceipt(
  state: Readonly<MockState>,
  r: MockReceipt,
): StaffReceipt {
  return {
    id: r.id,
    supplierName: supplierNameOf(state, r),
    notaDate: r.notaDate,
    photoId: r.photoId,
    lines: r.lines,
    payment: r.payment,
    paymentEditable:
      r.status === "aktif" && r.payment.timing === "nanti" && r.paid === null,
    total: receiptTotalOf(r),
    status: r.status,
    createdAt: r.createdAt,
    createdByName: r.createdByName,
    editedAt: r.editedAt,
    editedByName: r.editedByName,
  };
}

export function toStaffReceiptRow(
  state: Readonly<MockState>,
  r: MockReceipt,
): StaffReceiptRow {
  return {
    id: r.id,
    supplierName: supplierNameOf(state, r),
    notaDate: r.notaDate,
    total: receiptTotalOf(r),
    lineCount: r.lines.length,
    status: r.status,
    createdAt: r.createdAt,
  };
}
