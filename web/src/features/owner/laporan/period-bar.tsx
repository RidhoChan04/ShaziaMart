import { ChevronLeft, ChevronRight } from "lucide-react";
import type { ComponentProps } from "react";
import { cn } from "@/shared/lib/cn";
import { periodTitle, shiftPeriod } from "@/shared/lib/report-period";
import { DateRangeSheet } from "./date-range-sheet";
import { type ReportSearch, reportSearch } from "./report-search";

const SEGMENTS = [
  ["hari", "Hari"],
  ["minggu", "Minggu"],
  ["bulan", "Bulan"],
] as const;

const segmentClass = (active: boolean) =>
  cn(
    "min-h-11 flex-1 rounded-full px-2 text-[15px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary",
    active ? "bg-primary text-primary-foreground" : "text-text",
  );

const stepClass =
  "grid min-h-11 size-12 shrink-0 place-items-center rounded-full text-primary focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-primary disabled:text-border";

/** Segmen Tanggal: juga pemicu lembar (Radix menyuntikkan props & ref lewat `asChild`). */
function TanggalButton({
  active,
  className,
  ...props
}: ComponentProps<"button"> & { active: boolean }) {
  return (
    <button
      type="button"
      aria-pressed={active}
      className={cn(segmentClass(active), className)}
      {...props}
    >
      Tanggal
    </button>
  );
}

/** Segmen Hari/Minggu/Bulan/Tanggal + navigator `‹ judul ›` (K26: `›` nonaktif bila periode berikutnya belum mulai). */
export function PeriodBar({
  search,
  today,
  onChange,
}: {
  search: ReportSearch;
  today: string;
  onChange: (next: ReportSearch) => void;
}) {
  const range = { from: search.dari, to: search.sampai };
  const step = (dir: -1 | 1) => {
    const next = shiftPeriod(search.periode, range, dir);
    return { periode: search.periode, dari: next.from, sampai: next.to };
  };
  const next = step(1);

  return (
    <div className="grid gap-2">
      {/* biome-ignore lint/a11y/useSemanticElements: fieldset membawa gaya bawaan; grup berlabel cukup bagi pembaca layar */}
      <div
        role="group"
        aria-label="Periode"
        className="flex gap-1 rounded-full bg-surface p-1"
      >
        {SEGMENTS.map(([periode, label]) => (
          <button
            key={periode}
            type="button"
            aria-pressed={search.periode === periode}
            onClick={() => onChange(reportSearch(periode, today))}
            className={segmentClass(search.periode === periode)}
          >
            {label}
          </button>
        ))}
        <DateRangeSheet
          trigger={<TanggalButton active={search.periode === "tanggal"} />}
          from={search.dari}
          to={search.sampai}
          today={today}
          onSubmit={(dari, sampai) =>
            onChange({ periode: "tanggal", dari, sampai })
          }
        />
      </div>
      <div className="flex items-center rounded-[14px] bg-surface">
        <button
          type="button"
          aria-label="Periode sebelumnya"
          onClick={() => onChange(step(-1))}
          className={stepClass}
        >
          <ChevronLeft aria-hidden="true" className="size-5" />
        </button>
        <p className="min-w-0 flex-1 text-center font-semibold">
          {periodTitle(search.periode, range)}
        </p>
        <button
          type="button"
          aria-label="Periode berikutnya"
          disabled={next.dari > today}
          onClick={() => onChange(next)}
          className={stepClass}
        >
          <ChevronRight aria-hidden="true" className="size-5" />
        </button>
      </div>
    </div>
  );
}
