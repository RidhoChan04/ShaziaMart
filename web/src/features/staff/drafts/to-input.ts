import type {
  ReceiptError,
  ReceiptInput,
  ReceiptLineInput,
  ReceiptPayment,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { type DraftLine, validateReceipt } from "@/shared/lib/receipt-rules";
import { toCheckLine } from "../receipt/line-model";
import type { DraftPayment, ReceiptDraft } from "./draft-types";

/**
 * Pilihan form → kontrak. sekarang: tanpa jatuh tempo (R12); transfer tanpa sumber uang.
 * nanti: cara bayar dipilih saat pelunasan. "Dari laci" tidak pernah diubah diam-diam (R8).
 */
function toPayment(p: DraftPayment): ReceiptPayment {
  if (p.timing === "nanti") {
    return {
      timing: "nanti",
      method: null,
      cashSource: null,
      dueDate: p.dueDate,
    };
  }
  return {
    timing: "sekarang",
    method: p.method,
    cashSource: p.method === "transfer" ? null : p.cashSource,
    dueDate: null,
  };
}

function toLineInput(line: DraftLine): ReceiptLineInput {
  const l = toCheckLine(line);
  return {
    lineId: l.lineId,
    productId: l.productId,
    unitId: l.unitId,
    newProduct: l.newProduct,
    qty: line.qty,
    // Harga kosong hanya mungkin bila form dilewati; -1 ditolak server dengan pesan harga.
    unitCost: l.unitCost ?? -1,
    expiryDate: l.expiryDate,
  };
}

/** Draf → isi POST nota; `id` draf = kunci idempoten. */
export function toReceiptInput(d: ReceiptDraft): ReceiptInput {
  return {
    id: d.id,
    supplierName: d.form.supplierName.trim(),
    notaDate: d.form.notaDate,
    photoId: d.photo?.id ?? null,
    lines: d.form.lines.map(toLineInput),
    payment: toPayment(d.form.payment),
  };
}

/** Masalah draf sebelum disimpan/dikirim: aturan nota yang sama dengan server (pesan dari receipt-rules). */
export function formProblems(
  d: ReceiptDraft,
  ctx: { today: string; shiftOpen: boolean },
): ReceiptError[] {
  return validateReceipt(
    {
      supplierName: d.form.supplierName,
      notaDate: d.form.notaDate,
      lines: d.form.lines.map(toCheckLine),
      payment: toPayment(d.form.payment),
    },
    ctx,
  );
}
