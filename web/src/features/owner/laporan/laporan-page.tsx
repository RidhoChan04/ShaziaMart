import { useNavigate, useSearch } from "@tanstack/react-router";
import {
  useGetOwnerOpnameReport,
  useGetOwnerSalesReport,
  useGetOwnerStockReport,
} from "@/shared/api/gen/owner/owner";
import { useBusinessDay } from "@/shared/hooks/use-business-day";
import { cn } from "@/shared/lib/cn";
import { pesanError } from "@/shared/lib/error-messages";
import { Button } from "@/shared/ui/button";
import { PeriodBar } from "./period-bar";
import { DetailLinks, TopProducts, UnsoldSummary } from "./report-rows";
import { ReportTiles } from "./report-tiles";
import { previousLabel, RevenueCard } from "./revenue-card";

function Skeleton({ className }: { className: string }) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-lg bg-border motion-reduce:animate-none",
        className,
      )}
    />
  );
}

function LaporanSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Memuat laporan"
      className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:items-start lg:gap-4"
    >
      <Skeleton className="h-[395px]" />
      <div className="grid grid-cols-2 gap-2 lg:gap-3">
        <Skeleton className="h-[96px]" />
        <Skeleton className="h-[96px]" />
        <Skeleton className="h-[96px]" />
        <Skeleton className="h-[96px]" />
      </div>
    </div>
  );
}

/**
 * Tab Laporan (K16/K26): periode di URL, tiga query (penjualan, stok, opname). Semua angka,
 * urutan, dan pembanding dari server; layar hanya menampilkan.
 */
export function LaporanPage() {
  const search = useSearch({ from: "/owner/laporan" });
  const navigate = useNavigate({ from: "/owner/laporan" });
  const { date: today } = useBusinessDay();
  const range = { from: search.dari, to: search.sampai };
  const sales = useGetOwnerSalesReport({ period: search.periode, ...range });
  const stock = useGetOwnerStockReport();
  const opname = useGetOwnerOpnameReport(range);
  const queries = [sales, stock, opname];
  const failed = queries.filter((q) => q.isError && q.data === undefined);

  return (
    <div className="grid gap-4">
      <div className="lg:max-w-xl">
        <PeriodBar
          search={search}
          today={today}
          onChange={(next) => void navigate({ search: next })}
        />
      </div>
      {sales.data && stock.data && opname.data ? (
        <>
          <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:items-start lg:gap-4">
            <RevenueCard report={sales.data} />
            <ReportTiles
              report={sales.data}
              label={previousLabel(sales.data)}
            />
          </div>
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2 lg:items-start">
            <TopProducts products={sales.data.topProducts} search={search} />
            <div className="grid gap-4">
              <UnsoldSummary unsold={stock.data.unsold} search={search} />
              <DetailLinks
                search={search}
                opname={opname.data}
                thinMargin={stock.data.thinMargin}
              />
            </div>
          </div>
        </>
      ) : failed.length > 0 ? (
        <div className="mx-auto flex max-w-sm flex-col items-center gap-4 py-16 text-center">
          <p className="text-base font-semibold">
            {pesanError(failed[0]?.error)}
          </p>
          <Button
            onClick={() => {
              for (const q of failed) void q.refetch();
            }}
          >
            Coba lagi
          </Button>
        </div>
      ) : (
        <LaporanSkeleton />
      )}
    </div>
  );
}
