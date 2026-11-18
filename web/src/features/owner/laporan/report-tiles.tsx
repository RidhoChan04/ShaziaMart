import type { SalesReport } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatPermille } from "@/shared/lib/margin";
import {
  formatAngka,
  formatRupiah,
  formatSignedRupiah,
} from "@/shared/lib/money";
import { compareText } from "@/shared/lib/report-period";
import { FitAmount } from "../common/fit-amount";

/** Laba boleh negatif: `−Rp…` (U+2212) seperti angka laporan lain, positif tanpa `+`. */
const profitText = (n: number) =>
  n < 0 ? formatSignedRupiah(n) : formatRupiah(n);

/** Empat kartu angka kunci 2×2 (P6); keempatnya punya baris pembanding (tinggi rata). */
export function ReportTiles({
  report,
  label,
}: {
  report: SalesReport;
  /** Nama rentang pembanding. */
  label: string;
}) {
  const now = report.current;
  const prev = report.previousTotals;
  const hasData = prev.salesCount > 0;
  const margin = now.marginPermille;
  const tiles = [
    {
      title:
        margin === null
          ? "Laba kotor"
          : `Laba kotor · ${formatPermille(margin)}`,
      value: profitText(now.grossProfit),
      compare: compareText(
        now.grossProfit,
        prev.grossProfit,
        label,
        hasData,
        formatSignedRupiah,
      ),
    },
    {
      title: "Transaksi",
      value: formatAngka(now.salesCount),
      compare: compareText(
        now.salesCount,
        prev.salesCount,
        label,
        hasData,
        formatAngka,
      ),
    },
    {
      title: "Rata-rata / struk",
      value: formatRupiah(now.avgTicket),
      compare: compareText(
        now.avgTicket,
        prev.avgTicket,
        label,
        hasData,
        formatRupiah,
      ),
    },
    {
      title: "Kasbon baru",
      value: formatRupiah(now.newCredit),
      compare: compareText(
        now.newCredit,
        prev.newCredit,
        label,
        hasData,
        formatRupiah,
      ),
    },
  ];
  return (
    <dl className="grid grid-cols-2 gap-2 lg:gap-3">
      {tiles.map((tile) => (
        <div
          key={tile.title}
          data-testid="report-tile"
          className="flex min-w-0 flex-col rounded-lg bg-surface px-3.5 py-3"
        >
          <dt className="text-[13px] font-semibold text-muted">{tile.title}</dt>
          <dd className="font-bold">
            <FitAmount text={tile.value} max={21} min={13} className="num" />
          </dd>
          <dd className="mt-auto pt-0.5 text-[13px] text-muted">
            {tile.compare}
          </dd>
        </div>
      ))}
    </dl>
  );
}
