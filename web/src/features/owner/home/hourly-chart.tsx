import {
  type KeyboardEvent,
  type PointerEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { HourBucket } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { buildChart, CHART_HEIGHT, peakSummary } from "./hourly-chart-geometry";
import { DataTable, describeRow, Legend, Tooltip } from "./hourly-chart-parts";

const FALLBACK_WIDTH = 360;
const BAR_RADIUS = 3;
/** Batang selain jam aktif diredupkan agar jam aktif menonjol. */
const DIMMED_OPACITY = 0.35;

/** Lebar elemen dalam piksel; 360 bila tidak terukur (jsdom). */
function useWidth() {
  const ref = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(FALLBACK_WIDTH);
  // Ukur sebelum layar dilukis agar frame pertama tidak tergambar selebar 360.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const update = (raw: number) => {
      const w = Math.round(raw);
      if (w > 0) setWidth(w);
    };
    update(el.getBoundingClientRect().width);
    if (typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(([entry]) =>
      update(entry?.contentRect.width ?? 0),
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return [ref, width] as const;
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
  const [ref, width] = useWidth();
  const chart = useMemo(
    () => buildChart({ hourly, nowHour, width }),
    [hourly, nowHour, width],
  );
  const { plot } = chart;
  const lastWeekName = `${weekday} lalu`;
  const activeRow = active === null ? null : chart.row(active);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const delta = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (delta !== undefined) {
      e.preventDefault();
      // Tekan pertama menampilkan jam sekarang, berikutnya bergeser.
      setActive(chart.clamp(active === null ? nowHour : active + delta));
    } else if (e.key === "Escape") {
      setActive(null);
    }
  }

  function onPointer(e: PointerEvent<SVGRectElement>) {
    const box = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (box) setActive(chart.hourAt(e.clientX - box.left));
  }

  const text = { fontSize: 11, className: "num fill-muted" } as const;

  return (
    <>
      <p className="mb-2 text-[13px] text-muted">
        {peakSummary(hourly, nowHour)}
      </p>
      {/* Sentuh/klik di plot memfokuskan grup ini; blur menyembunyikan tooltip. */}
      {/* biome-ignore lint/a11y/useSemanticElements: fieldset membawa gaya bawaan; grup berlabel cukup bagi pembaca layar */}
      <div
        ref={ref}
        role="group"
        aria-label={`Omzet per jam hari ini dan ${lastWeekName}`}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: grup harus bisa difokus agar jam aktif bergerak dengan panah
        tabIndex={0}
        className="relative rounded-md"
        onKeyDown={onKeyDown}
        onBlur={() => setActive(null)}
      >
        <svg
          aria-hidden
          viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
          className="block w-full select-none"
          style={{ height: CHART_HEIGHT, touchAction: "pan-y" }}
        >
          {chart.ticks.map((t) => (
            <g key={t.value}>
              <line
                x1={plot.left}
                x2={plot.right}
                y1={t.y}
                y2={t.y}
                stroke="var(--color-border)"
              />
              <text
                x={t.x}
                y={t.y}
                textAnchor="start"
                dominantBaseline="central"
                {...text}
              >
                {t.label}
              </text>
            </g>
          ))}
          {chart.hourTicks.map((t) => (
            <text
              key={t.hour}
              x={t.x}
              y={CHART_HEIGHT - 6}
              textAnchor="middle"
              {...text}
            >
              {t.label}
            </text>
          ))}
          {chart.bars.map((bar) => (
            <g
              key={bar.hour}
              data-hour={bar.hour}
              data-active={active === bar.hour ? "true" : undefined}
              opacity={
                active !== null && active !== bar.hour
                  ? DIMMED_OPACITY
                  : undefined
              }
              className="transition-opacity duration-150 motion-reduce:transition-none"
            >
              <rect
                data-series="last-week"
                x={bar.x}
                y={bar.lastWeek.y}
                width={bar.width}
                height={bar.lastWeek.height}
                rx={BAR_RADIUS}
                fill="var(--color-chart-2)"
              />
              {bar.today && (
                <rect
                  data-series="today"
                  x={bar.today.x}
                  y={bar.today.y}
                  width={bar.today.width}
                  height={bar.today.height}
                  rx={BAR_RADIUS}
                  fill={
                    bar.today.now
                      ? "var(--color-chart-1-now)"
                      : "var(--color-chart-1)"
                  }
                />
              )}
            </g>
          ))}
          {chart.peak && (
            <text
              data-peak
              x={chart.peak.x}
              y={chart.peak.y}
              textAnchor="middle"
              fontSize={11}
              fontWeight={600}
              className="num fill-text"
            >
              {chart.peak.label}
            </text>
          )}
          <rect
            data-testid="chart-plot"
            x={plot.left}
            y={plot.top}
            width={plot.right - plot.left}
            height={plot.bottom - plot.top}
            fill="transparent"
            onPointerDown={onPointer}
            onPointerMove={onPointer}
            onPointerLeave={(e) => {
              if (e.pointerType !== "touch") setActive(null);
            }}
          />
        </svg>
        {activeRow && (
          <Tooltip
            row={activeRow}
            lastWeekName={lastWeekName}
            left={chart.x(activeRow.hour)}
          />
        )}
        <Legend lastWeekName={lastWeekName} />
        <div className="sr-only" aria-live="polite" data-testid="chart-live">
          {activeRow && describeRow(activeRow, lastWeekName)}
        </div>
        <DataTable
          rows={chart.hours.map(chart.row)}
          lastWeekName={lastWeekName}
        />
      </div>
    </>
  );
}
