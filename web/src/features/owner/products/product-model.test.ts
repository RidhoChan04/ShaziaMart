import { expect, test } from "vitest";
import type { OwnerProductRow } from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  categoryChips,
  filterProducts,
  NO_CATEGORY_KEY,
  productBadges,
  stockText,
} from "./product-model";

const row = (over: Partial<OwnerProductRow>): OwnerProductRow => ({
  id: "x",
  name: "Barang",
  storeCode: "B000",
  category: null,
  status: "aktif",
  scarce: false,
  stockCounted: true,
  isCurah: false,
  baseUnit: "pcs",
  unitName: "pcs",
  unitSize: 1,
  price: 1000,
  barcodes: [],
  stock: 5,
  stockAlert: "none",
  ...over,
});

const ROWS = [
  row({
    id: "1",
    name: "Indomie Goreng",
    storeCode: "1001",
    category: "Mi Instan",
    barcodes: ["089686010947", "18996001600269"],
  }),
  row({
    id: "2",
    name: "Minyak Goreng Bimoli 2 L",
    storeCode: "1003",
    category: "Minyak",
    barcodes: ["8992628022194"],
  }),
  row({ id: "3", name: "Gula Pasir", category: null }),
  row({
    id: "4",
    name: "Sarimi Lama",
    category: "Mi Instan",
    status: "nonaktif",
  }),
  row({ id: "5", name: "Kopi Hitam", category: "Kopi", status: "nonaktif" }),
];
const F = { q: "", kategori: null, nonaktif: false };
const names = (rs: OwnerProductRow[]) => rs.map((r) => r.name);

test("filterProducts: '0896' → Indomie; '1003' → Bimoli; 'BIMOLI' → Bimoli; nonaktif disembunyikan kecuali filter nonaktif", () => {
  expect(names(filterProducts(ROWS, { ...F, q: "0896" }))).toEqual([
    "Indomie Goreng",
  ]);
  expect(names(filterProducts(ROWS, { ...F, q: "1003" }))).toEqual([
    "Minyak Goreng Bimoli 2 L",
  ]);
  expect(names(filterProducts(ROWS, { ...F, q: "BIMOLI" }))).toEqual([
    "Minyak Goreng Bimoli 2 L",
  ]);
  expect(names(filterProducts(ROWS, F))).toEqual([
    "Indomie Goreng",
    "Minyak Goreng Bimoli 2 L",
    "Gula Pasir",
  ]);
  expect(names(filterProducts(ROWS, { ...F, nonaktif: true }))).toEqual([
    "Sarimi Lama",
    "Kopi Hitam",
  ]);
  expect(names(filterProducts(ROWS, { ...F, q: "sarimi" }))).toEqual([]);
});

test("filterProducts: kategori memakai label, 'Tanpa kategori' untuk null", () => {
  expect(names(filterProducts(ROWS, { ...F, kategori: "Minyak" }))).toEqual([
    "Minyak Goreng Bimoli 2 L",
  ]);
  expect(
    names(filterProducts(ROWS, { ...F, kategori: NO_CATEGORY_KEY })),
  ).toEqual(["Gula Pasir"]);
});

test("categoryChips: barang bukan-nonaktif, urut label, null → Tanpa kategori", () => {
  expect(categoryChips(ROWS)).toEqual([
    { key: "Mi Instan", label: "Mi Instan", count: 1 },
    { key: "Minyak", label: "Minyak", count: 1 },
    { key: NO_CATEGORY_KEY, label: "Tanpa kategori", count: 1 },
  ]);
});

test("kategori asli bernama 'Tanpa kategori' tidak bertabrakan dengan barang tanpa kategori", () => {
  const rows = [
    row({ id: "a", name: "A", category: "Tanpa kategori" }),
    row({ id: "b", name: "B", category: null }),
  ];
  const chips = categoryChips(rows);
  expect(chips).toHaveLength(2);
  expect(new Set(chips.map((c) => c.key)).size).toBe(2);
  expect(
    names(filterProducts(rows, { ...F, kategori: "Tanpa kategori" })),
  ).toEqual(["A"]);
  expect(
    names(filterProducts(rows, { ...F, kategori: NO_CATEGORY_KEY })),
  ).toEqual(["B"]);
});

test.each([
  [
    { status: "aktif", scarce: false, stockCounted: true, stockAlert: "minus" },
    ["Minus"],
  ],
  [
    {
      status: "aktif",
      scarce: false,
      stockCounted: true,
      stockAlert: "menipis",
    },
    ["Menipis"],
  ],
  [
    {
      status: "tidak_diambil",
      scarce: true,
      stockCounted: true,
      stockAlert: "none",
    },
    ["Sedang langka", "Tidak diambil lagi"],
  ],
  [
    {
      status: "nonaktif",
      scarce: false,
      stockCounted: false,
      stockAlert: "none",
    },
    ["Stok belum dihitung", "Nonaktif"],
  ],
  [
    { status: "aktif", scarce: false, stockCounted: true, stockAlert: "none" },
    [],
  ],
] as const)("productBadges %o", (p, labels) => {
  expect(productBadges(p).map((b) => b.label)).toEqual(labels);
});

test("productBadges: nada Minus danger, Menipis warning, lainnya netral", () => {
  const tone = (p: Parameters<typeof productBadges>[0]) =>
    productBadges(p).map((b) => b.tone);
  expect(
    tone({
      status: "aktif",
      scarce: false,
      stockCounted: true,
      stockAlert: "minus",
    }),
  ).toEqual(["danger"]);
  expect(
    tone({
      status: "aktif",
      scarce: false,
      stockCounted: true,
      stockAlert: "menipis",
    }),
  ).toEqual(["warning"]);
  expect(
    tone({
      status: "nonaktif",
      scarce: true,
      stockCounted: false,
      stockAlert: "none",
    }),
  ).toEqual(["neutral", "neutral", "neutral"]);
});

test("stockText: 'Stok 86,5 kg'; minus; null bila belum dihitung", () => {
  expect(
    stockText(row({ stock: 86_500, unitSize: 1000, unitName: "kg" })),
  ).toBe("Stok 86,5 kg");
  expect(stockText(row({ stock: 125, unitName: "pcs" }))).toBe("Stok 125 pcs");
  expect(stockText(row({ stock: -2500, unitSize: 1000, unitName: "kg" }))).toBe(
    "Stok −2,5 kg",
  );
  expect(stockText(row({ stockCounted: false }))).toBeNull();
});
