import {
  getGetOwnerTodaySummaryQueryKey,
  useGetOwnerTodaySummary,
} from "@/shared/api/gen/owner/owner";
import type { OwnerTodaySummary } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { useBusinessDay } from "@/shared/hooks/use-business-day";
import { usePullToRefresh } from "@/shared/hooks/use-pull-to-refresh";
import { jakartaHour } from "@/shared/lib/business-day";
import { cn } from "@/shared/lib/cn";
import { pesanError } from "@/shared/lib/error-messages";
import { formatRupiah } from "@/shared/lib/money";
import { Button } from "@/shared/ui/button";
import { AttentionList } from "./attention-list";
import { comparisonText } from "./home-model";
import { HourlyChart } from "./hourly-chart";
import { KpiTiles } from "./kpi-tiles";

const REFRESH_MS = 60_000;

/** Kartu C4: pita hijau berisi omzet, lalu bagian putih berisi grafik per jam. */
function RevenueCard({
  summary,
  nowHour,
}: {
  summary: OwnerTodaySummary;
  nowHour: number;
}) {
  const { text } = comparisonText(
    summary.revenue,
    summary.lastWeekRevenue,
    summary.weekdayLastWeek,
  );
  return (
    <div className="min-w-0 overflow-hidden rounded-lg bg-surface">
      <div className="min-w-0 bg-linear-155 from-primary to-primary-deep px-4 pt-4 pb-3.5 text-primary-foreground">
        <p className="text-[13px] font-semibold">Omzet hari ini</p>
        {/* Satu baris: angka panjang dipotong, bukan meluber dari kartu. */}
        <p className="num mt-0.5 truncate text-[34px] leading-tight font-bold tracking-[-0.03em]">
          {formatRupiah(summary.revenue)}
        </p>
        <p className="mt-2">
          <span className="inline-flex rounded-full bg-primary-foreground/12 px-2.5 py-1 text-[13px] font-semibold">
            {text}
          </span>
        </p>
      </div>
      <section aria-labelledby="hourly-title" className="px-4 pt-3.5 pb-4">
        <h2
          id="hourly-title"
          className="mb-1 text-[13px] font-semibold text-muted"
        >
          Omzet per jam
        </h2>
        <HourlyChart
          hourly={summary.hourly}
          weekday={summary.weekdayLastWeek}
          nowHour={nowHour}
        />
      </section>
    </div>
  );
}

function Summary({
  summary,
  nowHour,
}: {
  summary: OwnerTodaySummary;
  nowHour: number;
}) {
  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:items-start lg:gap-4">
      <RevenueCard summary={summary} nowHour={nowHour} />
      <div className="grid min-w-0 gap-3">
        <KpiTiles summary={summary} />
        <AttentionList attention={summary.attention} />
      </div>
    </div>
  );
}

/** Blok berwarna token seukuran isi asli agar tata letak tidak bergeser saat data tiba. */
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

function BerandaSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Memuat beranda"
      className="grid grid-cols-1 gap-3 lg:grid-cols-2 lg:items-start lg:gap-4"
    >
      <Skeleton className="h-[395px]" />
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-2 lg:gap-3">
          <Skeleton className="h-[75px]" />
          <Skeleton className="h-[75px]" />
          <Skeleton className="h-[75px]" />
          <Skeleton className="h-[75px]" />
        </div>
        <Skeleton className="h-24" />
      </div>
    </div>
  );
}

function LoadError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-4 py-16 text-center">
      <p className="text-base font-semibold">{pesanError(error)}</p>
      <Button onClick={onRetry}>Coba lagi</Button>
    </div>
  );
}

export function BerandaPage() {
  const { date } = useBusinessDay();
  const query = useGetOwnerTodaySummary({
    query: {
      // Tanggal bisnis di kunci: berganti hari = data baru, bukan data kemarin.
      queryKey: [...getGetOwnerTodaySummaryQueryKey(), date],
      refetchInterval: REFRESH_MS,
    },
  });
  const refreshing = usePullToRefresh(query.refetch);

  return (
    <div className="mx-auto max-w-6xl">
      {refreshing && (
        <p
          role="status"
          className="fixed top-3 left-1/2 z-40 -translate-x-1/2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium shadow-sm"
        >
          Memuat…
        </p>
      )}
      {query.data ? (
        // Jam data, bukan jam render: saat server mati garis tidak menjalar ke jam kosong.
        <Summary
          summary={query.data}
          nowHour={jakartaHour(query.dataUpdatedAt)}
        />
      ) : query.isError ? (
        <LoadError error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <BerandaSkeleton />
      )}
    </div>
  );
}
