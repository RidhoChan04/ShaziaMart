import { formatRupiahShort } from "@/shared/lib/money";

/** Satu slot grafik (jam atau tanggal); `null` = belum terjadi (tanpa batang, tabel `-`). */
export type HealthBucket = {
  key: string;
  /** Nama slot di tooltip, pembacaan, dan tabel (`10.00`, `4 Nov`). */
  label: string;
  /** Label sumbu waktu di bawah slot ini; `null` = tanpa label. */
  tick: string | null;
  back: number | null;
  front: number | null;
};

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
/** Batang depan lebih sempit agar batang belakang tetap terlihat di kedua sisinya. */
const FRONT_INSET = 3;
/**
 * Di bawah lebar ini (mis. bulan 30 hari di HP, ±5 px) sisipan 3 px membuat batang depan jadi
 * titik; batang depan lalu selebar batang belakang (seperti mockup). Batang jam Beranda ≥ 9,9 px.
 */
const MIN_INSET_BAR = 8;
const PEAK_GAP = 4;
/** Perkiraan lebar satu karakter label puncak (11px semibold, sedikit dilebihkan). */
export const PEAK_CHAR_WIDTH = 6.5;
/** Perkiraan setengah lebar satu karakter label sumbu waktu (11px): "06.00" → 16 px. */
const TICK_CHAR_HALF = 3.2;

/** Batas atas sumbu: 1, 2, atau 5 × 10^k (mulai Rp100 rb) terkecil yang >= `max`. */
function niceTop(max: number): number {
  for (let base = MIN_TOP; ; base *= 10) {
    for (const factor of [1, 2, 5]) {
      if (base * factor >= max) return base * factor;
    }
  }
}

/** Label jam sumbu & tabel: `9` → `09.00`. */
export const hourLabel = (hour: number) =>
  `${String(hour).padStart(2, "0")}.00`;

type Series = "back" | "front";

const hasPositive = (buckets: HealthBucket[], s: Series) =>
  buckets.some((b) => (b[s] ?? 0) > 0);

/** Bucket dengan nilai seri `s` terbesar (> 0); seri → bucket paling awal. */
export function peakIndex(buckets: HealthBucket[], s: Series): number | null {
  let best: number | null = null;
  buckets.forEach((b, i) => {
    const v = b[s];
    if (v === null || v <= 0) return;
    if (best === null || v > (buckets[best]?.[s] ?? 0)) best = i;
  });
  return best;
}

export type HealthBar = {
  key: string;
  x: number;
  width: number;
  now: boolean;
  /** `null` bila bucket belum terjadi atau seri tidak punya nilai positif sama sekali. */
  back: { y: number; height: number } | null;
  /**
   * Kotak isi batang depan. Dengan garis tepi, kotak ini sudah digeser setengah `stroke` ke dalam
   * sehingga sisi luar stroke tepat di tepi batang (tidak keluar batang, celah antarbatang tetap).
   */
  front: {
    x: number;
    width: number;
    y: number;
    height: number;
    /** Lebar garis tepi (px); 0 = tanpa garis tepi. */
    stroke: number;
  } | null;
};

/** Isi muda yang wajib tetap tampak di dalam garis tepi (px, tinggi). */
const MIN_FILL = 2;

/**
 * Garis tepi batang depan selebar `outline`, paling banyak sepertiga lebar batang (rentang 92 hari
 * di HP) agar isi tetap tampak; kotak digeser setengah stroke ke dalam. Batang yang lebih pendek
 * dari 2 × stroke + 2 px (laba sangat kecil, setinggi 0) tanpa garis tepi agar isi mudanya tidak
 * tertutup; batasnya terhadap batang omzet di atasnya tetap 3,46:1.
 */
function outlined(
  box: { x: number; width: number; y: number; height: number },
  outline: number,
) {
  const thin = Math.min(outline, box.width / 3);
  const stroke = box.height >= 2 * thin + MIN_FILL ? thin : 0;
  return {
    x: box.x + stroke / 2,
    width: box.width - stroke,
    y: box.y + stroke / 2,
    height: box.height - stroke,
    stroke,
  };
}

/**
 * Semua yang dibutuhkan grafik Health dua seri, dalam piksel untuk lebar `width`: belakang
 * selebar batang, depan 3 px lebih sempit (selebar batang bila batang < 8 px); nilai negatif
 * digambar 0 (tabel memakai angka asli). `frontOutline` > 0 memberi batang depan garis tepi
 * (Laporan: laba kotor) yang tetap di dalam batang.
 */
export function healthGeometry({
  buckets,
  emphasis,
  nowKey,
  width,
  peakLabel,
  frontOutline = 0,
}: {
  buckets: HealthBucket[];
  emphasis: Series;
  nowKey: string | null;
  width: number;
  peakLabel: (value: number) => string;
  frontOutline?: number;
}) {
  const count = Math.max(buckets.length, 1);
  const plot = {
    left: PLOT_LEFT,
    right: Math.max(width - PLOT_RIGHT_MARGIN, PLOT_LEFT + 1),
    top: PLOT_TOP,
    bottom: PLOT_BOTTOM,
  };
  const top = niceTop(
    Math.max(0, ...buckets.flatMap((b) => [b.back ?? 0, b.front ?? 0])),
  );
  const slot = (plot.right - plot.left) / count;
  /** Titik tengah slot ke-`i` (juga tengah batang). */
  const x = (i: number) => plot.left + (i + 0.5) * slot;
  const y = (v: number) => plot.bottom - (v / top) * (plot.bottom - plot.top);
  const bar = (v: number) => {
    const at = y(Math.max(v, 0));
    return { y: at, height: plot.bottom - at };
  };

  const show = {
    back: hasPositive(buckets, "back"),
    front: hasPositive(buckets, "front"),
  };
  const barWidth = slot * BAR_RATIO;
  const inset = barWidth >= MIN_INSET_BAR ? FRONT_INSET : 0;
  const bars: HealthBar[] = buckets.map((b, i) => {
    const left = x(i) - barWidth / 2;
    return {
      key: b.key,
      x: left,
      width: barWidth,
      now: b.key === nowKey,
      back: show.back && b.back !== null ? bar(b.back) : null,
      front:
        show.front && b.front !== null
          ? outlined(
              {
                x: left + inset / 2,
                width: Math.max(barWidth - inset, 1),
                ...bar(b.front),
              },
              frontOutline,
            )
          : null,
    };
  });

  const peakAt = peakIndex(buckets, emphasis);
  const peakBucket = peakAt === null ? undefined : buckets[peakAt];
  const peak =
    peakAt === null || peakBucket === undefined
      ? null
      : (() => {
          const label = peakLabel(peakBucket[emphasis] ?? 0);
          const half = (label.length * PEAK_CHAR_WIDTH) / 2;
          return {
            index: peakAt,
            x: Math.min(
              Math.max(x(peakAt), plot.left + half),
              Math.max(plot.right - half, plot.left),
            ),
            y:
              y(Math.max(peakBucket.back ?? 0, peakBucket.front ?? 0)) -
              PEAK_GAP,
            label,
          };
        })();

  const clamp = (i: number) => Math.min(Math.max(i, 0), count - 1);

  return {
    plot,
    bars,
    peak,
    ticks: [0, top / 2, top].map((value) => ({
      value,
      x: plot.right + TICK_GAP,
      y: y(value),
      label: formatRupiahShort(value),
    })),
    axisTicks: buckets.flatMap((b, i) =>
      b.tick === null
        ? []
        : [
            {
              index: i,
              x: Math.max(x(i), plot.left + b.tick.length * TICK_CHAR_HALF),
              label: b.tick,
            },
          ],
    ),
    x,
    y,
    clamp,
    /** Bucket terdekat untuk posisi x (piksel) di dalam area gambar. */
    indexAt: (px: number) => clamp(Math.floor((px - plot.left) / slot)),
  };
}
