import { expect, test } from "vitest";
import type { ImportCheck } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { importRow } from "@/test/import-rows";
import {
  buildPreview,
  MAX_FILE_BYTES,
  numberBarcodeProblems,
  toImportRows,
} from "./import-rows";
import type { SheetRow } from "./read-xlsx";

const NUMBER_BARCODE = "Barcode tersimpan sebagai angka — ubah kolom ke Teks";
const NUMBER_BIG_BARCODE =
  "Barcode satuan besar tersimpan sebagai angka — ubah kolom ke Teks";

test("MAX_FILE_BYTES = 5 MB", () => {
  expect(MAX_FILE_BYTES).toBe(5 * 1024 * 1024);
});

test("toImportRows: sel '  Indomie ' → 'Indomie'; sel kosong → null; baris 2 (judul) diabaikan", () => {
  const rows: SheetRow[] = [
    { row: 1, cells: { B: "BARANG" } },
    { row: 2, cells: { A: "Status (otomatis)", B: "Nama barang *" } },
    { row: 3, cells: { B: "  Indomie ", C: "", D: "pcs", G: " 3500 " } },
  ];
  expect(toImportRows(rows)).toEqual([
    importRow(3, { name: "Indomie", sellUnit: "pcs", price: "3500" }),
  ]);
});

test("toImportRows: kolom B..O → field ImportRow berurutan; A (Status) dan P (Catatan) tidak dibaca", () => {
  const letters = "ABCDEFGHIJKLMNOP".split("");
  const cells = Object.fromEntries(letters.map((l) => [l, `sel ${l}`]));
  expect(toImportRows([{ row: 7, cells }])).toEqual([
    {
      row: 7,
      name: "sel B",
      category: "sel C",
      sellUnit: "sel D",
      barcode: "sel E",
      cost: "sel F",
      price: "sel G",
      tierMinQty: "sel H",
      tierPrice: "sel I",
      bigName: "sel J",
      bigSize: "sel K",
      bigBarcode: "sel L",
      bigCost: "sel M",
      bigPrice: "sel N",
      minStock: "sel O",
    },
  ]);
});

test("toImportRows: baris yang B..O semuanya kosong/spasi dibuang walau A atau P berisi", () => {
  const rows: SheetRow[] = [
    { row: 3, cells: { A: "Nama barang belum diisi" } },
    { row: 4, cells: { B: "   ", O: "" } },
    { row: 5, cells: { P: "catatan saja" } },
    { row: 6, cells: { O: "10" } },
  ];
  expect(toImportRows(rows)).toEqual([importRow(6, { minStock: "10" })]);
});

test("numberBarcodeProblems (C6): barcode di E/L yang tersimpan sebagai angka ditolak per baris; angka di kolom lain dan baris judul tidak", () => {
  const rows: SheetRow[] = [
    { row: 2, cells: { E: "1" }, numbers: ["E"] },
    {
      row: 3,
      cells: { E: "89686010947", F: "2900" },
      numbers: ["E", "F"],
    },
    {
      row: 4,
      cells: { E: "8996001600276", L: "18996001600273" },
      numbers: ["L"],
    },
    { row: 5, cells: { E: "8996001600276" }, numbers: [] },
    { row: 6, cells: { E: "1", L: "2" }, numbers: ["E", "L"] },
    { row: 7, cells: { F: "3000" }, numbers: ["F"] },
  ];
  expect(numberBarcodeProblems(rows)).toEqual(
    new Map([
      [3, [NUMBER_BARCODE]],
      [4, [NUMBER_BIG_BARCODE]],
      [6, [NUMBER_BARCODE, NUMBER_BIG_BARCODE]],
    ]),
  );
});

const sent = [
  importRow(3, { name: "A", price: "1000" }),
  importRow(4, { name: "B", price: "1000" }),
  importRow(5, { name: "C", price: "1000" }),
  importRow(6, { name: "D", price: "1000" }),
  importRow(7, { name: "E", price: "1000" }),
];
const check: ImportCheck = {
  rows: [
    { row: 3, status: "baru", problems: [], changes: [], notes: ["n"] },
    { row: 4, status: "diperbarui", problems: [], changes: ["c"], notes: [] },
    { row: 5, status: "tidak_berubah", problems: [], changes: [], notes: [] },
    { row: 6, status: "perbaiki", problems: ["p"], changes: [], notes: [] },
    { row: 7, status: "baru", problems: [], changes: [], notes: [] },
  ],
  summary: { ready: 2, update: 1, unchanged: 1, invalid: 1 },
};

test("buildPreview tanpa masalah lokal: status & ringkasan dari server; yang diimpor = baris baru + diperbarui", () => {
  const preview = buildPreview(sent, check, new Map());
  expect(preview.rows.map((r) => [r.source.row, r.result.status])).toEqual([
    [3, "baru"],
    [4, "diperbarui"],
    [5, "tidak_berubah"],
    [6, "perbaiki"],
    [7, "baru"],
  ]);
  expect(preview.summary).toEqual(check.summary);
  expect(preview.importable.map((r) => r.row)).toEqual([3, 4, 7]);
});

test("buildPreview dengan masalah lokal (barcode angka): baris jadi perbaiki, masalah lokal di depan, ringkasan dihitung ulang, baris itu tidak diimpor", () => {
  const preview = buildPreview(
    sent,
    check,
    new Map([
      [4, [NUMBER_BARCODE]],
      [6, [NUMBER_BIG_BARCODE]],
    ]),
  );
  const byRow = new Map(preview.rows.map((r) => [r.source.row, r.result]));
  expect(byRow.get(4)).toEqual({
    row: 4,
    status: "perbaiki",
    problems: [NUMBER_BARCODE],
    changes: [],
    notes: [],
  });
  expect(byRow.get(6)?.problems).toEqual([NUMBER_BIG_BARCODE, "p"]);
  expect(preview.summary).toEqual({
    ready: 2,
    update: 0,
    unchanged: 1,
    invalid: 2,
  });
  expect(preview.importable.map((r) => r.row)).toEqual([3, 7]);
});
