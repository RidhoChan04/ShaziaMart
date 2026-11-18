import { keepPreviousData } from "@tanstack/react-query";
import { useSearch } from "@tanstack/react-router";
import { useState } from "react";
import { useListOwnerProductSales } from "@/shared/api/gen/owner/owner";
import {
  type ProductSales,
  ProductSalesSort,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { useBusinessDay } from "@/shared/hooks/use-business-day";
import { cn } from "@/shared/lib/cn";
import { formatRupiah } from "@/shared/lib/money";
import { formatQty } from "@/shared/lib/quantity";
import { clampToToday, rangeLabel } from "@/shared/lib/report-period";
import { SubPageHeader } from "../common/sub-page-header";
import { RowList } from "../products/detail/section";
import {
  EMPTY_SALES,
  ReportError,
  ReportListSkeleton,
  StaleReportAlert,
} from "./report-sub-state";

const SORTS = [
  [ProductSalesSort.omzet, "Omzet"],
  [ProductSalesSort.jumlah, "Jumlah"],
  [ProductSalesSort.laba, "Laba"],
] as const;

type Sort = (typeof SORTS)[number][0];

function Trailing({ p, sort }: { p: ProductSales; sort: Sort }) {
  if (sort === "jumlah") {
    return (
      <span className="grid shrink-0 justify-items-end">
        <span className="font-semibold tabular-nums">
          {formatQty(p.qtyBase, p.unitSize, p.unitName)}
        </span>
        <span className="text-[13px] text-muted tabular-nums">
          {formatRupiah(p.revenue)}
        </span>
      </span>
    );
  }
  if (sort === "laba") {
    return p.grossProfit === null ? (
      <span className="shrink-0 text-[15px] text-muted">HPP belum ada</span>
    ) : (
      <span className="shrink-0 font-semibold tabular-nums">
        {formatRupiah(p.grossProfit)}
      </span>
    );
  }
  return (
    <span className="shrink-0 font-semibold tabular-nums">
      {formatRupiah(p.revenue)}
    </span>
  );
}

/** `Paling laku › Lihat semua`: urutan Omzet / Jumlah / Laba dari server (`sort`), peringkat = posisi. */
export function TopProductsPage() {
  const search = useSearch({ from: "/owner/laporan/paling-laku" });
  const { date: today } = useBusinessDay();
  const [sort, setSort] = useState<Sort>("omzet");
  const query = useListOwnerProductSales(
    { period: search.periode, from: search.dari, to: search.sampai, sort },
    { query: { placeholderData: keepPreviousData } },
  );
  const eyebrow = rangeLabel(
    clampToToday({ from: search.dari, to: search.sampai }, today),
  );

  return (
    <div className="grid gap-4 lg:max-w-xl">
      <SubPageHeader
        title="Paling laku"
        eyebrow={eyebrow}
        back={{ label: "Laporan", fallback: "/owner/laporan" }}
      />
      {/* biome-ignore lint/a11y/useSemanticElements: grup berlabel cukup; sama dengan pita periode */}
      <div
        role="group"
        aria-label="Urutkan"
        className="flex gap-1 rounded-full bg-surface p-1"
      >
        {SORTS.map(([value, label]) => (
          <button
            key={value}
            type="button"
            aria-pressed={sort === value}
            onClick={() => setSort(value)}
            className={cn(
              "min-h-11 flex-1 rounded-full px-2 text-[15px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary",
              sort === value
                ? "bg-primary text-primary-foreground"
                : "text-text",
            )}
          >
            {label}
          </button>
        ))}
      </div>
      {query.isError && query.data !== undefined && (
        <StaleReportAlert
          error={query.error}
          onRetry={() => void query.refetch()}
        />
      )}
      {query.data ? (
        <div
          aria-busy={query.isPlaceholderData || undefined}
          className={cn(
            "overflow-hidden rounded-lg bg-surface transition-opacity duration-150 motion-reduce:transition-none",
            query.isPlaceholderData && "opacity-60",
          )}
        >
          {query.data.length === 0 ? (
            <p className="px-4 py-4 text-muted">{EMPTY_SALES}</p>
          ) : (
            <RowList>
              {query.data.map((p, i) => (
                <li
                  key={p.productId ?? p.productName}
                  className="flex min-h-14 items-center gap-3 px-4 py-2"
                >
                  <span className="w-6 shrink-0 text-center font-semibold text-muted tabular-nums">
                    {i + 1}
                  </span>
                  <span className="grid min-w-0 flex-1">
                    <span className="break-words">{p.productName}</span>
                    {sort !== "jumlah" && (
                      <span className="text-[13px] text-muted tabular-nums">
                        {formatQty(p.qtyBase, p.unitSize, p.unitName)}
                      </span>
                    )}
                  </span>
                  <Trailing p={p} sort={sort} />
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
