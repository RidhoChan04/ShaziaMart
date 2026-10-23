import { expect, test } from "vitest";
import type { HourBucket } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { buildChart } from "./hourly-chart-geometry";

const bucket = (
  hour: number,
  revenue: number,
  lastWeekRevenue: number,
): HourBucket => ({ hour, revenue, lastWeekRevenue });

const SAMPLE = [
  bucket(8, 100_000, 80_000),
  bucket(9, 250_000, 300_000),
  bucket(10, 400_000, 350_000),
  bucket(11, 150_000, 500_000),
  bucket(12, 0, 450_000),
  bucket(13, 0, 200_000),
];

const chart = (hourly: HourBucket[], nowHour = 11, width = 360) =>
  buildChart({ hourly, nowHour, width });

test.each([
  ["semua nol", [bucket(8, 0, 0), bucket(9, 0, 0)], 100_000],
  ["satu titik", [bucket(10, 5_000, 7_000)], 100_000],
  ["angka besar", [bucket(10, 123_456_789, 98_000_000)], 200_000_000],
  ["tepat di batas", [bucket(10, 500_000, 0)], 500_000],
  ["sedikit di atas batas", [bucket(10, 500_001, 0)], 1_000_000],
])("sumbu Y %s: batas atas %i, tanpa NaN/Infinity", (_n, hourly, top) => {
  const c = chart(hourly, 10);
  expect(c.ticks.map((t) => t.value)).toEqual([0, top / 2, top]);
  expect(`${c.todayPath} ${c.lastWeekPath}`).not.toMatch(/NaN|Infinity/);
  const numbers = [
    ...c.ticks.map((t) => t.y),
    ...c.hourTicks.map((t) => t.x),
    c.endLabels.lastWeek.x,
    c.endLabels.lastWeek.y,
    c.endLabels.today?.y ?? 0,
  ];
  for (const n of numbers) expect(Number.isFinite(n)).toBe(true);
});

test("label sumbu Y memakai format ringkas; sumbu X tiap 3 jam", () => {
  const c = chart(SAMPLE);
  expect(c.ticks.map((t) => t.label)).toEqual(["Rp0", "Rp250 rb", "Rp500 rb"]);
  expect(c.hourTicks.map((t) => t.label)).toEqual(["09.00", "12.00"]);
});

test("garis hari ini berhenti di jam sekarang; nol titik bila belum mulai", () => {
  expect(chart(SAMPLE, 11).todayPath?.match(/[ML]/g)).toHaveLength(4);
  expect(chart(SAMPLE, 11).lastWeekPath.match(/[ML]/g)).toHaveLength(6);
  expect(chart(SAMPLE, 6).todayPath).toBeNull();
  expect(chart(SAMPLE, 6).endLabels.today).toBeNull();
});

test("lebar mengubah posisi x tetapi bukan posisi y", () => {
  const narrow = chart(SAMPLE, 11, 360);
  const wide = chart(SAMPLE, 11, 1000);
  expect(wide.plot.right).toBeGreaterThan(narrow.plot.right);
  expect(wide.x(13)).toBeGreaterThan(narrow.x(13));
  expect(wide.y(250_000)).toBe(narrow.y(250_000));
  expect(wide.plot.right).toBe(wide.x(13));
});

test("hourAt memetakan x ke jam terdekat dan dijepit ke jendela", () => {
  const c = chart(SAMPLE);
  expect(c.hourAt(c.x(10) + 2)).toBe(10);
  expect(c.hourAt(-50)).toBe(8);
  expect(c.hourAt(5000)).toBe(13);
});

test("label ujung garis dipisah minimal 12 dan tetap di dalam plot", () => {
  const c = chart(
    [bucket(11, 300_000, 300_000), bucket(12, 300_000, 300_000)],
    12,
  );
  const today = c.endLabels.today;
  expect(today).not.toBeNull();
  expect(
    Math.abs((today?.y ?? 0) - c.endLabels.lastWeek.y),
  ).toBeGreaterThanOrEqual(12);
  for (const y of [today?.y ?? 0, c.endLabels.lastWeek.y]) {
    expect(y).toBeGreaterThanOrEqual(c.plot.top);
    expect(y).toBeLessThanOrEqual(c.plot.bottom);
  }
});

test("label ujung garis tidak digeser bila sudah berjauhan", () => {
  const c = chart(SAMPLE, 11);
  expect(c.endLabels.today?.y).toBe(c.y(150_000));
  expect(c.endLabels.lastWeek.y).toBe(c.y(200_000));
});

test("baris tabel: jam setelah sekarang tidak punya nilai hari ini", () => {
  const c = chart(SAMPLE, 11);
  expect(c.hours).toEqual([8, 9, 10, 11, 12, 13]);
  expect(c.row(11)).toEqual({
    hour: 11,
    label: "11.00",
    today: 150_000,
    lastWeek: 500_000,
  });
  expect(c.row(12)).toEqual({
    hour: 12,
    label: "12.00",
    today: null,
    lastWeek: 450_000,
  });
});
