import type {
  SupplierDebt,
  SupplierDebtAttention,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { jakartaIsoDate } from "@/shared/lib/business-day";
import { debtStage } from "@/shared/lib/receipt-rules";
import type { MockReceipt, MockState } from "../db";
import { receiptTotalOf } from "./views";

const dueDateOf = (r: MockReceipt): string => {
  if (r.payment.dueDate === null)
    throw new Error(`Nota ${r.id} tanpa jatuh tempo`);
  return r.payment.dueDate;
};

/** Belum lunas: jatuh tempo terdekat dulu (lalu tanggal nota, waktu catat). */
const byDueDate = (a: MockReceipt, b: MockReceipt): number =>
  dueDateOf(a).localeCompare(dueDateOf(b)) ||
  a.notaDate.localeCompare(b.notaDate) ||
  a.createdAt - b.createdAt;

/**
 * Utang supplier = nota Bayar nanti yang tidak dibatalkan. Urutan kontrak: belum lunas
 * urut jatuh tempo, lalu yang lunas terbaru dulu.
 */
export function debtsOf(state: Readonly<MockState>): MockReceipt[] {
  const debts = state.receipts.filter(
    (r) =>
      r.payment.timing === "nanti" &&
      r.payment.dueDate !== null &&
      r.status === "aktif",
  );
  const unpaid = debts.filter((r) => r.paid === null).sort(byDueDate);
  const paid = debts
    .filter((r) => r.paid !== null)
    .sort((a, b) => (b.paid?.at ?? 0) - (a.paid?.at ?? 0));
  return [...unpaid, ...paid];
}

/** `amount` selalu dihitung dari baris nota (ubah nominal ikut), tidak pernah disalin. */
export function toSupplierDebt(
  state: Readonly<MockState>,
  r: MockReceipt,
): SupplierDebt {
  return {
    receiptId: r.id,
    supplierName:
      state.suppliers.find((s) => s.id === r.supplierId)?.name ?? "",
    notaDate: r.notaDate,
    amount: receiptTotalOf(r),
    dueDate: dueDateOf(r),
    paid: r.paid,
    photoId: r.photoId,
    createdAt: r.createdAt,
    createdByName: r.createdByName,
  };
}

/** Utang belum lunas menurut tanggal Jakarta hari ini: lewat jatuh tempo dan segera (0–3 hari). */
export function debtAttention(
  state: Readonly<MockState>,
  now: number,
): SupplierDebtAttention {
  const today = jakartaIsoDate(now);
  const out: SupplierDebtAttention = {
    overdueCount: 0,
    overdueTotal: 0,
    dueSoonCount: 0,
    dueSoonTotal: 0,
  };
  for (const r of debtsOf(state)) {
    if (r.paid !== null) continue;
    const stage = debtStage(dueDateOf(r), today);
    if (stage === "lewat") {
      out.overdueCount += 1;
      out.overdueTotal += receiptTotalOf(r);
    } else if (stage === "segera") {
      out.dueSoonCount += 1;
      out.dueSoonTotal += receiptTotalOf(r);
    }
  }
  return out;
}
