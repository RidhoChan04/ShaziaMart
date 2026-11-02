import type { HourBucket } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatRupiahShort } from "@/shared/lib/money";
import { hourWindow } from "./home-model";

export const CHART_HEIGHT = 160;
const PLOT_LEFT = 0;
/** Ruang di kanan plot untuk label sumbu nilai (mis. "Rp250 rb", 11px). */
const PLOT_RIGHT_MARGIN = 56;
/** Jarak label sumbu nilai dari tepi kanan plot. */
const TICK_GAP = 6;
/** Menyisakan ruang untuk label puncak di atas batang tertinggi. */
const PLOT_TOP = 20;
const PLOT_BOTTOM = 138;
const MIN_TOP = 100_000;
const BAR_RATIO = 0.66;
const TODAY_INSET = 3;
const PEAK_GAP = 4;
/** Perkiraan lebar satu karakter label puncak (11px semibold, sedikit dilebihkan). */
export const PEAK_CHAR_WIDTH = 6.5;
/** Perkiraan setengah lebar label jam "06.00" (11px), agar label paling kiri tidak terpotong. */
export const HOUR_LABEL_HALF = 16;

export const hourLabel = (hour: number) =>
  `${String(hour).padStart(2, "0")}.00`;

/** Batas atas sumbu: 1, 2, atau 5 × 10^k (mulai Rp100 rb) terkecil yang >= `max`. */
function niceTop(max: number): number {
  for (let base = MIN_TOP; ; base *= 10) {
    for (const factor of [1, 2, 5]) {
      if (base * factor >= max) return base * factor;
    }
  }
}

export type Bar = {
  hour: number;
  x: number;
  width: number;
  /** `null` untuk jam setelah jam sekarang atau bila belum ada penjualan. */
  today: {
    x: number;
    width: number;
    y: number;
    height: number;
    now: boolean;
  } | null;
  lastWeek: { y: number; height: number };
};

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

export type ChartRow = {
  hour: number;
  label: string;
  /** `null` untuk jam setelah jam sekarang. */
  today: number | null;
  lastWeek: number;
};

/** Semua yang dibutuhkan tampilan grafik, dalam piksel layar untuk lebar `width`. */
export function buildChart({
  hourly,
  nowHour,
  width,
}: {
  hourly: HourBucket[];
  nowHour: number;
  width: number;
}) {
  const { from, to } = hourWindow(hourly, nowHour);
  const hours = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const byHour = new Map(hourly.map((b) => [b.hour, b]));
  const today = (h: number) => byHour.get(h)?.revenue ?? 0;
  const lastWeek = (h: number) => byHour.get(h)?.lastWeekRevenue ?? 0;
  const lastTodayHour = Math.min(nowHour, to);

  const plot = {
    left: PLOT_LEFT,
    right: Math.max(width - PLOT_RIGHT_MARGIN, PLOT_LEFT + 1),
    top: PLOT_TOP,
    bottom: PLOT_BOTTOM,
  };
  const top = niceTop(
    Math.max(...hours.map((h) => Math.max(today(h), lastWeek(h)))),
  );
  const slot = (plot.right - plot.left) / hours.length;
  /** Titik tengah slot jam `h` (juga tengah batang). */
  const x = (h: number) => plot.left + (h - from + 0.5) * slot;
  const y = (v: number) => plot.bottom - (v / top) * (plot.bottom - plot.top);

  const peakRow = peakBucket(hourly, nowHour);
  const hasSales = peakRow !== null;
  const barWidth = slot * BAR_RATIO;
  const bars: Bar[] = hours.map((h) => {
    const base = {
      hour: h,
      x: x(h) - barWidth / 2,
      width: barWidth,
      lastWeek: {
        y: y(lastWeek(h)),
        height: plot.bottom - y(lastWeek(h)),
      },
    };
    if (!hasSales || h > lastTodayHour) return { ...base, today: null };
    return {
      ...base,
      today: {
        x: base.x + TODAY_INSET / 2,
        width: Math.max(barWidth - TODAY_INSET, 1),
        y: y(today(h)),
        height: plot.bottom - y(today(h)),
        now: h === lastTodayHour,
      },
    };
  });

  const peakLabel = peakRow === null ? "" : formatRupiahShort(peakRow.revenue);
  const peakHalf = (peakLabel.length * PEAK_CHAR_WIDTH) / 2;
  const peak =
    peakRow === null
      ? null
      : {
          hour: peakRow.hour,
          x: Math.min(
            Math.max(x(peakRow.hour), plot.left + peakHalf),
            Math.max(plot.right - peakHalf, plot.left),
          ),
          y: y(Math.max(peakRow.revenue, lastWeek(peakRow.hour))) - PEAK_GAP,
          label: peakLabel,
        };

  const clamp = (h: number) => Math.min(Math.max(h, from), to);

  return {
    plot,
    hours,
    bars,
    peak,
    ticks: [0, top / 2, top].map((value) => ({
      value,
      x: plot.right + TICK_GAP,
      y: y(value),
      label: formatRupiahShort(value),
    })),
    hourTicks: hours
      .filter((h) => h % 3 === 0)
      .map((h) => ({
        hour: h,
        x: Math.max(x(h), plot.left + HOUR_LABEL_HALF),
        label: hourLabel(h),
      })),
    x,
    y,
    clamp,
    /** Jam terdekat untuk posisi x (piksel) di dalam area gambar. */
    hourAt: (px: number) => clamp(from + Math.floor((px - plot.left) / slot)),
    row: (h: number): ChartRow => ({
      hour: h,
      label: hourLabel(h),
      today: h <= nowHour ? today(h) : null,
      lastWeek: lastWeek(h),
    }),
  };
}
