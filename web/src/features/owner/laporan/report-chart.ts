import type {
  ReportBucket,
  ReportSeries,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatIsoDayMonth } from "@/shared/lib/business-day";
import { formatRupiahShort } from "@/shared/lib/money";
import { roundHalfUp } from "@/shared/lib/quantity";
import { weekdayLabel } from "@/shared/lib/report-period";
import {
  type HealthBucket,
  hourLabel,
  peakIndex,
} from "../common/health-chart/health-chart-geometry";
import { hourWindow } from "../home/home-model";

/**
 * Margin laba kotor satu bucket untuk tooltip & pembacaan grafik (`16,4%`, minus U+2212): aturan
 * `marginPermille` server (jawaban pemilik Q5) — tanda(laba) × round_half_up(|laba| × 1000 /
 * omzet) — lalu satu desimal seperti kartu Laba kotor; `null` bila omzet ≤ 0 atau belum terjadi.
 */
export function labaMargin(bucket: HealthBucket): string | null {
  const { back: revenue, front: profit } = bucket;
  if (revenue === null || profit === null || revenue <= 0) return null;
  const permille = roundHalfUp(Math.abs(profit) * 1000, revenue);
  const sign = profit < 0 && permille > 0 ? "−" : "";
  return `${sign}${Math.floor(permille / 10)},${permille % 10}%`;
}

/** Label sumbu tanggal: tiap hari untuk ≤ 7 slot, selain itu tiap 7/14/21 hari (±5 label). */
const tickStep = (count: number) =>
  count <= 7 ? 1 : Math.ceil(count / 35) * 7;

function dayBuckets(buckets: ReportBucket[]): HealthBucket[] {
  const first = buckets[0]?.key ?? "";
  const last = buckets.at(-1)?.key ?? "";
  // Rentang lintas bulan memakai nama bulan agar "1" tidak ambigu.
  const withMonth = first.slice(0, 7) !== last.slice(0, 7);
  const step = tickStep(buckets.length);
  return buckets.map((b, i) => ({
    key: b.key,
    label: formatIsoDayMonth(b.key),
    tick:
      i % step === 0
        ? withMonth
          ? formatIsoDayMonth(b.key)
          : String(Number(b.key.slice(8)))
        : null,
    back: b.revenue,
    front: b.grossProfit,
  }));
}

/**
 * Jam yang ditampilkan: jam beromzet ditambah jam berjalan, lewat `hourWindow` Beranda (minimal
 * 6 jam; tanpa penjualan di hari lewat → 06.00–21.00).
 */
function hourBuckets(
  buckets: ReportBucket[],
  nowHour: number | null,
): HealthBucket[] {
  const shown = buckets
    .map((b) => Number(b.key))
    .filter((h, i) => (buckets[i]?.revenue ?? 0) > 0 || h === nowHour);
  const { from, to } = hourWindow(
    shown.map((hour) => ({ hour, revenue: 1, lastWeekRevenue: 0 })),
    nowHour ?? 0,
  );
  const byHour = new Map(buckets.map((b) => [Number(b.key), b]));
  return Array.from({ length: to - from + 1 }, (_, i): HealthBucket => {
    const h = from + i;
    const b = byHour.get(h);
    return {
      key: String(h),
      label: hourLabel(h),
      tick: h % 3 === 0 ? hourLabel(h) : null,
      back: b ? b.revenue : null,
      front: b ? b.grossProfit : null,
    };
  });
}

/** Data grafik Laporan dari seri server: belakang = omzet, depan = laba kotor (K21). */
export function reportChart(series: ReportSeries, running: boolean) {
  const hourly = series.kind === "jam";
  const nowKey = running
    ? (series.buckets.findLast((b) => b.revenue !== null)?.key ?? null)
    : null;
  const buckets = hourly
    ? hourBuckets(series.buckets, nowKey === null ? null : Number(nowKey))
    : dayBuckets(series.buckets);
  const peak = peakIndex(buckets, "back");
  const top = peak === null ? undefined : buckets[peak];
  const summary =
    top === undefined
      ? "Belum ada penjualan di periode ini"
      : `Paling ramai ${hourly ? `jam ${top.label}` : weekdayLabel(top.key)} · ${formatRupiahShort(top.back ?? 0)}`;
  return {
    buckets,
    nowKey,
    summary,
    title: `Omzet & laba kotor per ${hourly ? "jam" : "hari"}`,
    unit: hourly ? "jam" : "hari",
    keyHeader: hourly ? "Jam" : "Tanggal",
  };
}
