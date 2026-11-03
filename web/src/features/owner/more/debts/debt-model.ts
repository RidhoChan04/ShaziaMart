import type { SupplierDebt } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatIsoDayMonth, isoDaysBetween } from "@/shared/lib/business-day";
import { debtStage } from "@/shared/lib/receipt-rules";

export type DebtGroup = {
  supplierName: string;
  total: number;
  debts: SupplierDebt[];
};

const unpaid = (debts: SupplierDebt[]) => debts.filter((d) => d.paid === null);

/** Ringkasan utang belum lunas: total rupiah, jumlah nota, jumlah supplier, dan nota lewat jatuh tempo. */
export function unpaidSummary(
  debts: SupplierDebt[],
  today: string,
): { total: number; notes: number; suppliers: number; overdue: number } {
  const open = unpaid(debts);
  return {
    total: open.reduce((sum, d) => sum + d.amount, 0),
    notes: open.length,
    suppliers: new Set(open.map((d) => d.supplierName)).size,
    overdue: open.filter((d) => debtStage(d.dueDate, today) === "lewat").length,
  };
}

/** Utang belum lunas per supplier; supplier dengan jatuh tempo terdekat dulu, nota di dalamnya urut sama. */
export function groupBySupplier(debts: SupplierDebt[]): DebtGroup[] {
  const sorted = unpaid(debts).sort(
    (a, b) =>
      a.dueDate.localeCompare(b.dueDate) ||
      a.notaDate.localeCompare(b.notaDate) ||
      a.createdAt - b.createdAt,
  );
  const groups = new Map<string, DebtGroup>();
  for (const d of sorted) {
    const g = groups.get(d.supplierName);
    if (g) {
      g.debts.push(d);
      g.total += d.amount;
    } else {
      groups.set(d.supplierName, {
        supplierName: d.supplierName,
        total: d.amount,
        debts: [d],
      });
    }
  }
  return [...groups.values()];
}

/** "Jatuh tempo 11 Nov · 9 hari lagi" | "Jatuh tempo 2 Nov · hari ini" | "Jatuh tempo 30 Okt" (sudah lewat). */
export function dueText(dueDate: string, today: string): string {
  const base = `Jatuh tempo ${formatIsoDayMonth(dueDate)}`;
  const days = isoDaysBetween(today, dueDate);
  if (days < 0) return base;
  return days === 0 ? `${base} · hari ini` : `${base} · ${days} hari lagi`;
}
