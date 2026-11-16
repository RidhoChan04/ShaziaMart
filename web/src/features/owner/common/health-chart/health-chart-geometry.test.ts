import { expect, test } from "vitest";
import { formatRupiahShort } from "@/shared/lib/money";
import { type HealthBucket, healthGeometry } from "./health-chart-geometry";

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

const SAMPLE = [
  day(1, 9_000_000, 1_500_000),
  day(2, 12_300_000, 2_000_000),
  day(3, 12_300_000, -200_000),
  day(4, 0, 0),
  day(5, null, null),
];

const geo = (
  buckets: HealthBucket[],
  emphasis: "back" | "front" = "back",
  nowKey: string | null = null,
  width = 360,
) =>
  healthGeometry({
    buckets,
    emphasis,
    nowKey,
    width,
    peakLabel: formatRupiahShort,
  });

function expectAllFinite(c: ReturnType<typeof geo>) {
  const nums: number[] = [];
  for (const b of c.bars) {
    nums.push(b.x, b.width);
    if (b.back) nums.push(b.back.y, b.back.height);
    if (b.front) nums.push(b.front.x, b.front.width, b.front.y, b.front.height);
  }
  for (const t of c.ticks) nums.push(t.value, t.y);
  for (const t of c.axisTicks) nums.push(t.x);
  if (c.peak) nums.push(c.peak.x, c.peak.y);
  expect(nums.length).toBeGreaterThan(0);
  for (const n of nums) expect(Number.isFinite(n)).toBe(true);
}

test("sumbu nilai dari nilai terbesar kedua seri (nilai null diabaikan)", () => {
  const c = geo(SAMPLE);
  expect(c.ticks.map((t) => t.value)).toEqual([0, 10_000_000, 20_000_000]);
  expect(c.ticks.map((t) => t.label)).toEqual(["Rp0", "Rp10 jt", "Rp20 jt"]);
  expectAllFinite(c);
});

test("bucket null tidak punya batang; bucket nol tetap punya batang setinggi 0", () => {
  const c = geo(SAMPLE);
  expect(c.bars).toHaveLength(5);
  expect(c.bars[4]?.back).toBeNull();
  expect(c.bars[4]?.front).toBeNull();
  expect(c.bars[3]?.back?.height).toBe(0);
});

test("laba negatif digambar setinggi 0 (tetap di garis dasar)", () => {
  const c = geo(SAMPLE);
  const neg = c.bars[2]?.front;
  expect(neg?.height).toBe(0);
  expect(neg?.y).toBe(c.plot.bottom);
});

test("batang depan 3 px lebih sempit dan di tengah batang belakang", () => {
  const c = geo(SAMPLE);
  const b = c.bars[1];
  if (!b?.front) throw new Error("bar missing");
  expect(b.front.width).toBeCloseTo(b.width - 3, 5);
  expect(b.front.x).toBeCloseTo(b.x + 1.5, 5);
  expect(b.back?.y).toBeCloseTo(c.y(12_300_000), 5);
  expect(b.front.y).toBeCloseTo(c.y(2_000_000), 5);
});

test("puncak = nilai seri penekanan terbesar; seri → bucket paling awal", () => {
  const back = geo(SAMPLE, "back");
  expect(back.peak?.index).toBe(1);
  expect(back.peak?.label).toBe("Rp12,3 jt");
  expect(back.peak?.y).toBeLessThan(back.y(12_300_000));
  const front = geo(SAMPLE, "front");
  expect(front.peak?.index).toBe(1);
  expect(front.peak?.label).toBe("Rp2 jt");
  // Label di atas batang tertinggi di bucket itu, bukan di atas seri penekanan saja.
  expect(front.peak?.y).toBeLessThan(front.y(12_300_000));
});

test("seri tanpa nilai positif: tanpa batang seri itu dan tanpa puncak", () => {
  const c = geo([day(1, 0, 0), day(2, 0, -5_000), day(3, null, null)]);
  expect(c.bars.every((b) => b.back === null && b.front === null)).toBe(true);
  expect(c.peak).toBeNull();
  expect(c.ticks.at(-1)?.value).toBe(100_000);
  expectAllFinite(c);
});

test("now hanya di bucket nowKey", () => {
  const c = geo(SAMPLE, "back", "2026-11-04");
  expect(c.bars.map((b) => b.now)).toEqual([false, false, false, true, false]);
});

test("label sumbu waktu di tengah slot, label paling kiri tidak terpotong", () => {
  const buckets = Array.from(
    { length: 16 },
    (_, i): HealthBucket => ({
      key: String(6 + i),
      label: `${6 + i}`,
      tick: i % 3 === 0 ? `${String(6 + i).padStart(2, "0")}.00` : null,
      back: 10_000,
      front: null,
    }),
  );
  const c = geo(buckets, "back", null, 296);
  expect(c.axisTicks.map((t) => t.label)).toEqual([
    "06.00",
    "09.00",
    "12.00",
    "15.00",
    "18.00",
    "21.00",
  ]);
  expect(c.axisTicks[0]?.x).toBe(16);
  for (const t of c.axisTicks.slice(1)) expect(t.x).toBe(c.x(t.index));
});

test("indexAt memetakan x ke bucket terdekat dan dijepit", () => {
  const c = geo(SAMPLE);
  expect(c.indexAt(c.x(2) + 1)).toBe(2);
  expect(c.indexAt(-40)).toBe(0);
  expect(c.indexAt(9_999)).toBe(4);
});

test("label puncak terjepit di dalam plot", () => {
  const c = geo([day(1, 900_000, 0), day(2, 1_000, 0)], "back", null, 200);
  const peak = c.peak;
  if (!peak) throw new Error("peak missing");
  const half = (peak.label.length * 6.5) / 2;
  expect(peak.x - half).toBeGreaterThanOrEqual(c.plot.left);
});
