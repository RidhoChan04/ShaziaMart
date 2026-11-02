import { describe, expect, test } from "vitest";
import type {
  Attention,
  HourBucket,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
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
    [1001, 1000, "Sama dengan Jumat lalu", "flat"], // 0,1% -> 0%
    [1000001, 1000000, "Sama dengan Jumat lalu", "flat"],
    [999999, 1000000, "Sama dengan Jumat lalu", "flat"],
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
      "rentang >= 6 jam dipertahankan",
      buckets({ 7: [100, 0], 15: [0, 50] }),
      14,
      { from: 7, to: 15 },
    ],
    [
      "rentang tepat 6 jam dipertahankan",
      buckets({ 9: [0, 10], 14: [10, 0] }),
      20,
      { from: 9, to: 14 },
    ],
    [
      "satu jam aktif dilebarkan ke 6 jam",
      buckets({ 10: [100, 0] }),
      20,
      { from: 7, to: 12 },
    ],
    [
      "rentang pendek dilebarkan simetris",
      buckets({ 10: [100, 0], 11: [0, 5] }),
      20,
      { from: 8, to: 13 },
    ],
    [
      "jam aktif 0 digeser ke dalam 0-23",
      buckets({ 0: [100, 0] }),
      20,
      { from: 0, to: 5 },
    ],
    [
      "jam aktif 23 digeser ke dalam 0-23",
      buckets({ 23: [100, 0] }),
      20,
      { from: 18, to: 23 },
    ],
    [
      "semua nol -> 6 jam berpusat di jam sekarang",
      buckets({}),
      14,
      { from: 11, to: 16 },
    ],
    ["semua nol jam 23", buckets({}), 23, { from: 18, to: 23 }],
    ["semua nol jam 3 (batas)", buckets({}), 3, { from: 0, to: 5 }],
    ["semua nol jam 2 digeser", buckets({}), 2, { from: 0, to: 5 }],
    ["semua nol jam 1 digeser", buckets({}), 1, { from: 0, to: 5 }],
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
        title: "Stok minus",
        detail: "1 barang",
        tone: "critical",
        to: "/owner/barang",
      },
      {
        key: "low-stock",
        title: "Stok menipis",
        detail: "3 barang",
        tone: "warning",
        to: "/owner/barang",
      },
      {
        key: "cash-s1",
        title: "Selisih kas -Rp5.000",
        detail: "Shift Rina",
        tone: "critical",
        to: "/owner/lainnya",
      },
      {
        key: "cash-s2",
        title: "Selisih kas +Rp2.500",
        detail: "Shift Budi",
        tone: "warning",
        to: "/owner/lainnya",
      },
      {
        key: "overdue-credit",
        title: "Kasbon > 30 hari",
        detail: "2 pelanggan · Rp1.250.000",
        tone: "warning",
        to: "/owner/kasbon",
      },
    ]);
  });

  test("selisih kas 0 dilewati", () => {
    const zero = {
      shiftId: "s0",
      kasirName: "Rina",
      closedAt: 1,
      difference: 0,
    };
    expect(attentionItems({ ...none, cashDifferences: [zero] })).toEqual([]);
  });

  test("item bernilai 0 dilewati", () => {
    expect(attentionItems({ ...none, lowStockCount: 4 })).toEqual([
      {
        key: "low-stock",
        title: "Stok menipis",
        detail: "4 barang",
        tone: "warning",
        to: "/owner/barang",
      },
    ]);
  });
});
