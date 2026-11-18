import {
  type KeyboardEvent,
  type PointerEvent,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import {
  CHART_HEIGHT,
  type HealthBucket,
  healthGeometry,
} from "./health-chart-geometry";
import {
  DataTable,
  describeBucket,
  type HealthSeries,
  Legend,
  OUTLINE_WIDTH,
  type SeriesLine,
  Tooltip,
} from "./health-chart-parts";

export type { HealthBucket } from "./health-chart-geometry";
export type { HealthSeries } from "./health-chart-parts";

const FALLBACK_WIDTH = 360;
const BAR_RADIUS = 3;
/** Batang selain bucket aktif diredupkan agar bucket aktif menonjol. */
const DIMMED_OPACITY = 0.35;
/** Bucket per jam (`"0"`–`"23"`) juga diberi `data-hour`, penanda lama grafik Beranda. */
const HOUR_KEY = /^\d{1,2}$/;

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

/**
 * Grafik batang gaya Health dua seri (Beranda: minggu lalu + hari ini; Laporan: omzet + laba
 * kotor). Kontrak a11y: grup fokus berlabel, panah/sentuh memindah bucket aktif dengan tooltip
 * dan pembacaan live, tabel sr-only; SVG disembunyikan dari pembaca layar.
 */
export function HealthChart({
  buckets,
  back,
  front,
  emphasis,
  nowKey,
  groupLabel,
  caption,
  keyHeader,
  summary,
  peakLabel,
}: {
  buckets: HealthBucket[];
  /** Garis tepi hanya untuk seri depan. */
  back: HealthSeries & { outline?: never };
  front: HealthSeries;
  /** Seri yang diberi label puncak, warna berjalan, dan disebut lebih dulu. */
  emphasis: "back" | "front";
  /** Bucket berjalan (`null` = periode sudah lewat). */
  nowKey: string | null;
  groupLabel: string;
  caption: string;
  keyHeader: string;
  summary: string;
  peakLabel: (value: number) => string;
}) {
  const [active, setActive] = useState<number | null>(null);
  const [ref, width] = useWidth();
  const frontOutline = front.outline ? OUTLINE_WIDTH : 0;
  const chart = useMemo(
    () =>
      healthGeometry({
        buckets,
        emphasis,
        nowKey,
        width,
        peakLabel,
        frontOutline,
      }),
    [buckets, emphasis, nowKey, width, peakLabel, frontOutline],
  );
  const { plot } = chart;
  const lines: SeriesLine[] =
    emphasis === "back"
      ? [
          { series: back, pick: "back" },
          { series: front, pick: "front" },
        ]
      : [
          { series: front, pick: "front" },
          { series: back, pick: "back" },
        ];
  const activeBucket = active === null ? undefined : buckets[active];
  const nowIndex = buckets.findIndex((b) => b.key === nowKey);

  function onKeyDown(e: KeyboardEvent<HTMLDivElement>) {
    const delta = { ArrowRight: 1, ArrowLeft: -1 }[e.key];
    if (delta !== undefined) {
      e.preventDefault();
      // Tekan pertama menampilkan bucket berjalan (atau yang pertama), berikutnya bergeser.
      setActive(
        chart.clamp(active === null ? Math.max(nowIndex, 0) : active + delta),
      );
    } else if (e.key === "Escape") {
      setActive(null);
    }
  }

  function onPointer(e: PointerEvent<SVGRectElement>) {
    const box = e.currentTarget.ownerSVGElement?.getBoundingClientRect();
    if (box) setActive(chart.indexAt(e.clientX - box.left));
  }

  const fill = (series: HealthSeries, now: boolean, isEmphasis: boolean) =>
    now && isEmphasis && series.nowColor ? series.nowColor : series.color;
  const text = { fontSize: 11, className: "num fill-muted" } as const;

  return (
    <>
      <p className="mb-2 text-[13px] text-muted">{summary}</p>
      {/* Sentuh/klik di plot memfokuskan grup ini; blur menyembunyikan tooltip. */}
      {/* biome-ignore lint/a11y/useSemanticElements: fieldset membawa gaya bawaan; grup berlabel cukup bagi pembaca layar */}
      <div
        ref={ref}
        role="group"
        aria-label={groupLabel}
        // biome-ignore lint/a11y/noNoninteractiveTabindex: grup harus bisa difokus agar bucket aktif bergerak dengan panah
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
          {chart.axisTicks.map((t) => (
            <text
              key={t.index}
              x={t.x}
              y={CHART_HEIGHT - 6}
              textAnchor="middle"
              {...text}
            >
              {t.label}
            </text>
          ))}
          {chart.bars.map((bar, i) => (
            <g
              key={bar.key}
              data-key={bar.key}
              data-hour={HOUR_KEY.test(bar.key) ? bar.key : undefined}
              data-active={active === i ? "true" : undefined}
              opacity={
                active !== null && active !== i ? DIMMED_OPACITY : undefined
              }
              className="transition-opacity duration-150 motion-reduce:transition-none"
            >
              {bar.back && (
                <rect
                  data-series={back.id}
                  x={bar.x}
                  y={bar.back.y}
                  width={bar.width}
                  height={bar.back.height}
                  rx={BAR_RADIUS}
                  fill={fill(back, bar.now, emphasis === "back")}
                />
              )}
              {bar.front && (
                <rect
                  data-series={front.id}
                  x={bar.front.x}
                  y={bar.front.y}
                  width={bar.front.width}
                  height={bar.front.height}
                  // Kotak isi sudah digeser setengah stroke; sudut luar tetap berjari-jari 3.
                  rx={Math.max(BAR_RADIUS - bar.front.stroke / 2, 0)}
                  fill={fill(front, bar.now, emphasis === "front")}
                  {...(front.outline && {
                    stroke: front.outline,
                    strokeWidth: bar.front.stroke,
                  })}
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
        {active !== null && activeBucket && (
          <Tooltip bucket={activeBucket} lines={lines} left={chart.x(active)} />
        )}
        <Legend lines={lines} />
        <div className="sr-only" aria-live="polite" data-testid="chart-live">
          {activeBucket && describeBucket(activeBucket, lines)}
        </div>
        <DataTable
          buckets={buckets}
          lines={lines}
          caption={caption}
          keyHeader={keyHeader}
        />
      </div>
    </>
  );
}
