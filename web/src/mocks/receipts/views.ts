import type {
  OwnerReceipt,
  OwnerReceiptRow,
  StaffReceipt,
  StaffReceiptRow,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { receiptTotal } from "@/shared/lib/receipt-rules";
import type { MockReceipt, MockState } from "../db";

export const receiptTotalOf = (r: MockReceipt): number => receiptTotal(r.lines);

export const supplierNameOf = (
  state: Readonly<MockState>,
  r: MockReceipt,
): string => state.suppliers.find((s) => s.id === r.supplierId)?.name ?? "";

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

/** Nota untuk pemilik: field nota staf + pelunasan, pembatalan, dan riwayat (terlama dulu). */
export function toOwnerReceipt(
  state: Readonly<MockState>,
  r: MockReceipt,
): OwnerReceipt {
  return {
    ...toStaffReceipt(state, r),
    paid: r.paid,
    cancelledAt: r.cancelledAt,
    audit: state.receiptAudit
      .filter((a) => a.receiptId === r.id)
      .sort((a, b) => a.at - b.at)
      .map(({ receiptId: _, ...entry }) => entry),
  };
}

export function toOwnerReceiptRow(
  state: Readonly<MockState>,
  r: MockReceipt,
): OwnerReceiptRow {
  return {
    id: r.id,
    supplierName: supplierNameOf(state, r),
    notaDate: r.notaDate,
    total: receiptTotalOf(r),
    lineCount: r.lines.length,
    status: r.status,
    payment: r.payment,
    paid: r.paid,
    createdAt: r.createdAt,
    createdByName: r.createdByName,
    editedByName: r.editedByName,
  };
}
