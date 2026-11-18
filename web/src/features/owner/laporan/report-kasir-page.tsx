import { useSearch } from "@tanstack/react-router";
import { useGetOwnerSalesReport } from "@/shared/api/gen/owner/owner";
import { useBusinessDay } from "@/shared/hooks/use-business-day";
import { formatRupiah } from "@/shared/lib/money";
import { clampToToday, rangeLabel } from "@/shared/lib/report-period";
import { SubPageHeader } from "../common/sub-page-header";
import { RowList } from "../products/detail/section";
import {
  EMPTY_SALES,
  ReportError,
  ReportListSkeleton,
} from "./report-sub-state";

/** `Per kasir`: omzet, transaksi, dibatalkan; urutan dari server. */
export function ReportKasirPage() {
  const search = useSearch({ from: "/owner/laporan/kasir" });
  const { date: today } = useBusinessDay();
  const query = useGetOwnerSalesReport({
    period: search.periode,
    from: search.dari,
    to: search.sampai,
  });
  const eyebrow = rangeLabel(
    query.data?.range ??
      clampToToday({ from: search.dari, to: search.sampai }, today),
  );

  return (
    <div className="grid gap-4 lg:max-w-xl">
      <SubPageHeader
        title="Per kasir"
        eyebrow={eyebrow}
        back={{ label: "Laporan", fallback: "/owner/laporan" }}
      />
      {query.data ? (
        <div className="overflow-hidden rounded-lg bg-surface">
          {query.data.kasir.length === 0 ? (
            <p className="px-4 py-4 text-muted">{EMPTY_SALES}</p>
          ) : (
            <RowList>
              {query.data.kasir.map((k) => (
                <li
                  key={k.kasirName}
                  className="flex min-h-14 items-center gap-3 px-4 py-2"
                >
                  <span className="grid min-w-0 flex-1">
                    <span className="break-words">{k.kasirName}</span>
                    <span className="text-[13px] text-muted tabular-nums">
                      {`${k.salesCount} transaksi · ${k.voidedCount} dibatalkan`}
                    </span>
                  </span>
                  <span className="shrink-0 font-semibold tabular-nums">
                    {formatRupiah(k.revenue)}
                  </span>
                </li>
              ))}
            </RowList>
          )}
        </div>
      ) : query.isError ? (
        <ReportError error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <ReportListSkeleton />
      )}
    </div>
  );
}
