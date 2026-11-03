import { act, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, test, vi } from "vitest";
import type { HourBucket } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { stubWidth } from "@/test/resize-observer";
import { HourlyChart } from "./hourly-chart";
import { buildChart } from "./hourly-chart-geometry";

const bucket = (
  hour: number,
  revenue: number,
  lastWeekRevenue: number,
): HourBucket => ({ hour, revenue, lastWeekRevenue });

// Jendela jam 08-13 (lihat hourWindow); sekarang 11.xx.
const SAMPLE = [
  bucket(8, 100_000, 80_000),
  bucket(9, 250_000, 300_000),
  bucket(10, 400_000, 350_000),
  bucket(11, 150_000, 500_000),
  bucket(12, 0, 450_000),
  bucket(13, 0, 200_000),
];

const renderChart = (hourly: HourBucket[], nowHour = 11) =>
  render(<HourlyChart hourly={hourly} weekday="Jumat" nowHour={nowHour} />);

const GROUP = { name: "Omzet per jam hari ini dan Jumat lalu" };

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const todayBars = (c: HTMLElement) =>
  Array.from(c.querySelectorAll("svg rect[data-series='today']"));
const lastWeekBars = (c: HTMLElement) =>
  Array.from(c.querySelectorAll("svg rect[data-series='last-week']"));

test("batang: rect hari ini berwarna token chart-1, jam berjalan chart-1-now", () => {
  const { container } = renderChart(SAMPLE);
  expect(container.querySelector("svg path")).toBeNull();
  const today = todayBars(container);
  // 08-11: tiga jam selesai + jam berjalan.
  expect(today.map((r) => r.getAttribute("fill"))).toEqual([
    "var(--color-chart-1)",
    "var(--color-chart-1)",
    "var(--color-chart-1)",
    "var(--color-chart-1-now)",
  ]);
  const lastWeek = lastWeekBars(container);
  expect(lastWeek).toHaveLength(6);
  for (const r of lastWeek)
    expect(r).toHaveAttribute("fill", "var(--color-chart-2)");
  for (const r of [...today, ...lastWeek]) expect(r).toHaveAttribute("rx", "3");
  // Batang minggu lalu digambar lebih dulu (di belakang).
  const all = Array.from(container.querySelectorAll("svg rect[data-series]"));
  expect(all.indexOf(lastWeek[0] as Element)).toBeLessThan(
    all.indexOf(today[0] as Element),
  );
});

test("sebelum jam pertama jendela, tanpa batang hari ini", () => {
  const { container } = renderChart(SAMPLE, 6);
  expect(todayBars(container)).toHaveLength(0);
  expect(lastWeekBars(container)).toHaveLength(6);
});

test("ringkasan puncak tampil; tanpa penjualan → 'Belum ada penjualan hari ini'", () => {
  const { container, unmount } = renderChart(SAMPLE);
  expect(
    screen.getByText("Paling ramai jam 10.00 · Rp400 rb"),
  ).toBeInTheDocument();
  const peak = container.querySelector("svg text[data-peak]");
  expect(peak).toHaveTextContent("Rp400 rb");
  expect(peak).toHaveClass("fill-text");
  unmount();

  const empty = renderChart([bucket(8, 0, 50_000), bucket(9, 0, 0)], 9);
  expect(screen.getByText("Belum ada penjualan hari ini")).toBeInTheDocument();
  expect(empty.container.querySelector("svg text[data-peak]")).toBeNull();
  expect(todayBars(empty.container)).toHaveLength(0);
  expect(empty.container.innerHTML).not.toMatch(/NaN|Infinity/);
});

test("legenda: kotak warna Hari ini dan {Hari} lalu", () => {
  renderChart(SAMPLE);
  const legend = screen.getByTestId("chart-legend");
  expect(within(legend).getByText("Hari ini")).toBeInTheDocument();
  expect(within(legend).getByText("Jumat lalu")).toBeInTheDocument();
  const swatches = legend.querySelectorAll("[data-swatch]");
  expect(
    Array.from(swatches).map((s) => s.getAttribute("data-swatch")),
  ).toEqual(["today", "last-week"]);
});

test("sumbu Y di kanan: nol, setengah, dan maksimum 'bagus'; sumbu X tiap 3 jam", () => {
  const { container } = renderChart(SAMPLE);
  const texts = Array.from(container.querySelectorAll("svg text"));
  const labels = texts.map((t) => t.textContent);
  expect(labels).toEqual(
    expect.arrayContaining(["Rp0", "Rp250 rb", "Rp500 rb"]),
  );
  expect(labels).toEqual(expect.arrayContaining(["09.00", "12.00"]));
  expect(labels).not.toContain("10.00");
  const plot = screen.getByTestId("chart-plot");
  const plotRight =
    Number(plot.getAttribute("x")) + Number(plot.getAttribute("width"));
  const tick = texts.find((t) => t.textContent === "Rp500 rb");
  expect(Number(tick?.getAttribute("x"))).toBeGreaterThan(plotRight);
  expect(tick).toHaveAttribute("text-anchor", "start");
});

test.each([
  ["semua nol", [bucket(8, 0, 0), bucket(9, 0, 0)], "Rp100 rb"],
  ["satu bucket", [bucket(10, 5_000, 7_000)], "Rp100 rb"],
  ["angka besar", [bucket(10, 123_456_789, 98_000_000)], "Rp200 jt"],
])("aman untuk %s: tanpa NaN/Infinity di SVG", (_name, hourly, top) => {
  const { container } = renderChart(hourly, 10);
  const svg = container.querySelector("svg")?.outerHTML ?? "";
  expect(svg).not.toMatch(/NaN|Infinity|undefined/);
  expect(screen.getAllByText(top).length).toBeGreaterThan(0);
});

test("tabel sr-only memuat satu baris per jam di jendela", () => {
  renderChart(SAMPLE);
  const table = screen.getByRole("table");
  expect(within(table).getAllByRole("row")).toHaveLength(1 + 6);
  const row = within(table).getByRole("row", { name: /10\.00/ });
  expect(row).toHaveTextContent("Rp400.000");
  expect(row).toHaveTextContent("Rp350.000");
});

test("grup berlabel bisa difokus; svg disembunyikan dari pembaca layar", () => {
  const { container } = renderChart(SAMPLE);
  expect(screen.getByRole("group", GROUP)).toHaveAttribute("tabindex", "0");
  expect(container.querySelector("svg")).toHaveAttribute("aria-hidden", "true");
});

test("titik aktif diumumkan lewat live region sr-only", async () => {
  const user = userEvent.setup();
  renderChart(SAMPLE);
  const live = screen.getByTestId("chart-live");
  expect(live).toHaveAttribute("aria-live", "polite");
  expect(live).toBeEmptyDOMElement();
  screen.getByRole("group", GROUP).focus();
  await user.keyboard("{ArrowRight}{ArrowLeft}");
  expect(live).toHaveTextContent(
    "10.00, Hari ini Rp400.000, Jumat lalu Rp350.000",
  );
  await user.keyboard("{Escape}");
  expect(live).toBeEmptyDOMElement();
});

test("tinggi tetap 160 piksel dan viewBox mengikuti lebar terukur", () => {
  stubWidth(1280);
  const { container } = renderChart(SAMPLE);
  const svg = container.querySelector("svg");
  expect(svg).toHaveAttribute("viewBox", "0 0 1280 160");
  expect(svg).toHaveStyle({ height: "160px" });
});

test("lebar diukur langsung saat dipasang, sebelum ResizeObserver melapor", () => {
  vi.spyOn(HTMLElement.prototype, "getBoundingClientRect").mockReturnValue({
    width: 720.4,
  } as DOMRect);
  const { container } = renderChart(SAMPLE);
  expect(container.querySelector("svg")).toHaveAttribute(
    "viewBox",
    "0 0 720 160",
  );
});

test("tanpa ResizeObserver memakai lebar 360", () => {
  const { container } = renderChart(SAMPLE);
  expect(container.querySelector("svg")).toHaveAttribute(
    "viewBox",
    "0 0 360 160",
  );
});

test("lebar berbeda menggeser x tetapi ukuran font tetap", () => {
  const read = () => {
    const { container, unmount } = renderChart(SAMPLE);
    const label = Array.from(container.querySelectorAll("svg text")).find(
      (t) => t.textContent === "12.00",
    );
    const out = [label?.getAttribute("x"), label?.getAttribute("font-size")];
    unmount();
    return out;
  };
  stubWidth(360);
  const narrow = read();
  stubWidth(1280);
  const wide = read();
  expect(Number(wide[0])).toBeGreaterThan(Number(narrow[0]));
  expect(wide[1]).toBe("11");
  expect(narrow[1]).toBe("11");
});

test("perubahan lebar saat berjalan menggambar ulang", () => {
  let notify: (w: number) => void = () => {};
  vi.stubGlobal(
    "ResizeObserver",
    class {
      cb: ResizeObserverCallback;
      constructor(cb: ResizeObserverCallback) {
        this.cb = cb;
        notify = (w) =>
          this.cb(
            [{ contentRect: { width: w } } as ResizeObserverEntry],
            this as unknown as ResizeObserver,
          );
      }
      observe() {}
      disconnect() {}
    },
  );
  const { container } = renderChart(SAMPLE);
  act(() => notify(500));
  expect(container.querySelector("svg")).toHaveAttribute(
    "viewBox",
    "0 0 500 160",
  );
});

test("keyboard: panah memindah crosshair + tooltip, Esc menyembunyikan", async () => {
  const user = userEvent.setup();
  renderChart(SAMPLE);
  const plot = screen.getByRole("group", GROUP);
  expect(screen.queryByTestId("chart-tooltip")).not.toBeInTheDocument();

  plot.focus();
  await user.keyboard("{ArrowRight}");
  const tooltip = screen.getByTestId("chart-tooltip");
  expect(tooltip).toHaveTextContent("11.00");
  await user.keyboard("{ArrowLeft}");
  expect(screen.getByTestId("chart-tooltip")).toHaveTextContent("10.00");
  expect(screen.getByTestId("chart-tooltip")).toHaveTextContent(
    "Hari ini Rp400.000",
  );
  expect(screen.getByTestId("chart-tooltip")).toHaveTextContent(
    "Jumat lalu Rp350.000",
  );
  await user.keyboard("{ArrowRight}{ArrowRight}");
  // Jam 12 setelah sekarang: hanya minggu lalu.
  expect(screen.getByTestId("chart-tooltip")).toHaveTextContent("12.00");
  expect(screen.getByTestId("chart-tooltip")).not.toHaveTextContent("Hari ini");
  await user.keyboard("{Escape}");
  expect(screen.queryByTestId("chart-tooltip")).not.toBeInTheDocument();
});

test("→ memindah jam aktif dan pembacaan aria-live; Esc menyembunyikan", async () => {
  const user = userEvent.setup();
  const { container } = renderChart(SAMPLE);
  const active = () =>
    Array.from(container.querySelectorAll("svg g[data-active='true']")).map(
      (g) => g.getAttribute("data-hour"),
    );
  const live = screen.getByTestId("chart-live");
  expect(active()).toEqual([]);

  screen.getByRole("group", GROUP).focus();
  await user.keyboard("{ArrowRight}");
  expect(active()).toEqual(["11"]);
  expect(live).toHaveTextContent(
    "11.00, Hari ini Rp150.000, Jumat lalu Rp500.000",
  );
  await user.keyboard("{ArrowRight}");
  expect(active()).toEqual(["12"]);
  expect(live).toHaveTextContent("12.00, Jumat lalu Rp450.000");
  // Batang lain diredupkan agar jam aktif menonjol.
  const dimmed = container.querySelectorAll("svg g[data-hour][opacity]");
  expect(dimmed).toHaveLength(5);

  await user.keyboard("{Escape}");
  expect(active()).toEqual([]);
  expect(live).toBeEmptyDOMElement();
  expect(container.querySelectorAll("svg g[data-hour][opacity]")).toHaveLength(
    0,
  );
});

test("tooltip memakai token teks dan swatch kotak", async () => {
  const user = userEvent.setup();
  renderChart(SAMPLE);
  screen.getByRole("group", GROUP).focus();
  await user.keyboard("{ArrowRight}");
  const tooltip = screen.getByTestId("chart-tooltip");
  expect(tooltip).toHaveClass("text-text", "bg-surface");
  expect(
    Array.from(tooltip.querySelectorAll("[data-swatch]")).map((s) =>
      s.getAttribute("data-swatch"),
    ),
  ).toEqual(["today", "last-week"]);
});

test("panah tidak keluar dari jendela", async () => {
  const user = userEvent.setup();
  renderChart(SAMPLE);
  screen.getByRole("group", GROUP).focus();
  await user.keyboard("{ArrowRight}".repeat(20));
  expect(screen.getByTestId("chart-tooltip")).toHaveTextContent("13.00");
  await user.keyboard("{ArrowLeft}".repeat(20));
  expect(screen.getByTestId("chart-tooltip")).toHaveTextContent("08.00");
});

test("pointer di area plot menampilkan jam terdekat", () => {
  const { container } = renderChart(SAMPLE);
  const svg = container.querySelector("svg") as SVGSVGElement;
  svg.getBoundingClientRect = () =>
    ({ left: 0, top: 0, width: 360, height: 160 }) as DOMRect;
  const { x } = buildChart({ hourly: SAMPLE, nowHour: 11, width: 360 });
  fireEvent.pointerMove(screen.getByTestId("chart-plot"), {
    clientX: x(9) + 3,
    clientY: 80,
  });
  expect(screen.getByTestId("chart-tooltip")).toHaveTextContent("09.00");
  fireEvent.pointerLeave(screen.getByTestId("chart-plot"));
  expect(screen.queryByTestId("chart-tooltip")).not.toBeInTheDocument();
});
