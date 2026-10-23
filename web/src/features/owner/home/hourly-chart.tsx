import { type KeyboardEvent, type PointerEvent, useState } from "react";
import type { HourBucket } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { formatRupiah, formatRupiahShort } from "@/shared/lib/money";
import { hourWindow } from "./home-model";

const WIDTH = 360;
const HEIGHT = 160;
const PLOT = { left: 58, right: 290, top: 10, bottom: 138 };
const LABEL_GAP = 12;
const LABEL_OFFSET = 8;
const MIN_TOP = 100_000;
const TODAY_NAME = "Hari ini";
const TODAY_SWATCH = "h-0.5 bg-chart-1";
const LAST_WEEK_SWATCH = "border-t-2 border-dashed border-chart-2";

const hourLabel = (hour: number) => `${String(hour).padStart(2, "0")}.00`;
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
    Math.max((a + b) / 2 - LABEL_GAP / 2, PLOT.top + LABEL_GAP / 2),
    PLOT.bottom - LABEL_GAP,
  );
  const lower = upper + LABEL_GAP;
  return a <= b ? [upper, lower] : [lower, upper];
}

function Swatch({ className }: { className: string }) {
  return <span aria-hidden className={`inline-block w-5 ${className}`} />;
}

export function HourlyChart({
  hourly,
  weekday,
  nowHour,
}: {
  hourly: HourBucket[];
  weekday: string;
  nowHour: number;
}) {
  const [active, setActive] = useState<number | null>(null);
  const { from, to } = hourWindow(hourly, nowHour);
  const hours = Array.from({ length: to - from + 1 }, (_, i) => from + i);
  const byHour = new Map(hourly.map((b) => [b.hour, b]));
  const today = (h: number) => byHour.get(h)?.revenue ?? 0;
  const lastWeek = (h: number) => byHour.get(h)?.lastWeekRevenue ?? 0;
  const lastTodayHour = Math.min(nowHour, to);
  const todayHours = hours.filter((h) => h <= lastTodayHour);
  const lastWeekName = `${weekday} lalu`;

  const top = niceTop(
    Math.max(...hours.map((h) => Math.max(today(h), lastWeek(h)))),
  );
  const span = Math.max(to - from, 1);
  const x = (h: number) =>
    PLOT.left + ((h - from) / span) * (PLOT.right - PLOT.left);
  const y = (v: number) => PLOT.bottom - (v / top) * (PLOT.bottom - PLOT.top);
  const line = (hs: number[], value: (h: number) => number) =>
    hs
      .map(
        (h, i) => `${i === 0 ? "M" : "L"}${round(x(h))} ${round(y(value(h)))}`,
      )
      .join(" ");

  const [todayLabelY, lastWeekLabelY] =
    todayHours.length > 0
      ? separate(y(today(lastTodayHour)), y(lastWeek(to)))
      : [null, y(lastWeek(to))];

  const clamp = (h: number) => Math.min(Math.max(h, from), to);

  function onKeyDown(e: KeyboardEvent<SVGSVGElement>) {
    const delta = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (delta !== undefined) {
      e.preventDefault();
      // Tekan pertama menampilkan jam sekarang, berikutnya bergeser.
      setActive(clamp(active === null ? nowHour : active + delta));
    } else if (e.key === "Escape") {
      setActive(null);
    }
  }

  function onPointer(e: PointerEvent<SVGRectElement>) {
    const box = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (!box || box.width === 0) return;
    const vx = ((e.clientX - box.left) * WIDTH) / box.width;
    const fraction = (vx - PLOT.left) / (PLOT.right - PLOT.left);
    setActive(clamp(from + Math.round(fraction * span)));
  }

  const tooltipRows =
    active === null
      ? []
      : [
          ...(active <= nowHour
            ? [{ name: TODAY_NAME, swatch: TODAY_SWATCH, value: today(active) }]
            : []),
          {
            name: lastWeekName,
            swatch: LAST_WEEK_SWATCH,
            value: lastWeek(active),
          },
        ];

  return (
    <div className="relative">
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
      <svg
        role="img"
        aria-label={`Omzet per jam hari ini dan ${lastWeekName}`}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: plot harus bisa difokus agar crosshair bergerak dengan panah
        tabIndex={0}
        viewBox={`0 0 ${WIDTH} ${HEIGHT}`}
        className="block w-full select-none"
        style={{ touchAction: "pan-y" }}
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
      >
        {[0, top / 2, top].map((v) => (
          <g key={v}>
            <line
              x1={PLOT.left}
              x2={PLOT.right}
              y1={y(v)}
              y2={y(v)}
              stroke="var(--color-border)"
            />
            <text
              x={PLOT.left - 6}
              y={y(v)}
              textAnchor="end"
              dominantBaseline="central"
              fontSize={11}
              className="num fill-muted"
            >
              {formatRupiahShort(v)}
            </text>
          </g>
        ))}
        {hours
          .filter((h) => h % 3 === 0)
          .map((h) => (
            <text
              key={h}
              x={x(h)}
              y={HEIGHT - 6}
              textAnchor="middle"
              fontSize={11}
              className="num fill-muted"
            >
              {hourLabel(h)}
            </text>
          ))}
        <path
          d={line(hours, lastWeek)}
          fill="none"
          stroke="var(--color-chart-2)"
          strokeWidth={2}
          strokeDasharray="4 3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {todayLabelY !== null && (
          <>
            <path
              d={line(todayHours, today)}
              fill="none"
              stroke="var(--color-chart-1)"
              strokeWidth={2}
              strokeLinejoin="round"
              strokeLinecap="round"
            />
            <text
              data-end-label
              x={x(lastTodayHour) + LABEL_OFFSET}
              y={todayLabelY}
              dominantBaseline="central"
              fontSize={11}
              className="fill-text"
            >
              {TODAY_NAME}
            </text>
          </>
        )}
        <text
          data-end-label
          x={x(to) + LABEL_OFFSET}
          y={lastWeekLabelY}
          dominantBaseline="central"
          fontSize={11}
          className="fill-text"
        >
          {lastWeekName}
        </text>
        {active !== null && (
          <g pointerEvents="none">
            <line
              x1={x(active)}
              x2={x(active)}
              y1={PLOT.top}
              y2={PLOT.bottom}
              stroke="var(--color-muted)"
            />
            <circle
              cx={x(active)}
              cy={y(lastWeek(active))}
              r={5}
              fill="var(--color-chart-2)"
              stroke="var(--color-surface)"
              strokeWidth={2}
            />
            {active <= nowHour && (
              <circle
                cx={x(active)}
                cy={y(today(active))}
                r={5}
                fill="var(--color-chart-1)"
                stroke="var(--color-surface)"
                strokeWidth={2}
              />
            )}
          </g>
        )}
        <rect
          data-testid="chart-plot"
          x={PLOT.left}
          y={PLOT.top}
          width={PLOT.right - PLOT.left}
          height={PLOT.bottom - PLOT.top}
          fill="transparent"
          onPointerDown={onPointer}
          onPointerMove={onPointer}
          onPointerLeave={(e) => {
            if (e.pointerType !== "touch") setActive(null);
          }}
        />
      </svg>
      {active !== null && (
        <div
          data-testid="chart-tooltip"
          aria-hidden
          className="pointer-events-none absolute top-6 whitespace-nowrap rounded-md border border-border bg-surface px-2 py-1 text-xs text-text shadow-sm"
          style={{
            left: `${(x(active) / WIDTH) * 100}%`,
            transform: `translateX(${x(active) < WIDTH / 2 ? "8px" : "calc(-100% - 8px)"})`,
          }}
        >
          <div className="num font-semibold">{hourLabel(active)}</div>
          {tooltipRows.map((r) => (
            <div key={r.name} className="num flex items-center gap-1.5">
              <Swatch className={r.swatch} />
              {`${r.name} ${formatRupiah(r.value)}`}
            </div>
          ))}
        </div>
      )}
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
          {hours.map((h) => (
            <tr key={h}>
              <th scope="row">{hourLabel(h)}</th>
              <td>{h <= nowHour ? formatRupiah(today(h)) : "-"}</td>
              <td>{formatRupiah(lastWeek(h))}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
