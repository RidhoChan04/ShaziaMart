import type {
  ReceiptLine,
  ReceiptPayment,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatIsoDate } from "@/shared/lib/business-day";
import { formatRupiah } from "@/shared/lib/money";
import { paymentSummary } from "@/shared/lib/payment-labels";
import type { MockReceipt } from "../db";

/** K6: koreksi uang laci tanpa shift buka tidak dicatat di shift mana pun. */
export const CASH_NOT_RECORDED =
  "Koreksi laci tidak dicatat — tidak ada shift buka";

const dateOrDash = (iso: string | null): string =>
  iso === null ? "—" : formatIsoDate(iso);

function lineChanges(a: ReceiptLine, b: ReceiptLine): string[] {
  const out: string[] = [];
  const name = b.productName;
  if (a.qty !== b.qty) {
    out.push(`${name}: jumlah ${a.qty} ${a.unitName} → ${b.qty} ${b.unitName}`);
  }
  if (a.unitCost !== b.unitCost) {
    out.push(
      `${name}: harga beli ${formatRupiah(a.unitCost)} → ${formatRupiah(b.unitCost)}`,
    );
  }
  if (a.expiryDate !== b.expiryDate) {
    out.push(
      `${name}: ED ${dateOrDash(a.expiryDate)} → ${dateOrDash(b.expiryDate)}`,
    );
  }
  return out;
}

function paymentChanges(a: ReceiptPayment, b: ReceiptPayment): string[] {
  if (a.timing === "nanti" && b.timing === "nanti") {
    return a.dueDate === b.dueDate
      ? []
      : [`Jatuh tempo ${dateOrDash(a.dueDate)} → ${dateOrDash(b.dueDate)}`];
  }
  const from = paymentSummary(a);
  const to = paymentSummary(b);
  return from === to ? [] : [`Pembayaran ${from} → ${to}`];
}

/**
 * Baris perubahan audit `ubah`, urut: supplier, tanggal, per baris (jumlah, harga beli, ED),
 * jatuh tempo, pembayaran. Baris dipasangkan lewat `lineId`.
 */
export function editChanges(
  before: MockReceipt,
  after: MockReceipt,
  supplierName: (id: string) => string,
): string[] {
  const out: string[] = [];
  if (before.supplierId !== after.supplierId) {
    out.push(
      `Supplier ${supplierName(before.supplierId)} → ${supplierName(after.supplierId)}`,
    );
  }
  if (before.notaDate !== after.notaDate) {
    out.push(
      `Tanggal nota ${dateOrDash(before.notaDate)} → ${dateOrDash(after.notaDate)}`,
    );
  }
  for (const b of after.lines) {
    const a = before.lines.find((l) => l.lineId === b.lineId);
    if (a) out.push(...lineChanges(a, b));
  }
  out.push(...paymentChanges(before.payment, after.payment));
  return out;
}
