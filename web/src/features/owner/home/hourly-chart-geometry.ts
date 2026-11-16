import type { HourBucket } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatRupiahShort } from "@/shared/lib/money";
import {
  type HealthBucket,
  healthGeometry,
  hourLabel,
} from "../common/health-chart/health-chart-geometry";
import { hourWindow } from "./home-model";

export { PEAK_CHAR_WIDTH } from "../common/health-chart/health-chart-geometry";
/** Perkiraan setengah lebar label jam "06.00" (11px), agar label paling kiri tidak terpotong. */
export const HOUR_LABEL_HALF = 16;

/** Jam dengan omzet hari ini tertinggi s/d `nowHour`; seri -> jam paling awal. */
function peakBucket(hourly: HourBucket[], nowHour: number) {
  let best: HourBucket | null = null;
  for (const b of hourly) {
    if (b.hour > nowHour || b.revenue <= 0) continue;
    if (
      best === null ||
      b.revenue > best.revenue ||
      (b.revenue === best.revenue && b.hour < best.hour)
    )
      best = b;
  }
  return best;
}

export function peakSummary(hourly: HourBucket[], nowHour: number): string {
  const peak = peakBucket(hourly, nowHour);
  return peak === null
    ? "Belum ada penjualan hari ini"
    : `Paling ramai jam ${hourLabel(peak.hour)} · ${formatRupiahShort(peak.revenue)}`;
}

/**
 * Data Beranda untuk `HealthChart`: satu bucket per jam jendela, belakang = minggu lalu, depan =
 * hari ini (null setelah jam sekarang); bucket berjalan = jam sekarang yang dijepit ke jendela.
 */
export function hourlyBuckets(hourly: HourBucket[], nowHour: number) {
  const { from, to } = hourWindow(hourly, nowHour);
  const hours = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const byHour = new Map(hourly.map((b) => [b.hour, b]));
  const buckets = hours.map(
    (h): HealthBucket => ({
      key: String(h),
      label: hourLabel(h),
      tick: h % 3 === 0 ? hourLabel(h) : null,
      back: byHour.get(h)?.lastWeekRevenue ?? 0,
      front: h <= nowHour ? (byHour.get(h)?.revenue ?? 0) : null,
    }),
  );
  const nowKey = nowHour >= from ? String(Math.min(nowHour, to)) : null;
  return { from, hours, buckets, nowKey };
}

/** Geometri grafik Beranda dalam satuan jam (dibungkus dari geometri `HealthChart`). */
export function buildChart({
  hourly,
  nowHour,
  width,
}: {
  hourly: HourBucket[];
  nowHour: number;
  width: number;
}) {
  const { from, hours, buckets, nowKey } = hourlyBuckets(hourly, nowHour);
  const geo = healthGeometry({
    buckets,
    emphasis: "front",
    nowKey,
    width,
    peakLabel: formatRupiahShort,
  });
  const { plot } = geo;
  const lastWeek = (h: number) => buckets[h - from]?.back ?? 0;
  return {
    plot,
    hours,
    bars: geo.bars.map((bar, i) => {
      const hour = from + i;
      const y = geo.y(lastWeek(hour));
      return {
        hour,
        x: bar.x,
        width: bar.width,
        lastWeek: { y, height: plot.bottom - y },
        today: bar.front ? { ...bar.front, now: bar.now } : null,
      };
    }),
    peak: geo.peak && {
      hour: from + geo.peak.index,
      x: geo.peak.x,
      y: geo.peak.y,
      label: geo.peak.label,
    },
    ticks: geo.ticks,
    hourTicks: geo.axisTicks.map((t) => ({
      hour: from + t.index,
      x: t.x,
      label: t.label,
    })),
    x: (h: number) => geo.x(h - from),
    y: geo.y,
    clamp: (h: number) => from + geo.clamp(h - from),
    /** Jam terdekat untuk posisi x (piksel) di dalam area gambar. */
    hourAt: (px: number) => from + geo.indexAt(px),
    row: (h: number) => ({
      hour: h,
      label: hourLabel(h),
      today: buckets[h - from]?.front ?? null,
      lastWeek: lastWeek(h),
    }),
  };
}
