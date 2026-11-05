import { describe, expect, test } from "vitest";
import type {
  Attention,
  HourBucket,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { attentionItems, comparisonText, hourWindow } from "./home-model";

describe("comparisonText", () => {
  test.each([
    [4872500, 4350000, "▲ 12% dari Jumat lalu"],
    [3915000, 4350000, "▼ 10% dari Jumat lalu"],
    [4350000, 4350000, "Sama dengan Jumat lalu"],
    [0, 0, "Belum ada data Jumat lalu"],
    [500000, 0, "Belum ada data Jumat lalu"],
    [0, 4350000, "▼ 100% dari Jumat lalu"],
    [3, 2, "▲ 50% dari Jumat lalu"], // tepat .5 naik
    [201, 200, "▲ 1% dari Jumat lalu"], // 0,5% -> 1%
    [1001, 1000, "Sama dengan Jumat lalu"], // 0,1% -> 0%
    [1000001, 1000000, "Sama dengan Jumat lalu"],
    [999999, 1000000, "Sama dengan Jumat lalu"],
    [9007199254740, 4503599627370, "▲ 100% dari Jumat lalu"],
  ] as const)("(%i, %i)", (revenue, last, text) => {
    expect(comparisonText(revenue, last, "Jumat")).toBe(text);
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
    costChanges: [],
    stockOuts: [],
    supplierDebts: {
      overdueCount: 0,
      overdueTotal: 0,
      dueSoonCount: 0,
      dueSoonTotal: 0,
    },
    awaitingPriceCount: 0,
    expiry: { expiredCount: 0, soonCount: 0, soonDays: 30 },
    opnameHeldCount: 0,
    opnameFlags: [],
    opnameReplacedHeld: 0,
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
      costChanges: [],
      stockOuts: [],
      supplierDebts: none.supplierDebts,
      awaitingPriceCount: 0,
      expiry: { expiredCount: 0, soonCount: 0, soonDays: 30 },
      opnameHeldCount: 0,
      opnameFlags: [],
      opnameReplacedHeld: 0,
    };
    expect(attentionItems(a)).toEqual([
      {
        key: "negative-stock",
        title: "Stok minus",
        detail: "1 barang",
        tone: "critical",
        icon: "stock",
        link: { to: "/owner/barang" },
      },
      {
        key: "low-stock",
        title: "Stok menipis",
        detail: "3 barang",
        tone: "warning",
        icon: "stock",
        link: { to: "/owner/barang" },
      },
      {
        key: "cash-s1",
        title: "Selisih kas -Rp5.000",
        detail: "Shift Rina",
        tone: "critical",
        icon: "cash",
        link: { to: "/owner/lainnya" },
      },
      {
        key: "cash-s2",
        title: "Selisih kas +Rp2.500",
        detail: "Shift Budi",
        tone: "warning",
        icon: "cash",
        link: { to: "/owner/lainnya" },
      },
      {
        key: "overdue-credit",
        title: "Kasbon > 30 hari",
        detail: "2 pelanggan · Rp1.250.000",
        tone: "warning",
        icon: "credit",
        link: { to: "/owner/kasbon" },
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
        icon: "stock",
        link: { to: "/owner/barang" },
      },
    ]);
  });
});

describe("attentionItems: modal berubah dan barang habis", () => {
  const none: Attention = {
    lowStockCount: 0,
    negativeStockCount: 0,
    cashDifferences: [],
    overdueCredit: { count: 0, total: 0 },
    costChanges: [],
    stockOuts: [],
    supplierDebts: {
      overdueCount: 0,
      overdueTotal: 0,
      dueSoonCount: 0,
      dueSoonTotal: 0,
    },
    awaitingPriceCount: 0,
    expiry: { expiredCount: 0, soonCount: 0, soonDays: 30 },
    opnameHeldCount: 0,
    opnameFlags: [],
    opnameReplacedHeld: 0,
  };
  const change = (
    over: Partial<Attention["costChanges"][number]> = {},
  ): Attention["costChanges"][number] => ({
    productId: "p-indomie",
    productName: "Indomie Goreng",
    unitName: "pcs",
    oldCost: 2600,
    newCost: 2700,
    price: 3100,
    changedAt: 1,
    source: "pemilik",
    ...over,
  });
  const lembarHarga = {
    to: "/owner/barang/$productId",
    params: { productId: "p-indomie" },
    search: { lembar: "harga" },
  };

  test.each([
    [
      { oldCost: 2600, newCost: 2700 },
      "Harga modal Indomie Goreng naik Rp100",
      "Untung jadi Rp400",
    ],
    [
      { oldCost: 2600, newCost: 2500 },
      "Harga modal Indomie Goreng turun Rp100",
      "Untung jadi Rp600",
    ],
    [
      { oldCost: 2600, newCost: 3400 },
      "Harga modal Indomie Goreng naik Rp800",
      "Rugi Rp300",
    ],
    [
      { oldCost: 2600, newCost: 3100 },
      "Harga modal Indomie Goreng naik Rp500",
      "Untung jadi Rp0",
    ],
  ] as const)("butir modal %o", (cost, title, detail) => {
    expect(attentionItems({ ...none, costChanges: [change(cost)] })).toEqual([
      {
        key: "cost-p-indomie",
        title,
        detail,
        tone: "warning",
        icon: "cost",
        link: lembarHarga,
      },
    ]);
  });

  test("selisih eceran di bawah Rp1: tidak pernah 'naik Rp0'", () => {
    const [item] = attentionItems({
      ...none,
      costChanges: [change({ oldCost: 2600, newCost: 2600 })],
    });
    expect(item?.title).toBe("Harga modal Indomie Goreng berubah");
    expect(item?.detail).toBe("Untung jadi Rp500");
  });

  test("barang habis", () => {
    expect(
      attentionItems({
        ...none,
        stockOuts: [{ productId: "p-beras", productName: "Beras Pandan" }],
      }),
    ).toEqual([
      {
        key: "stockout-p-beras",
        title: "Beras Pandan habis",
        detail: "Tidak diambil lagi",
        tone: "warning",
        icon: "stockout",
        link: {
          to: "/owner/barang/$productId",
          params: { productId: "p-beras" },
          search: { lembar: "habis" },
        },
      },
    ]);
  });

  test.each([
    [
      {
        supplierDebts: {
          overdueCount: 1,
          overdueTotal: 1_275_000,
          dueSoonCount: 0,
          dueSoonTotal: 0,
        },
      },
      {
        key: "debt-overdue",
        title: "Utang supplier lewat jatuh tempo",
        detail: "1 nota · Rp1.275.000",
        tone: "critical",
        icon: "debt",
        link: { to: "/owner/lainnya/utang" },
      },
    ],
    [
      {
        supplierDebts: {
          overdueCount: 0,
          overdueTotal: 0,
          dueSoonCount: 2,
          dueSoonTotal: 2_812_000,
        },
      },
      {
        key: "debt-soon",
        title: "Utang supplier segera jatuh tempo",
        detail: "2 nota · Rp2.812.000",
        tone: "warning",
        icon: "debt",
        link: { to: "/owner/lainnya/utang" },
      },
    ],
    [
      { awaitingPriceCount: 3 },
      {
        key: "awaiting-price",
        title: "3 barang baru dari barang masuk",
        detail: "Lengkapi harga jual",
        tone: "warning",
        icon: "price",
        link: { to: "/owner/barang", search: { menunggu: true } },
      },
    ],
  ] as const)("butir barang masuk %#", (patch, expected) => {
    expect(attentionItems({ ...none, ...patch })).toEqual([expected]);
  });

  test("urutan lengkap: minus, utang lewat, modal, barang baru, menipis, utang segera, habis, kas, kasbon", () => {
    const items = attentionItems({
      lowStockCount: 2,
      negativeStockCount: 1,
      cashDifferences: [
        { shiftId: "s1", kasirName: "Rina", closedAt: 1, difference: -5000 },
      ],
      overdueCredit: { count: 1, total: 100 },
      costChanges: [change()],
      stockOuts: [{ productId: "p-beras", productName: "Beras" }],
      supplierDebts: {
        overdueCount: 1,
        overdueTotal: 10,
        dueSoonCount: 1,
        dueSoonTotal: 10,
      },
      awaitingPriceCount: 3,
      expiry: { expiredCount: 0, soonCount: 0, soonDays: 30 },
      opnameHeldCount: 0,
      opnameFlags: [],
      opnameReplacedHeld: 0,
    });
    expect(items.map((i) => i.key)).toEqual([
      "negative-stock",
      "debt-overdue",
      "cost-p-indomie",
      "awaiting-price",
      "low-stock",
      "debt-soon",
      "stockout-p-beras",
      "cash-s1",
      "overdue-credit",
    ]);
  });

  test("urutan: minus, modal, menipis, habis, kas, kasbon", () => {
    const items = attentionItems({
      lowStockCount: 2,
      negativeStockCount: 1,
      cashDifferences: [
        { shiftId: "s1", kasirName: "Rina", closedAt: 1, difference: -5000 },
      ],
      overdueCredit: { count: 1, total: 100 },
      costChanges: [change()],
      stockOuts: [{ productId: "p-beras", productName: "Beras" }],
      supplierDebts: none.supplierDebts,
      awaitingPriceCount: 0,
      expiry: { expiredCount: 0, soonCount: 0, soonDays: 30 },
      opnameHeldCount: 0,
      opnameFlags: [],
      opnameReplacedHeld: 0,
    });
    expect(items.map((i) => i.key)).toEqual([
      "negative-stock",
      "cost-p-indomie",
      "low-stock",
      "stockout-p-beras",
      "cash-s1",
      "overdue-credit",
    ]);
    expect(items.map((i) => i.icon)).toEqual([
      "stock",
      "cost",
      "stock",
      "stockout",
      "cash",
      "credit",
    ]);
  });
});

describe("attentionItems: kedaluwarsa", () => {
  const base: Attention = {
    lowStockCount: 2,
    negativeStockCount: 1,
    cashDifferences: [],
    overdueCredit: { count: 0, total: 0 },
    costChanges: [],
    stockOuts: [],
    supplierDebts: {
      overdueCount: 1,
      overdueTotal: 5,
      dueSoonCount: 0,
      dueSoonTotal: 0,
    },
    awaitingPriceCount: 0,
    expiry: { expiredCount: 1, soonCount: 2, soonDays: 30 },
    opnameHeldCount: 0,
    opnameFlags: [],
    opnameReplacedHeld: 0,
  };

  test("kritis setelah stok minus, 'segera' setelah stok menipis (K19)", () => {
    const items = attentionItems(base);
    expect(items.map((i) => i.key)).toEqual([
      "negative-stock",
      "expiry-expired",
      "debt-overdue",
      "low-stock",
      "expiry-soon",
    ]);
    expect(items[1]).toEqual({
      key: "expiry-expired",
      title: "Barang sudah kedaluwarsa",
      detail: "1 barang",
      tone: "critical",
      icon: "expiry",
      link: { to: "/owner/lainnya/kedaluwarsa" },
    });
    expect(items[4]).toMatchObject({
      title: "Barang segera kedaluwarsa",
      detail: "2 barang · ≤ 30 hari",
      tone: "warning",
      link: { to: "/owner/lainnya/kedaluwarsa" },
    });
  });
});

describe("attentionItems: opname", () => {
  const base: Attention = {
    lowStockCount: 2,
    negativeStockCount: 1,
    cashDifferences: [],
    overdueCredit: { count: 0, total: 0 },
    costChanges: [],
    stockOuts: [],
    supplierDebts: {
      overdueCount: 1,
      overdueTotal: 500000,
      dueSoonCount: 0,
      dueSoonTotal: 0,
    },
    awaitingPriceCount: 0,
    expiry: { expiredCount: 0, soonCount: 0, soonDays: 30 },
    opnameHeldCount: 2,
    opnameFlags: [
      {
        sessionId: "A",
        scope: { kind: "kategori", category: "Mi Instan" },
        finishedAt: 1,
        totalValue: 260000,
      },
      {
        sessionId: "B",
        scope: { kind: "semua", category: null },
        finishedAt: 2,
        totalValue: 300000,
      },
    ],
    opnameReplacedHeld: 0,
  };

  test("selisih besar (kritis, tautan detail) tepat sesudah stok minus; menunggu persetujuan (peringatan) sebelum stok menipis", () => {
    const items = attentionItems(base);
    expect(items.map((i) => i.key)).toEqual([
      "negative-stock",
      "opname-flag-A",
      "opname-flag-B",
      "debt-overdue",
      "opname-held",
      "low-stock",
    ]);
    expect(items[1]).toEqual({
      key: "opname-flag-A",
      title: "Selisih opname besar",
      detail: "Mi Instan · Rp260.000",
      tone: "critical",
      icon: "opname-flag",
      link: {
        to: "/owner/lainnya/opname/$sessionId",
        params: { sessionId: "A" },
      },
    });
    expect(items[2]?.detail).toBe("Semua barang · Rp300.000");
    expect(items[4]).toEqual({
      key: "opname-held",
      title: "Opname menunggu persetujuan",
      detail: "2 barang",
      tone: "warning",
      icon: "opname-held",
      link: { to: "/owner/lainnya/opname" },
    });
  });

  test("I2: tertahan diganti hitungan baru (kritis, ClipboardX) tepat sesudah selisih besar", () => {
    const items = attentionItems({ ...base, opnameReplacedHeld: 3 });
    expect(items.map((i) => i.key)).toEqual([
      "negative-stock",
      "opname-flag-A",
      "opname-flag-B",
      "opname-replaced",
      "debt-overdue",
      "opname-held",
      "low-stock",
    ]);
    expect(items[3]).toEqual({
      key: "opname-replaced",
      title: "Opname tertahan diganti hitungan baru",
      detail: "3 barang",
      tone: "critical",
      icon: "opname-flag",
      link: { to: "/owner/lainnya/opname" },
    });
  });

  test("tanpa tahan / tanda: tidak ada butir opname", () => {
    const items = attentionItems({
      ...base,
      opnameHeldCount: 0,
      opnameFlags: [],
      opnameReplacedHeld: 0,
    });
    expect(items.some((i) => i.key.startsWith("opname"))).toBe(false);
  });
});

describe("attentionItems: urutan K19 lengkap (kedaluwarsa + opname)", () => {
  test("stok minus, kedaluwarsa, selisih opname besar, tertahan diganti, utang lewat, opname menunggu, stok menipis, segera kedaluwarsa", () => {
    const items = attentionItems({
      lowStockCount: 2,
      negativeStockCount: 1,
      cashDifferences: [],
      overdueCredit: { count: 0, total: 0 },
      costChanges: [],
      stockOuts: [],
      supplierDebts: {
        overdueCount: 1,
        overdueTotal: 500000,
        dueSoonCount: 0,
        dueSoonTotal: 0,
      },
      awaitingPriceCount: 0,
      expiry: { expiredCount: 1, soonCount: 2, soonDays: 30 },
      opnameHeldCount: 2,
      opnameFlags: [
        {
          sessionId: "A",
          scope: { kind: "kategori", category: "Mi Instan" },
          finishedAt: 1,
          totalValue: 260000,
        },
      ],
      opnameReplacedHeld: 1,
    });
    expect(items.map((i) => i.key)).toEqual([
      "negative-stock",
      "expiry-expired",
      "opname-flag-A",
      "opname-replaced",
      "debt-overdue",
      "opname-held",
      "low-stock",
      "expiry-soon",
    ]);
  });
});
