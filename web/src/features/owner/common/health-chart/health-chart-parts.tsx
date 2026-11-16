import { formatRupiah } from "@/shared/lib/money";
import type { HealthBucket } from "./health-chart-geometry";

export type HealthSeries = {
  /** Penanda seri di `data-series` / `data-swatch` (mis. `today`, `omzet`). */
  id: string;
  name: string;
  color: string;
  /** Warna batang bucket berjalan (hanya seri penekanan). */
  nowColor?: string;
};

/** Seri penekanan dulu: legenda, tooltip, pembacaan, dan kolom tabel memakai urutan ini. */
export type SeriesLine = { series: HealthSeries; pick: "back" | "front" };

/** Tooltip mulai menempel ke tepi bila titik tengahnya kurang dari ini (px). */
const TOOLTIP_HALF_WIDTH = 110;

/** Uang grafik: minus memakai U+2212 (laba bisa negatif). */
const money = (n: number) => (n < 0 ? `−${formatRupiah(-n)}` : formatRupiah(n));

function Swatch({ series }: { series: HealthSeries }) {
  return (
    <span
      aria-hidden
      data-swatch={series.id}
      className="inline-block size-2.5 shrink-0 rounded-[3px]"
      style={{ backgroundColor: series.color }}
    />
  );
}

export function Legend({ lines }: { lines: SeriesLine[] }) {
  return (
    <div
      data-testid="chart-legend"
      className="mt-2 flex gap-4 text-xs text-muted"
    >
      {lines.map(({ series }) => (
        <span key={series.id} className="inline-flex items-center gap-1.5">
          <Swatch series={series} />
          {series.name}
        </span>
      ))}
    </div>
  );
}

/** Nilai yang sudah terjadi di bucket ini, urut seri penekanan dulu. */
const valuesOf = (bucket: HealthBucket, lines: SeriesLine[]) =>
  lines.flatMap(({ series, pick }) => {
    const value = bucket[pick];
    return value === null ? [] : [{ series, value }];
  });

export function Tooltip({
  bucket,
  lines,
  left,
}: {
  bucket: HealthBucket;
  lines: SeriesLine[];
  /** Titik tengah tooltip (px dari tepi kiri grafik). */
  left: number;
}) {
  return (
    <div
      data-testid="chart-tooltip"
      aria-hidden
      className="pointer-events-none absolute top-0 whitespace-nowrap rounded-md border border-border bg-surface px-2 py-1 text-xs text-text shadow-sm"
      style={{
        left: `clamp(${TOOLTIP_HALF_WIDTH}px, ${left}px, 100% - ${TOOLTIP_HALF_WIDTH}px)`,
        transform: "translateX(-50%)",
      }}
    >
      <div className="num font-semibold">{bucket.label}</div>
      {valuesOf(bucket, lines).map(({ series, value }) => (
        <div key={series.id} className="num flex items-center gap-1.5">
          <Swatch series={series} />
          {`${series.name} ${money(value)}`}
        </div>
      ))}
    </div>
  );
}

/** Teks untuk live region: bucket yang sedang aktif. */
export function describeBucket(
  bucket: HealthBucket,
  lines: SeriesLine[],
): string {
  return [
    bucket.label,
    ...valuesOf(bucket, lines).map(
      ({ series, value }) => `${series.name} ${money(value)}`,
    ),
  ].join(", ");
}

export function DataTable({
  buckets,
  lines,
  caption,
  keyHeader,
}: {
  buckets: HealthBucket[];
  lines: SeriesLine[];
  caption: string;
  keyHeader: string;
}) {
  return (
    <table className="sr-only">
      <caption>{caption}</caption>
      <thead>
        <tr>
          <th>{keyHeader}</th>
          {lines.map(({ series }) => (
            <th key={series.id}>{series.name}</th>
          ))}
        </tr>
      </thead>
      <tbody>
        {buckets.map((bucket) => (
          <tr key={bucket.key}>
            <th scope="row">{bucket.label}</th>
            {lines.map(({ series, pick }) => {
              const value = bucket[pick];
              return (
                <td key={series.id}>{value === null ? "-" : money(value)}</td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
