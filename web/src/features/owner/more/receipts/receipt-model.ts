import type {
  OwnerReceiptRow,
  ReceiptAuditEntry,
  ReceiptLine,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatIsoDate } from "@/shared/lib/business-day";
import { formatRupiah } from "@/shared/lib/money";

/** "2 Nov 2026 · 3 barang · Rina" */
export function receiptRowDetail(r: OwnerReceiptRow): string {
  return `${formatIsoDate(r.notaDate)} · ${r.lineCount} barang · ${r.createdByName}`;
}

export type ReceiptBadge = {
  label: "Belum lunas" | "Dibatalkan";
  tone: "warning" | "neutral";
};

/** Tanda di baris daftar: dibatalkan menang atas belum lunas; nota yang dibayar saat itu tanpa tanda. */
export function receiptBadge(r: OwnerReceiptRow): ReceiptBadge | null {
  if (r.status === "dibatalkan")
    return { label: "Dibatalkan", tone: "neutral" };
  if (r.payment.timing === "nanti" && r.paid === null) {
    return { label: "Belum lunas", tone: "warning" };
  }
  return null;
}

const AUDIT_TITLE: Record<ReceiptAuditEntry["action"], string> = {
  buat: "Dicatat oleh",
  ubah: "Diubah oleh",
  batal: "Dibatalkan oleh",
  lunas: "Ditandai lunas oleh",
};

/** "Dicatat oleh Rina" | "Diubah oleh Rina" | "Dibatalkan oleh Pak Ahmad" | "Ditandai lunas oleh Pak Ahmad" */
export function auditTitle(e: ReceiptAuditEntry): string {
  return `${AUDIT_TITLE[e.action]} ${e.actorName}`;
}

/** "2 dus × Rp112.000 · ED 20 Apr 2027" (format baris nota di app orang toko). */
export function receiptLineDetail(l: ReceiptLine): string {
  const ed = l.expiryDate ? ` · ED ${formatIsoDate(l.expiryDate)}` : "";
  return `${l.qty} ${l.unitName} × ${formatRupiah(l.unitCost)}${ed}`;
}
