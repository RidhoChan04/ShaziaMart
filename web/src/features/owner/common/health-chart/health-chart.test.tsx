import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import { formatRupiahShort } from "@/shared/lib/money";
import { type HealthBucket, HealthChart } from "./health-chart";

const day = (
  d: number,
  back: number | null,
  front: number | null,
): HealthBucket => ({
  key: `2026-11-0${d}`,
  label: `${d} Nov`,
  tick: d === 1 ? String(d) : null,
  back,
  front,
});

// 1–5 Nov; 5 Nov berjalan, 6 Nov belum terjadi.
const BUCKETS = [
  day(1, 9_000_000, 1_500_000),
  day(2, 12_300_000, 2_000_000),
  day(3, 4_000_000, -250_000),
  day(4, 8_000_000, 1_300_000),
  day(5, 3_000_000, 500_000),
  day(6, null, null),
];

const GROUP = { name: "Omzet dan laba kotor per hari, 1–5 Nov" };

const renderChart = (buckets = BUCKETS, nowKey: string | null = "2026-11-05") =>
  render(
    <HealthChart
      buckets={buckets}
      back={{
        id: "omzet",
        name: "Omzet",
        color: "var(--color-chart-1)",
        nowColor: "var(--color-chart-1-now)",
      }}
      front={{ id: "laba", name: "Laba kotor", color: "var(--color-chart-3)" }}
      emphasis="back"
      nowKey={nowKey}
      groupLabel={GROUP.name}
      caption="Omzet dan laba kotor"
      keyHeader="Tanggal"
      summary="Paling ramai Senin, 2 Nov · Rp12,3 jt"
      peakLabel={formatRupiahShort}
    />,
  );

afterEach(() => vi.restoreAllMocks());

const bars = (c: HTMLElement, series: string) =>
  Array.from(c.querySelectorAll(`svg rect[data-series='${series}']`));

test("legenda Omzet lalu Laba kotor dengan kotak warna", () => {
  renderChart();
  const legend = screen.getByTestId("chart-legend");
  expect(within(legend).getByText("Omzet")).toBeInTheDocument();
  expect(within(legend).getByText("Laba kotor")).toBeInTheDocument();
  expect(
    Array.from(legend.querySelectorAll("[data-swatch]")).map((s) =>
      s.getAttribute("data-swatch"),
    ),
  ).toEqual(["omzet", "laba"]);
});

test("kalimat ringkas di atas grafik", () => {
  renderChart();
  expect(
    screen.getByText("Paling ramai Senin, 2 Nov · Rp12,3 jt"),
  ).toBeInTheDocument();
});

test("batang: omzet di belakang selebar slot, laba di depan; bucket berjalan lebih terang", () => {
  const { container } = renderChart();
  const omzet = bars(container, "omzet");
  const laba = bars(container, "laba");
  // Bucket null (6 Nov) tanpa batang.
  expect(omzet).toHaveLength(5);
  expect(laba).toHaveLength(5);
  expect(omzet.map((r) => r.getAttribute("fill"))).toEqual([
    "var(--color-chart-1)",
    "var(--color-chart-1)",
    "var(--color-chart-1)",
    "var(--color-chart-1)",
    "var(--color-chart-1-now)",
  ]);
  for (const r of laba)
    expect(r).toHaveAttribute("fill", "var(--color-chart-3)");
  const all = Array.from(container.querySelectorAll("svg rect[data-series]"));
  expect(all.indexOf(omzet[0] as Element)).toBeLessThan(
    all.indexOf(laba[0] as Element),
  );
  expect(Number(laba[0]?.getAttribute("width"))).toBeLessThan(
    Number(omzet[0]?.getAttribute("width")),
  );
});

test("laba negatif: batang setinggi 0, tabel memakai angka asli dengan minus", () => {
  const { container } = renderChart();
  expect(bars(container, "laba")[2]).toHaveAttribute("height", "0");
  const row = within(screen.getByRole("table")).getByRole("row", {
    name: /^3 Nov/,
  });
  expect(row).toHaveTextContent("Rp4.000.000");
  expect(row).toHaveTextContent("−Rp250.000");
});

test("tabel sr-only: caption, kolom, satu baris per bucket; belum terjadi = -", () => {
  renderChart();
  const table = screen.getByRole("table", { name: "Omzet dan laba kotor" });
  expect(table).toHaveClass("sr-only");
  expect(
    within(table)
      .getAllByRole("columnheader")
      .map((h) => h.textContent),
  ).toEqual(["Tanggal", "Omzet", "Laba kotor"]);
  expect(within(table).getAllByRole("row")).toHaveLength(1 + 6);
  expect(within(table).getByRole("row", { name: /^6 Nov/ })).toHaveTextContent(
    "6 Nov--",
  );
});

test("grup berlabel bisa difokus; → memindah bucket aktif dan pembacaan live", async () => {
  const user = userEvent.setup();
  const { container } = renderChart();
  const group = screen.getByRole("group", GROUP);
  expect(group).toHaveAttribute("tabindex", "0");
  expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
  const live = screen.getByTestId("chart-live");
  expect(live).toBeEmptyDOMElement();

  group.focus();
  // Tekan pertama menampilkan bucket berjalan.
  await user.keyboard("{ArrowRight}");
  expect(live).toHaveTextContent(
    "5 Nov, Omzet Rp3.000.000, Laba kotor Rp500.000",
  );
  await user.keyboard("{ArrowLeft}");
  expect(live).toHaveTextContent(
    "4 Nov, Omzet Rp8.000.000, Laba kotor Rp1.300.000",
  );
  expect(screen.getByTestId("chart-tooltip")).toHaveTextContent("4 Nov");
  const active = container.querySelector("svg g[data-active='true']");
  expect(active).toHaveAttribute("data-key", "2026-11-04");
  await user.keyboard("{ArrowRight}{ArrowRight}");
  // Bucket belum terjadi: hanya label.
  expect(live).toHaveTextContent(/^6 Nov$/);
  await user.keyboard("{Escape}");
  expect(live).toBeEmptyDOMElement();
  expect(screen.queryByTestId("chart-tooltip")).not.toBeInTheDocument();
});

test("tanpa bucket berjalan: tekan pertama mulai dari bucket pertama", async () => {
  const user = userEvent.setup();
  const { container } = renderChart(BUCKETS, null);
  expect(
    container.querySelector('rect[fill="var(--color-chart-1-now)"]'),
  ).toBeNull();
  screen.getByRole("group", GROUP).focus();
  await user.keyboard("{ArrowLeft}");
  expect(screen.getByTestId("chart-live")).toHaveTextContent(/^1 Nov,/);
});

test("label sumbu waktu memakai tick bucket", () => {
  const { container } = renderChart();
  const labels = Array.from(container.querySelectorAll("svg text")).map(
    (t) => t.textContent,
  );
  expect(labels).toContain("1");
  expect(labels).not.toContain("2");
  expect(labels).toContain("Rp12,3 jt");
});

test("semua nol: tanpa batang, tanpa NaN", () => {
  const { container } = renderChart([day(1, 0, 0), day(2, null, null)]);
  expect(container.querySelectorAll("svg rect[data-series]")).toHaveLength(0);
  expect(container.innerHTML).not.toMatch(/NaN|Infinity/);
});
