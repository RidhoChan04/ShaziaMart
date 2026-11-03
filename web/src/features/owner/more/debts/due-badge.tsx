import { Clock, TriangleAlert } from "lucide-react";
import { debtStage } from "@/shared/lib/receipt-rules";

/** Tanda `Lewat jatuh tempo` (bahaya) / `Segera jatuh tempo` (peringatan) = ikon + teks; tidak ada tanda bila masih jauh. */
export function DueBadge({
  dueDate,
  today,
}: {
  dueDate: string;
  today: string;
}) {
  const stage = debtStage(dueDate, today);
  if (stage === "nanti") return null;
  const overdue = stage === "lewat";
  const Icon = overdue ? TriangleAlert : Clock;
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap ${
        overdue
          ? "bg-danger-soft text-danger-ink"
          : "bg-warning-soft text-warning-ink"
      }`}
    >
      <Icon aria-hidden="true" className="size-3" />
      {overdue ? "Lewat jatuh tempo" : "Segera jatuh tempo"}
    </span>
  );
}
