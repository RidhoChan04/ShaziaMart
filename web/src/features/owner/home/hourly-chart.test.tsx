import { fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test } from "vitest";
import type { HourBucket } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { HourlyChart } from "./hourly-chart";

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

const paths = (c: HTMLElement) =>
  Array.from(c.querySelectorAll("svg path[stroke]"));
const seriesPath = (c: HTMLElement, token: string) =>
  c.querySelector(`svg path[stroke="var(--${token})"]`);

test("menggambar dua garis dengan token warna seri; minggu lalu putus-putus", () => {
  const { container } = renderChart(SAMPLE);
  const today = seriesPath(container, "color-chart-1");
  const lastWeek = seriesPath(container, "color-chart-2");
  expect(today).not.toHaveAttribute("stroke-dasharray");
  expect(lastWeek).toHaveAttribute("stroke-dasharray", "4 3");
  expect(paths(container)).toHaveLength(2);
});

test("garis hari ini berhenti di jam sekarang, minggu lalu sepanjang jendela", () => {
  const { container } = renderChart(SAMPLE);
  const today = seriesPath(container, "color-chart-1");
  const lastWeek = seriesPath(container, "color-chart-2");
  expect(today?.getAttribute("d")?.match(/[ML]/g)).toHaveLength(4); // 08-11
  expect(lastWeek?.getAttribute("d")?.match(/[ML]/g)).toHaveLength(6); // 08-13
});

test("sebelum jam pertama jendela, garis hari ini tidak digambar", () => {
  const { container } = renderChart(SAMPLE, 6);
  expect(paths(container)).toHaveLength(1);
  expect(paths(container)[0]).toHaveAttribute("stroke-dasharray", "4 3");
});

test("legenda dan label langsung memakai nama seri", () => {
  renderChart(SAMPLE);
  expect(screen.getAllByText("Hari ini").length).toBeGreaterThanOrEqual(2);
  expect(screen.getAllByText("Jumat lalu").length).toBeGreaterThanOrEqual(2);
});

test("sumbu Y: nol, setengah, dan maksimum 'bagus'; sumbu X tiap 3 jam", () => {
  const { container } = renderChart(SAMPLE);
  const labels = Array.from(container.querySelectorAll("svg text")).map(
    (t) => t.textContent,
  );
  expect(labels).toEqual(
    expect.arrayContaining(["Rp0", "Rp250 rb", "Rp500 rb"]),
  );
  expect(labels).toEqual(expect.arrayContaining(["09.00", "12.00"]));
  expect(labels).not.toContain("10.00");
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

test("label ujung garis tidak bertumpuk saat nilai akhir hampir sama", () => {
  const { container } = renderChart(
    [bucket(11, 300_000, 300_000), bucket(12, 300_000, 300_000)],
    12,
  );
  const [a, b] = Array.from(
    container.querySelectorAll("svg text[data-end-label]"),
  ).map((t) => Number(t.getAttribute("y")));
  expect(Math.abs((a ?? 0) - (b ?? 0))).toBeGreaterThanOrEqual(12);
});

test("tabel sr-only memuat satu baris per jam di jendela", () => {
  renderChart(SAMPLE);
  const table = screen.getByRole("table");
  expect(within(table).getAllByRole("row")).toHaveLength(1 + 6);
  const row = within(table).getByRole("row", { name: /10\.00/ });
  expect(row).toHaveTextContent("Rp400.000");
  expect(row).toHaveTextContent("Rp350.000");
});

test("gambar punya ringkasan aksesibel", () => {
  renderChart(SAMPLE);
  expect(
    screen.getByRole("img", { name: "Omzet per jam hari ini dan Jumat lalu" }),
  ).toBeInTheDocument();
});

test("keyboard: panah memindah crosshair + tooltip, Esc menyembunyikan", async () => {
  const user = userEvent.setup();
  renderChart(SAMPLE);
  const plot = screen.getByRole("img");
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

test("panah tidak keluar dari jendela", async () => {
  const user = userEvent.setup();
  renderChart(SAMPLE);
  screen.getByRole("img").focus();
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
  // Plot x: 58..290 untuk jam 08..13 -> jam 9 di x = 58 + 232/5.
  fireEvent.pointerMove(screen.getByTestId("chart-plot"), {
    clientX: 58 + 232 / 5 + 3,
    clientY: 80,
  });
  expect(screen.getByTestId("chart-tooltip")).toHaveTextContent("09.00");
  fireEvent.pointerLeave(screen.getByTestId("chart-plot"));
  expect(screen.queryByTestId("chart-tooltip")).not.toBeInTheDocument();
});
