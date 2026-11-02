import {
  CircleDashed,
  CircleMinus,
  EyeOff,
  Hourglass,
  type LucideIcon,
  PackageX,
  TriangleAlert,
} from "lucide-react";
import { cn } from "@/shared/lib/cn";
import type { Badge } from "./product-model";

const ICONS: Record<Badge["key"], LucideIcon> = {
  minus: CircleMinus,
  menipis: TriangleAlert,
  langka: Hourglass,
  tidak_diambil: PackageX,
  belum_dihitung: CircleDashed,
  nonaktif: EyeOff,
};

const TONES: Record<Badge["tone"], string> = {
  danger: "bg-danger-soft text-danger-ink",
  warning: "bg-warning-soft text-warning-ink",
  neutral: "bg-border text-text",
};

/** Tanda status = ikon + teks (warna saja tidak cukup). */
export function StatusBadge({ badge }: { badge: Badge }) {
  const Icon = ICONS[badge.key];
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
