import { expect, test } from "vitest";
import type {
  ReportBucket,
  ReportSeries,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { addIsoDays, isoDaysBetween } from "@/shared/lib/business-day";
import { reportChart } from "./report-chart";

/** Seri harian `from`..`to`; tanggal sesudah `today` belum terjadi (null). */
function days(
  from: string,
  to: string,
  today: string,
  value = (_i: number) => 1_000_000,
): ReportSeries {
  const count = isoDaysBetween(from, to) + 1;
  return {
    kind: "hari",
    buckets: Array.from({ length: count }, (_, i): ReportBucket => {
      const key = addIsoDays(from, i);
      return key > today
        ? { key, revenue: null, grossProfit: null }
        : { key, revenue: value(i), grossProfit: value(i) / 10 };
    }),
  };
}

function hours(values: Record<number, number>, nowHour: number | null) {
  return {
    kind: "jam",
    buckets: Array.from(
      { length: 24 },
      (_, h): ReportBucket =>
        nowHour !== null && h > nowHour
          ? { key: String(h), revenue: null, grossProfit: null }
          : {
              key: String(h),
              revenue: values[h] ?? 0,
              grossProfit: (values[h] ?? 0) / 5,
            },
    ),
  } satisfies ReportSeries;
}

const ticks = (c: ReturnType<typeof reportChart>) =>
  c.buckets.flatMap((b) => (b.tick === null ? [] : [b.tick]));

test.each([
  [
    "November (30 hari)",
    "2026-11-01",
    "2026-11-30",
    ["1", "8", "15", "22", "29"],
  ],
  [
    "Oktober (31 hari)",
    "2026-10-01",
    "2026-10-31",
    ["1", "8", "15", "22", "29"],
  ],
  ["Februari (28 hari)", "2027-02-01", "2027-02-28", ["1", "8", "15", "22"]],
  [
    "satu minggu",
    "2026-11-02",
    "2026-11-08",
    ["2", "3", "4", "5", "6", "7", "8"],
  ],
])(
  "bulan/minggu: satu slot per tanggal, label sumbu %s",
  (_n, from, to, expected) => {
    const c = reportChart(days(from, to, "2026-11-05"), true);
    expect(c.buckets).toHaveLength(isoDaysBetween(from, to) + 1);
    expect(ticks(c)).toEqual(expected);
    expect(c.keyHeader).toBe("Tanggal");
    expect(c.title).toBe("Omzet & laba kotor per hari");
  },
);

test("bulan berjalan: slot sesudah hari ini null, bucket berjalan = hari ini", () => {
  const c = reportChart(days("2026-11-01", "2026-11-30", "2026-11-05"), true);
  expect(c.buckets[4]).toEqual({
    key: "2026-11-05",
    label: "5 Nov",
    tick: null,
    back: 1_000_000,
    front: 100_000,
  });
  expect(c.buckets[5]?.back).toBeNull();
  expect(c.nowKey).toBe("2026-11-05");
  expect(
    reportChart(days("2026-10-01", "2026-10-31", "2026-11-05"), false).nowKey,
  ).toBeNull();
});

test("rentang lintas bulan: label sumbu memakai bulan; > 35 hari tiap 14 hari", () => {
  const c = reportChart(days("2026-09-10", "2026-11-05", "2026-11-05"), true);
  expect(ticks(c)).toEqual(["10 Sep", "24 Sep", "8 Okt", "22 Okt", "5 Nov"]);
});

test("ringkasan per hari: tanggal dengan omzet tertinggi; seri → paling awal", () => {
  const c = reportChart(
    days("2026-11-01", "2026-11-30", "2026-11-05", (i) =>
      i === 1 || i === 3 ? 12_300_000 : 1_000_000,
    ),
    true,
  );
  expect(c.summary).toBe("Paling ramai Senin, 2 Nov · Rp12,3 jt");
});

test("tanpa penjualan → Belum ada penjualan di periode ini", () => {
  const c = reportChart(
    days("2026-11-01", "2026-11-30", "2026-11-05", () => 0),
    true,
  );
  expect(c.summary).toBe("Belum ada penjualan di periode ini");
});

test("per jam: jendela jam beromzet sampai jam berjalan, minimal 6 jam", () => {
  const c = reportChart(
    hours({ 8: 200_000, 10: 880_000, 11: 500_000 }, 14),
    true,
  );
  expect(c.buckets.map((b) => b.key)).toEqual([
    "8",
    "9",
    "10",
    "11",
    "12",
    "13",
    "14",
  ]);
  expect(c.buckets[2]).toEqual({
    key: "10",
    label: "10.00",
    tick: null,
    back: 880_000,
    front: 176_000,
  });
  expect(ticks(c)).toEqual(["09.00", "12.00"]);
  expect(c.nowKey).toBe("14");
  expect(c.summary).toBe("Paling ramai jam 10.00 · Rp880 rb");
  expect(c.title).toBe("Omzet & laba kotor per jam");
  expect(c.keyHeader).toBe("Jam");
});

test("per jam hari lewat tanpa penjualan: jendela bawaan 06.00–21.00", () => {
  const c = reportChart(hours({}, null), false);
  expect(c.buckets.map((b) => b.key)).toEqual(
    Array.from({ length: 16 }, (_, i) => String(6 + i)),
  );
  expect(c.nowKey).toBeNull();
  expect(c.summary).toBe("Belum ada penjualan di periode ini");
});
