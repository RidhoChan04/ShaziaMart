import type { ImportRow } from "@/shared/api/gen/shaziaMartAPI.schemas";

type Cells = Omit<ImportRow, "row">;

const EMPTY: Cells = {
  name: null,
  category: null,
  sellUnit: null,
  barcode: null,
  cost: null,
  price: null,
  tierMinQty: null,
  tierPrice: null,
  bigName: null,
  bigSize: null,
  bigBarcode: null,
  bigCost: null,
  bigPrice: null,
  minStock: null,
};

/** Baris Excel `row` dengan sel yang diisi; sel lain kosong (null). */
export const importRow = (row: number, cells: Partial<Cells>): ImportRow => ({
  row,
  ...EMPTY,
  ...cells,
});

const sabun = {
  name: "Sabun Batang Giv 72 g",
  category: "Sabun & Deterjen",
  sellUnit: "pcs",
  cost: "2500",
  price: "3000",
};

/**
 * Isi fixture `data-barang-contoh.xlsx` (Task 12) setelah `toImportRows`: baris Excel 3–14,
 * baris 9 kosong dibuang. Hasil terhadap seed: 3 siap, 1 diperbarui, 1 tidak berubah, 6 perbaiki.
 */
export const IMPORT_ROWS: ImportRow[] = [
  importRow(3, {
    name: "Teh Kotak Jasmine 300 ml",
    category: "Minuman",
    sellUnit: "botol",
    barcode: "8996001600276",
    cost: "3000",
    price: "4000",
    bigName: "dus",
    bigSize: "24",
    bigCost: "70000",
    bigPrice: "84000",
    minStock: "24",
  }),
  importRow(4, {
    name: "Gula Pasir",
    category: "Gula & Tepung",
    sellUnit: "kg",
    cost: "17000",
    price: "18000",
    minStock: "10",
  }),
  importRow(5, {
    name: "Minyak Goreng Bimoli 2 L",
    category: "Minyak Goreng",
    sellUnit: "pcs",
    barcode: "8992696404441",
    cost: "34000",
    price: "33000",
  }),
  importRow(6, {
    name: "Mie Sedaap Goreng 90 g",
    category: "Mi Instan",
    sellUnit: "pcs",
    barcode: "089686010947",
    cost: "2700",
    price: "3300",
  }),
  importRow(7, {
    name: "Beras Pandan Wangi curah",
    category: "Beras",
    cost: "12000",
    price: "14000",
  }),
  importRow(8, {
    name: "Kopi Kapal Api 165 g",
    category: "Kopi & Teh",
    sellUnit: "pcs",
    barcode: "8991002105126",
    price: "14500",
    minStock: "10",
  }),
  importRow(10, {
    name: "Gas Elpiji 3 kg",
    category: "Gas & Air Galon",
    sellUnit: "buah",
    cost: "19000",
    price: "22000",
    minStock: "5",
  }),
  importRow(11, {
    name: "Kecap Bango 220 ml",
    category: "Bumbu Dapur",
    sellUnit: "pcs",
    cost: "10000",
    price: "11500",
    tierMinQty: "12",
    tierPrice: "11800",
  }),
  importRow(12, sabun),
  importRow(13, sabun),
  importRow(14, {
    name: "Beras Cianjur",
    category: "Beras Lokal",
    sellUnit: "kg",
    cost: "12500",
    price: "14000",
    bigName: "karung",
    bigSize: "25",
    bigCost: "300000",
    bigPrice: "340000",
    minStock: "50",
  }),
];
