import type { HourBucket } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatRupiahShort } from "@/shared/lib/money";
import { hourWindow } from "./home-model";

export const CHART_HEIGHT = 160;
const PLOT_LEFT = 58;
/** Ruang di kanan plot untuk label ujung garis. */
const PLOT_RIGHT_MARGIN = 70;
const PLOT_TOP = 10;
const PLOT_BOTTOM = 138;
const LABEL_GAP = 12;
const LABEL_OFFSET = 8;
const MIN_TOP = 100_000;

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
  const span = Math.max(to - from, 1);
  const x = (h: number) =>
    plot.left + ((h - from) / span) * (plot.right - plot.left);
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

  const clamp = (h: number) => Math.min(Math.max(h, from), to);

  return {
    plot,
    hours,
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
    hourAt: (px: number) =>
      clamp(
        from + Math.round(((px - plot.left) / (plot.right - plot.left)) * span),
      ),
    row: (h: number): ChartRow => ({
      hour: h,
      label: hourLabel(h),
      today: h <= nowHour ? today(h) : null,
      lastWeek: lastWeek(h),
    }),
  };
}
