import { useId, useMemo } from "react";
import type { SalesReport } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatRupiah, formatRupiahShort } from "@/shared/lib/money";
import {
  compareText,
  rangeLabel,
  weekdayLabel,
} from "@/shared/lib/report-period";
import { FitAmount } from "../common/fit-amount";
import { HealthChart } from "../common/health-chart/health-chart";
import { labaMargin, reportChart } from "./report-chart";

const OMZET = {
  id: "omzet",
  name: "Omzet",
  color: "var(--color-chart-1)",
  nowColor: "var(--color-chart-1-now)",
};
/** Isi hijau muda + garis tepi hijau toko (keputusan pemilik 18 Nov, opsi B+; lihat styles.css). */
const LABA = {
  id: "laba",
  name: "Laba kotor",
  color: "var(--color-chart-3)",
  outline: "var(--color-chart-1)",
  note: labaMargin,
};

/** Nama rentang pembanding: Hari = `Kamis, 29 Okt` (H−7), selain itu `1–5 Okt`. */
export const previousLabel = (report: SalesReport): string =>
  report.period === "hari"
    ? weekdayLabel(report.previous.from)
    : rangeLabel(report.previous);

/** Kartu C4 Laporan: pita omzet + pil pembanding, lalu grafik Health omzet & laba kotor. */
export function RevenueCard({ report }: { report: SalesReport }) {
  const titleId = useId();
  const chart = useMemo(
    () => reportChart(report.series, report.running),
    [report.series, report.running],
  );
  const range = rangeLabel(report.range);
  const pill = compareText(
    report.current.revenue,
    report.previousTotals.revenue,
    previousLabel(report),
    report.previousTotals.salesCount > 0,
    formatRupiah,
  );
  return (
    <div className="min-w-0 overflow-hidden rounded-lg bg-surface">
      <div className="min-w-0 bg-linear-155 from-primary to-primary-deep px-4 pt-4 pb-3.5 text-primary-foreground">
        <p className="text-[13px] font-semibold">{`Omzet ${range}`}</p>
        <p className="mt-0.5 leading-tight font-bold tracking-[-0.03em]">
          <FitAmount
            text={formatRupiah(report.current.revenue)}
            max={34}
            min={22}
            className="num"
          />
        </p>
        <p className="mt-2">
          <span className="inline-flex rounded-full bg-primary-foreground/12 px-2.5 py-1 text-[13px] font-semibold">
            {pill}
          </span>
        </p>
      </div>
      <section aria-labelledby={titleId} className="px-4 pt-3.5 pb-4">
        <h2 id={titleId} className="mb-1 text-[13px] font-semibold text-muted">
          {chart.title}
        </h2>
        <HealthChart
          buckets={chart.buckets}
          back={OMZET}
          front={LABA}
          emphasis="back"
          nowKey={chart.nowKey}
          groupLabel={`Omzet dan laba kotor per ${chart.unit}, ${range}`}
          caption="Omzet dan laba kotor"
          keyHeader={chart.keyHeader}
          summary={chart.summary}
          peakLabel={formatRupiahShort}
        />
      </section>
    </div>
  );
}
