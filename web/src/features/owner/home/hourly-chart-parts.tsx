import { formatRupiah } from "@/shared/lib/money";
import type { ChartRow } from "./hourly-chart-geometry";

export const TODAY_NAME = "Hari ini";
const TODAY_SWATCH = "h-0.5 bg-chart-1";
/** Perkiraan setengah lebar tooltip, agar tidak keluar dari kartu. */
const TOOLTIP_HALF_WIDTH = 100;
const LAST_WEEK_SWATCH = "border-t-2 border-dashed border-chart-2";

function Swatch({ className }: { className: string }) {
  return <span aria-hidden className={`inline-block w-5 ${className}`} />;
}

export function Legend({ lastWeekName }: { lastWeekName: string }) {
  return (
    <div className="flex gap-4 pb-1 text-[11px] text-muted">
      <span className="inline-flex items-center gap-1.5">
        <Swatch className={TODAY_SWATCH} />
        {TODAY_NAME}
      </span>
      <span className="inline-flex items-center gap-1.5">
        <Swatch className={LAST_WEEK_SWATCH} />
        {lastWeekName}
      </span>
    </div>
  );
}

export function Tooltip({
  row,
  lastWeekName,
  left,
}: {
  row: ChartRow;
  lastWeekName: string;
  /** Titik tengah tooltip (px dari tepi kiri grafik). */
  left: number;
}) {
  const lines = [
    ...(row.today === null
      ? []
      : [{ name: TODAY_NAME, swatch: TODAY_SWATCH, value: row.today }]),
    { name: lastWeekName, swatch: LAST_WEEK_SWATCH, value: row.lastWeek },
  ];
  return (
    <div
      data-testid="chart-tooltip"
      aria-hidden
      className="pointer-events-none absolute top-6 whitespace-nowrap rounded-md border border-border bg-surface px-2 py-1 text-xs text-text shadow-sm"
      style={{
        left: `clamp(${TOOLTIP_HALF_WIDTH}px, ${left}px, 100% - ${TOOLTIP_HALF_WIDTH}px)`,
        transform: "translateX(-50%)",
      }}
    >
      <div className="num font-semibold">{row.label}</div>
      {lines.map((l) => (
        <div key={l.name} className="num flex items-center gap-1.5">
          <Swatch className={l.swatch} />
          {`${l.name} ${formatRupiah(l.value)}`}
        </div>
      ))}
    </div>
  );
}

/** Teks untuk live region: titik yang sedang aktif. */
export function describeRow(row: ChartRow, lastWeekName: string): string {
  return [
    row.label,
    ...(row.today === null ? [] : [`${TODAY_NAME} ${formatRupiah(row.today)}`]),
    `${lastWeekName} ${formatRupiah(row.lastWeek)}`,
  ].join(", ");
}

export function DataTable({
  rows,
  lastWeekName,
}: {
  rows: ChartRow[];
  lastWeekName: string;
}) {
  return (
    <table className="sr-only">
      <caption>Omzet per jam</caption>
      <thead>
        <tr>
          <th>Jam</th>
          <th>{TODAY_NAME}</th>
          <th>{lastWeekName}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr key={row.hour}>
            <th scope="row">{row.label}</th>
            <td>{row.today === null ? "-" : formatRupiah(row.today)}</td>
            <td>{formatRupiah(row.lastWeek)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
