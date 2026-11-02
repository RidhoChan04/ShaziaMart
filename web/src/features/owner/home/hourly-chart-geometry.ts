import type { HourBucket } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatRupiahShort } from "@/shared/lib/money";
import { hourWindow } from "./home-model";

export const CHART_HEIGHT = 160;
const PLOT_LEFT = 58;
/** Ruang di kanan plot untuk label ujung garis. */
const PLOT_RIGHT_MARGIN = 70;
/** Menyisakan ruang untuk label puncak di atas batang tertinggi. */
const PLOT_TOP = 20;
const PLOT_BOTTOM = 138;
const LABEL_GAP = 12;
const LABEL_OFFSET = 8;
const MIN_TOP = 100_000;
const BAR_RATIO = 0.66;
const TODAY_INSET = 3;
const PEAK_GAP = 4;
/** Perkiraan lebar satu karakter label puncak (font 9.5px). */
const PEAK_CHAR_WIDTH = 5.5;

export const hourLabel = (hour: number) =>
  `${String(hour).padStart(2, "0")}.00`;
const round = (n: number) => Math.round(n * 10) / 10;

/** Batas atas sumbu: 1, 2, atau 5 × 10^k (mulai Rp100 rb) terkecil yang >= `max`. */
function niceTop(max: number): number {
  for (let base = MIN_TOP; ; base *= 10) {
    for (const factor of [1, 2, 5]) {
      if (base * factor >= max) return base * factor;
    }
  }
}

/** Geser dua label agar berjarak >= LABEL_GAP tanpa keluar dari plot. */
function separate(a: number, b: number): [number, number] {
  if (Math.abs(a - b) >= LABEL_GAP) return [a, b];
  const upper = Math.min(
    Math.max((a + b) / 2 - LABEL_GAP / 2, PLOT_TOP + LABEL_GAP / 2),
    PLOT_BOTTOM - LABEL_GAP,
  );
  const lower = upper + LABEL_GAP;
  return a <= b ? [upper, lower] : [lower, upper];
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
  const todayHours = hours.filter((h) => h <= lastTodayHour);

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
  const path = (hs: number[], value: (h: number) => number) =>
    hs
      .map(
        (h, i) => `${i === 0 ? "M" : "L"}${round(x(h))} ${round(y(value(h)))}`,
      )
      .join(" ");

  const lastWeekY = y(lastWeek(to));
  const [todayLabelY, lastWeekLabelY] =
    todayHours.length > 0
      ? separate(y(today(lastTodayHour)), lastWeekY)
      : [null, lastWeekY];

  const hasSales = peakBucket(hourly, nowHour) !== null;
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

  const peakRow = peakBucket(hourly, nowHour);
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
      y: y(value),
      label: formatRupiahShort(value),
    })),
    hourTicks: hours
      .filter((h) => h % 3 === 0)
      .map((h) => ({ hour: h, x: x(h), label: hourLabel(h) })),
    todayPath: todayHours.length > 0 ? path(todayHours, today) : null,
    lastWeekPath: path(hours, lastWeek),
    endLabels: {
      today:
        todayLabelY === null
          ? null
          : { x: x(lastTodayHour) + LABEL_OFFSET, y: todayLabelY },
      lastWeek: { x: x(to) + LABEL_OFFSET, y: lastWeekLabelY },
    },
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
