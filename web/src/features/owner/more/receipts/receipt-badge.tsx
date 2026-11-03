import { Ban, Clock } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import type { ReceiptBadge } from "./receipt-model";

const TONES: Record<ReceiptBadge["tone"], string> = {
  warning: "bg-warning-soft text-warning-ink",
  neutral: "bg-border text-text",
};

/** Tanda status nota = ikon + teks (warna saja tidak cukup). */
export function ReceiptBadgeView({ badge }: { badge: ReceiptBadge }) {
  const Icon = badge.label === "Dibatalkan" ? Ban : Clock;
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold whitespace-nowrap",
        TONES[badge.tone],
      )}
    >
      <Icon aria-hidden="true" className="size-3" />
      {badge.label}
    </span>
  );
}
