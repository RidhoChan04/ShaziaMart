import {
  type KeyboardEvent,
  type PointerEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { HourBucket } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { buildChart, CHART_HEIGHT } from "./hourly-chart-geometry";
import {
  DataTable,
  describeRow,
  Legend,
  TODAY_NAME,
  Tooltip,
} from "./hourly-chart-parts";

const FALLBACK_WIDTH = 360;

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
    // Sentuh/klik di plot memfokuskan grup ini; blur menyembunyikan tooltip.
    // biome-ignore lint/a11y/useSemanticElements: fieldset membawa gaya bawaan; grup berlabel cukup bagi pembaca layar
    <div
      ref={ref}
      role="group"
      aria-label={`Omzet per jam hari ini dan ${lastWeekName}`}
      // biome-ignore lint/a11y/noNoninteractiveTabindex: grup harus bisa difokus agar crosshair bergerak dengan panah
      tabIndex={0}
      className="relative"
      onKeyDown={onKeyDown}
      onBlur={() => setActive(null)}
    >
      <Legend lastWeekName={lastWeekName} />
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
              x={plot.left - 6}
              y={t.y}
              textAnchor="end"
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
        <path
          d={chart.lastWeekPath}
          fill="none"
          stroke="var(--color-chart-2)"
          strokeWidth={2}
          strokeDasharray="4 3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {chart.todayPath !== null && (
          <path
            d={chart.todayPath}
            fill="none"
            stroke="var(--color-chart-1)"
            strokeWidth={2}
            strokeLinejoin="round"
            strokeLinecap="round"
          />
        )}
        {chart.endLabels.today && (
          <text
            data-end-label
            {...chart.endLabels.today}
            dominantBaseline="central"
            fontSize={11}
            className="fill-text"
          >
            {TODAY_NAME}
          </text>
        )}
        <text
          data-end-label
          {...chart.endLabels.lastWeek}
          dominantBaseline="central"
          fontSize={11}
          className="fill-text"
        >
          {lastWeekName}
        </text>
        {activeRow && (
          <g pointerEvents="none">
            <line
              x1={chart.x(activeRow.hour)}
              x2={chart.x(activeRow.hour)}
              y1={plot.top}
              y2={plot.bottom}
              stroke="var(--color-muted)"
            />
            {[
              { value: activeRow.lastWeek, color: "var(--color-chart-2)" },
              ...(activeRow.today === null
                ? []
                : [{ value: activeRow.today, color: "var(--color-chart-1)" }]),
            ].map((dot) => (
              <circle
                key={dot.color}
                cx={chart.x(activeRow.hour)}
                cy={chart.y(dot.value)}
                r={5}
                fill={dot.color}
                stroke="var(--color-surface)"
                strokeWidth={2}
              />
            ))}
          </g>
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
      <div className="sr-only" aria-live="polite" data-testid="chart-live">
        {activeRow && describeRow(activeRow, lastWeekName)}
      </div>
      <DataTable
        rows={chart.hours.map(chart.row)}
        lastWeekName={lastWeekName}
      />
    </div>
  );
}
