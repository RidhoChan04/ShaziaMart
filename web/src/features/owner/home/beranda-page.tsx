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

const CARD = "rounded-lg border border-border bg-surface p-3";
const TREND_COLOR = {
  up: "text-primary",
  down: "text-danger",
  flat: "text-muted",
  none: "text-muted",
} as const;

function Hero({ summary }: { summary: OwnerTodaySummary }) {
  const { text, trend } = comparisonText(
    summary.revenue,
    summary.lastWeekRevenue,
    summary.weekdayLastWeek,
  );
  return (
    <section className={CARD}>
      <p className="text-[11px] text-muted">OMZET HARI INI</p>
      <p className="num text-[26px] font-extrabold">
        {formatRupiah(summary.revenue)}
      </p>
      <p className={cn("text-sm font-semibold", TREND_COLOR[trend])}>{text}</p>
    </section>
  );
}

function Summary({ summary }: { summary: OwnerTodaySummary }) {
  return (
    <div className="grid gap-3 lg:grid-cols-2 lg:items-start lg:gap-4">
      <div className="grid gap-3">
        <Hero summary={summary} />
        <section className={CARD} aria-labelledby="hourly-title">
          <h2 id="hourly-title" className="mb-2 text-sm font-semibold">
            Omzet per jam
          </h2>
          <HourlyChart
            hourly={summary.hourly}
            weekday={summary.weekdayLastWeek}
            nowHour={jakartaHour(Date.now())}
          />
        </section>
      </div>
      <div className="grid gap-3">
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
      className="grid gap-3 lg:grid-cols-2 lg:items-start lg:gap-4"
    >
      <div className="grid gap-3">
        <Skeleton className="h-[104px]" />
        <Skeleton className="h-[236px]" />
      </div>
      <div className="grid gap-3">
        <div className="grid grid-cols-2 gap-2 lg:gap-3">
          <Skeleton className="h-[66px]" />
          <Skeleton className="h-[66px]" />
          <Skeleton className="h-[66px]" />
          <Skeleton className="h-[66px]" />
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
      <h1 className="sr-only">Beranda</h1>
      {refreshing && (
        <p
          role="status"
          className="fixed top-3 left-1/2 z-40 -translate-x-1/2 rounded-full border border-border bg-surface px-3 py-1 text-xs font-medium shadow-sm"
        >
          Memuat…
        </p>
      )}
      {query.data ? (
        <Summary summary={query.data} />
      ) : query.isError ? (
        <LoadError error={query.error} onRetry={() => void query.refetch()} />
      ) : (
        <BerandaSkeleton />
      )}
    </div>
  );
}
