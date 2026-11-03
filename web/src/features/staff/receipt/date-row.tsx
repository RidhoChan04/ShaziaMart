import { ChevronRight } from "lucide-react";
import { formatIsoDate, isIsoDate } from "@/shared/lib/business-day";

/** Baris tanggal: teks tanggal Indonesia, dengan isian tanggal bawaan HP transparan di atasnya. */
export function DateRow({
  label,
  value,
  max,
  min,
  invalid = false,
  describedBy,
  onChange,
}: {
  label: string;
  value: string;
  max?: string;
  min?: string;
  invalid?: boolean;
  describedBy?: string | undefined;
  onChange: (iso: string) => void;
}) {
  return (
    <div className="relative flex min-h-12 items-center justify-between gap-3 px-4">
      <span className="text-[17px]">{label}</span>
      <span className="flex min-w-0 items-center gap-1 text-[17px] font-medium text-primary tabular-nums">
        {isIsoDate(value) ? formatIsoDate(value) : "Pilih tanggal"}
        <ChevronRight
          aria-hidden="true"
          className="size-4 shrink-0 text-muted"
        />
      </span>
      <input
        type="date"
        aria-label={label}
        aria-invalid={invalid || undefined}
        aria-describedby={describedBy}
        value={value}
        {...(max ? { max } : {})}
        {...(min ? { min } : {})}
        onChange={(e) => onChange(e.target.value)}
        className="absolute inset-0 h-full w-full min-w-0 cursor-pointer opacity-0"
      />
    </div>
  );
}
