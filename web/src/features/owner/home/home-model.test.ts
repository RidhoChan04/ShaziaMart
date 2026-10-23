import { describe, expect, test } from "vitest";
import type {
  Attention,
  HourBucket,
} from "../../../shared/api/gen/shaziaMartAPI.schemas";
import { attentionItems, comparisonText, hourWindow } from "./home-model";

describe("comparisonText", () => {
  test.each([
    [4872500, 4350000, "▲ 12% dari Jumat lalu", "up"],
    [3915000, 4350000, "▼ 10% dari Jumat lalu", "down"],
    [4350000, 4350000, "Sama dengan Jumat lalu", "flat"],
    [0, 0, "Belum ada data Jumat lalu", "none"],
    [500000, 0, "Belum ada data Jumat lalu", "none"],
    [0, 4350000, "▼ 100% dari Jumat lalu", "down"],
    [3, 2, "▲ 50% dari Jumat lalu", "up"], // tepat .5 naik
    [201, 200, "▲ 1% dari Jumat lalu", "up"], // 0,5% -> 1%
    [1001, 1000, "▲ 0% dari Jumat lalu", "up"], // 0,1% -> 0%
    [9007199254740, 4503599627370, "▲ 100% dari Jumat lalu", "up"],
  ] as const)("(%i, %i)", (revenue, last, text, trend) => {
    expect(comparisonText(revenue, last, "Jumat")).toEqual({ text, trend });
  });
});

function buckets(revenues: Record<number, [number, number]>): HourBucket[] {
  return Array.from({ length: 24 }, (_, hour) => ({
    hour,
    revenue: revenues[hour]?.[0] ?? 0,
    lastWeekRevenue: revenues[hour]?.[1] ?? 0,
  }));
}

describe("hourWindow", () => {
  test.each([
    ["kosong total -> default 06-21", [], 14, { from: 6, to: 21 }],
    [
      "rentang dari jam pertama sampai terakhir yang punya omzet",
      buckets({ 7: [100, 0], 15: [0, 50] }),
      14,
      { from: 7, to: 15 },
    ],
    [
      "seri hari ini dan minggu lalu digabung",
      buckets({ 9: [0, 10], 12: [10, 0] }),
      20,
      { from: 9, to: 12 },
    ],
    [
      "semua nol -> 6 jam berpusat di jam sekarang",
      buckets({}),
      14,
      { from: 11, to: 16 },
    ],
    [
      "semua nol dekat tengah malam digeser ke dalam 0-23",
      buckets({}),
      23,
      { from: 18, to: 23 },
    ],
    [
      "semua nol dini hari digeser ke dalam 0-23",
      buckets({}),
      1,
      { from: 0, to: 5 },
    ],
  ] as const)("%s", (_name, hourly, nowHour, expected) => {
    expect(hourWindow(hourly as HourBucket[], nowHour)).toEqual(expected);
  });
});

describe("attentionItems", () => {
  const none: Attention = {
    lowStockCount: 0,
    negativeStockCount: 0,
    cashDifferences: [],
    overdueCredit: { count: 0, total: 0 },
  };

  test("semua nol -> kosong", () => expect(attentionItems(none)).toEqual([]));

  test("urutan dan teks lengkap", () => {
    const a: Attention = {
      lowStockCount: 3,
      negativeStockCount: 1,
      cashDifferences: [
        { shiftId: "s1", kasirName: "Rina", closedAt: 1, difference: -5000 },
        { shiftId: "s2", kasirName: "Budi", closedAt: 2, difference: 2500 },
      ],
      overdueCredit: { count: 2, total: 1250000 },
    };
    expect(attentionItems(a)).toEqual([
      {
        key: "negative-stock",
        text: "1 barang stok minus",
        tone: "critical",
        to: "/owner/barang",
      },
      {
        key: "low-stock",
        text: "3 barang stok menipis",
        tone: "warning",
        to: "/owner/barang",
      },
      {
        key: "cash-s1",
        text: "Selisih kas shift Rina -Rp5.000",
        tone: "critical",
        to: "/owner/lainnya",
      },
      {
        key: "cash-s2",
        text: "Selisih kas shift Budi +Rp2.500",
        tone: "warning",
        to: "/owner/lainnya",
      },
      {
        key: "overdue-credit",
        text: "2 kasbon > 30 hari · Rp1.250.000",
        tone: "warning",
        to: "/owner/kasbon",
      },
    ]);
  });

  test("item bernilai 0 dilewati", () => {
    expect(attentionItems({ ...none, lowStockCount: 4 })).toEqual([
      {
        key: "low-stock",
        text: "4 barang stok menipis",
        tone: "warning",
        to: "/owner/barang",
      },
    ]);
  });
});
