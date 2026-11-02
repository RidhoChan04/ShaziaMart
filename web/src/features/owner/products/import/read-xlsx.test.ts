import { expect, test } from "vitest";
import fixtureUrl from "@/test/fixtures/data-barang-contoh.xlsx?inline";
import excelUrl from "@/test/fixtures/data-barang-contoh-excel.xlsx?inline";
import { IMPORT_ROWS } from "@/test/import-rows";
import {
  bufferOf,
  dataUrlBytes,
  makeXlsx,
  makeZip,
  type XlsxBook,
} from "@/test/xlsx";
import templateUrl from "../../../../../public/templates/data-barang.xlsx?inline";
import { toImportRows } from "./import-rows";
import { ImportFileError, readSheet, type SheetRow } from "./read-xlsx";

const NOT_XLSX = "File ini bukan file .xlsx yang bisa dibaca";
const NO_SHEET =
  'Sheet "Barang" tidak ditemukan — pakai template Excel dari aplikasi';

const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG = "http://schemas.openxmlformats.org/package/2006/relationships";

const read = async (b: XlsxBook) => readSheet(await makeXlsx(b), "Barang");
const rowOf = (rows: SheetRow[], n: number) => rows.find((r) => r.row === n);

async function readError(data: ArrayBuffer): Promise<unknown> {
  try {
    await readSheet(data, "Barang");
  } catch (err) {
    return err;
  }
  throw new Error("readSheet tidak gagal");
}

test("readSheet + toImportRows(fixture) === IMPORT_ROWS (baris 9 dan baris 15–50 yang hanya berumus dibuang)", async () => {
  const rows = await readSheet(bufferOf(dataUrlBytes(fixtureUrl)), "Barang");
  expect(toImportRows(rows)).toEqual(IMPORT_ROWS);

  // Judul kolom di baris 2; data dari baris 3; baris 9 kosong dan baris rumus saja tidak muncul.
  expect(rowOf(rows, 2)?.cells).toMatchObject({
    A: "Status (otomatis)",
    B: "Nama barang *",
    O: "Batas stok menipis",
    P: "Catatan",
  });
  expect(rows.map((r) => r.row).filter((n) => n >= 3)).toEqual([
    3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14,
  ]);
  // Kolom A (rumus Status) tidak dibaca; P (Catatan) terbaca tapi tidak diimpor.
  expect(rows.filter((r) => r.row >= 3 && "A" in r.cells)).toEqual([]);
  expect(rowOf(rows, 10)?.cells.P).toBe("isi ulang tabung");
  // openpyxl menulis teks sebagai inline string dan uang/isi/batas sebagai angka.
  expect(rowOf(rows, 3)).toEqual({
    row: 3,
    cells: {
      B: "Teh Kotak Jasmine 300 ml",
      C: "Minuman",
      D: "botol",
      E: "8996001600276",
      F: "3000",
      G: "4000",
      J: "dus",
      K: "24",
      M: "70000",
      N: "84000",
      O: "24",
    },
    numbers: ["F", "G", "K", "M", "N", "O"],
  });
});

test("fixture yang disimpan ulang Microsoft Excel (shared strings, cache rumus kolom A, zip Excel) → hasil sama dengan IMPORT_ROWS", async () => {
  const rows = await readSheet(bufferOf(dataUrlBytes(excelUrl)), "Barang");
  expect(toImportRows(rows)).toEqual(IMPORT_ROWS);
  // Excel menyimpan hasil rumus Status ("Lengkap", "Harga jual di bawah modal") — tetap diabaikan.
  expect(rows.filter((r) => r.row >= 3 && "A" in r.cells)).toEqual([]);
  expect(rowOf(rows, 6)?.cells.E).toBe("089686010947");
  expect(rowOf(rows, 6)?.numbers).toEqual(["F", "G"]);
});

test("template kosong dari generator: hanya baris 1–2 (judul) yang berisi, 2000 baris rumus dibuang", async () => {
  const rows = await readSheet(bufferOf(dataUrlBytes(templateUrl)), "Barang");
  expect(rows.map((r) => r.row)).toEqual([1, 2]);
  expect(rowOf(rows, 1)?.cells).toMatchObject({ B: "BARANG" });
  expect(toImportRows(rows)).toEqual([]);
});

test("shared strings: indeks <v> ke <si>; teks kaya (<r>) digabung; teks fonetik <rPh> dibuang; spasi dipertahankan", async () => {
  const rows = await read({
    shared: `<si><t>Indomie Goreng</t></si>
<si><r><t>Mi </t></r><r><rPr><b/></rPr><t>Instan</t></r></si>
<si><t xml:space="preserve">  pcs </t><rPh sb="0" eb="1"><t>ピース</t></rPh></si>`,
    rows: `<row r="3"><c r="B3" t="s"><v>0</v></c><c r="C3" t="s"><v>1</v></c><c r="D3" t="s"><v>2</v></c></row>`,
  });
  expect(rows).toEqual([
    {
      row: 3,
      cells: { B: "Indomie Goreng", C: "Mi Instan", D: "  pcs " },
      numbers: [],
    },
  ]);
});

test("inline string: <is><t> dan <is> dengan beberapa <r>", async () => {
  const rows = await read({
    stored: true,
    rows: `<row r="3"><c r="B3" t="inlineStr"><is><t>Teh Kotak</t></is></c><c r="C3" t="inlineStr"><is><r><t>Mi</t></r><r><t>numan</t></r></is></c></row>`,
  });
  expect(rows).toEqual([
    { row: 3, cells: { B: "Teh Kotak", C: "Minuman" }, numbers: [] },
  ]);
});

test("angka vs teks: sel tanpa t / t='n' = angka (dicatat di numbers); t='s'/'str'/'inlineStr' = teks; rumus di luar kolom A memakai nilai tersimpan", async () => {
  const rows = await read({
    shared: "<si><t>089686010947</t></si>",
    rows: `<row r="3">
<c r="A3" t="str"><f>IF(B3="","","Lengkap")</f><v>Lengkap</v></c>
<c r="E3"><v>8996001600276</v></c>
<c r="F3" t="n"><v>3500</v></c>
<c r="G3"><f>F3+500</f><v>4000</v></c>
<c r="H3" t="str"><f>"12"</f><v>12</v></c>
<c r="L3" t="s"><v>0</v></c>
<c r="O3"><v>2.5</v></c>
</row>`,
  });
  expect(rows).toEqual([
    {
      row: 3,
      cells: {
        E: "8996001600276",
        F: "3500",
        G: "4000",
        H: "12",
        L: "089686010947",
        O: "2.5",
      },
      numbers: ["E", "F", "G", "O"],
    },
  ]);
});

test("sel kosong (tanpa <v>, <v/> kosong, inline kosong, hanya gaya) tidak muncul; baris tanpa isi dibuang", async () => {
  const rows = await read({
    rows: `<row r="3"><c r="B3" t="inlineStr"><is><t>Gula</t></is></c><c r="C3" s="4"/><c r="D3"><v></v></c><c r="E3" t="inlineStr"><is><t></t></is></c><c r="F3" t="str"><f>""</f><v/></c></row>
<row r="4"><c r="A4"><f>IF(B4="","","x")</f><v></v></c><c r="B4" s="1"/><c r="C4" s="1"/></row>
<row r="5" spans="1:16"/>`,
  });
  expect(rows).toEqual([{ row: 3, cells: { B: "Gula" }, numbers: [] }]);
});

test("pemetaan kolom A–P dari atribut r; baris/sel tanpa r memakai urutan; judul baris 2 tetap dibaca", async () => {
  const letters = "ABCDEFGHIJKLMNOP".split("");
  const full = letters
    .map((l) => `<c r="${l}2" t="inlineStr"><is><t>${l}</t></is></c>`)
    .join("");
  const rows = await read({
    rows: `<row r="2">${full}</row>
<row><c t="inlineStr"><is><t>a</t></is></c><c t="inlineStr"><is><t>b</t></is></c><c r="E3" t="inlineStr"><is><t>e</t></is></c><c t="inlineStr"><is><t>f</t></is></c></row>
<row r="12"><c r="AA12" t="inlineStr"><is><t>jauh</t></is></c></row>`,
  });
  expect(rowOf(rows, 2)?.cells).toEqual(
    Object.fromEntries(letters.map((l) => [l, l])),
  );
  expect(rowOf(rows, 3)?.cells).toEqual({ A: "a", B: "b", E: "e", F: "f" });
  expect(rowOf(rows, 12)?.cells).toEqual({ AA: "jauh" });
});

test("sheet dicari lewat nama → r:id → target relasi (relatif atau absolut), bukan urutan; awalan namespace x: tetap terbaca", async () => {
  const absolute = await read({
    target: "/xl/worksheets/sheet2.xml",
    rows: `<row r="3"><c r="B3" t="inlineStr"><is><t>Benar</t></is></c></row>`,
  });
  expect(absolute[0]?.cells).toEqual({ B: "Benar" });

  const prefixed = await makeZip({
    "xl/workbook.xml": `<x:workbook xmlns:x="${MAIN}" xmlns:r="${REL}"><x:sheets><x:sheet name="Barang" sheetId="1" r:id="rId1"/></x:sheets></x:workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/data.xml"/></Relationships>`,
    "xl/worksheets/data.xml": `<x:worksheet xmlns:x="${MAIN}"><x:sheetData><x:row r="3"><x:c r="B3" t="inlineStr"><x:is><x:t>Awalan</x:t></x:is></x:c></x:row></x:sheetData></x:worksheet>`,
  });
  expect(await readSheet(prefixed, "Barang")).toEqual([
    { row: 3, cells: { B: "Awalan" }, numbers: [] },
  ]);
});

test("bukan zip → ImportFileError 'File ini bukan file .xlsx yang bisa dibaca'; zip tanpa sheet Barang → 'Sheet \"Barang\" tidak ditemukan — pakai template Excel dari aplikasi'", async () => {
  const encoder = new TextEncoder();
  const notZip = [
    new ArrayBuffer(0),
    bufferOf(encoder.encode("%PDF-1.7 bukan spreadsheet")),
    bufferOf(encoder.encode("Nama;Harga\nIndomie;3500\n")),
  ];
  for (const data of notZip) {
    const err = await readError(data);
    expect(err).toBeInstanceOf(ImportFileError);
    expect((err as Error).message).toBe(NOT_XLSX);
  }

  const noSheet = await readError(
    await makeXlsx({ sheetName: "Sheet1", rows: "" }),
  );
  expect(noSheet).toBeInstanceOf(ImportFileError);
  expect((noSheet as Error).message).toBe(NO_SHEET);
});

test("file rusak → 'File ini bukan file .xlsx yang bisa dibaca': zip terpotong, zip bukan workbook, data deflate rusak, XML rusak, target sheet hilang, indeks shared string di luar daftar", async () => {
  const fixture = dataUrlBytes(fixtureUrl);
  const truncated = bufferOf(fixture.subarray(0, fixture.length / 2));
  const docx = await makeZip({ "word/document.xml": "<document/>" });

  const corrupt = new Uint8Array(
    await makeZip({ "xl/workbook.xml": "<workbook/>".repeat(50) }),
  );
  const dataStart = 30 + "xl/workbook.xml".length;
  corrupt.fill(0xff, dataStart, dataStart + 8);

  const badXml = await makeXlsx({
    rows: `<row r="3"><c r="B3" t="inlineStr"><is><t>Gula</is></c></row>`,
  });
  const missingTarget = await makeXlsx({
    target: "worksheets/hilang.xml",
    rows: "",
  });
  const badShared = await makeXlsx({
    shared: "<si><t>satu</t></si>",
    rows: `<row r="3"><c r="B3" t="s"><v>7</v></c></row>`,
  });

  for (const data of [
    truncated,
    docx,
    bufferOf(corrupt),
    badXml,
    missingTarget,
    badShared,
  ]) {
    const err = await readError(data);
    expect(err).toBeInstanceOf(ImportFileError);
    expect((err as Error).message).toBe(NOT_XLSX);
  }
});

const TOO_BIG = "File terlalu besar atau rusak";
const MB = 1024 * 1024;

/** Workbook satu sheet "Barang" + shared strings, dengan ukuran header yang bisa ditimpa. */
function bomb(
  sheetData: string,
  declared: Record<string, number> = {},
): Promise<ArrayBuffer> {
  return makeZip(
    {
      "xl/workbook.xml": `<workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets><sheet name="Barang" sheetId="1" r:id="rId1"/></sheets></workbook>`,
      "xl/_rels/workbook.xml.rels": `<Relationships xmlns="${PKG}"><Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/></Relationships>`,
      "xl/sharedStrings.xml": `<sst xmlns="${MAIN}"/>`,
      "xl/worksheets/sheet1.xml": `<worksheet xmlns="${MAIN}"><sheetData>${sheetData}</sheetData></worksheet>`,
    },
    { declared },
  );
}

async function expectTooBig(data: ArrayBuffer) {
  const err = await readError(data);
  expect(err).toBeInstanceOf(ImportFileError);
  expect((err as Error).message).toBe(TOO_BIG);
}

test("bom dekompresi: header berbohong (mengaku 1 KB, isi 21 MB) → dihentikan saat inflate dengan 'File terlalu besar atau rusak'", async () => {
  const lying = await bomb(" ".repeat(21 * MB), {
    "xl/worksheets/sheet1.xml": 1024,
  });
  // File zip-nya sendiri kecil: hanya hasil ekstraknya yang besar.
  expect(lying.byteLength).toBeLessThan(200 * 1024);
  await expectTooBig(lying);
});

test("ukuran di central directory > 20 MB untuk satu entri, atau total entri yang dibaca > 20 MB → ditolak sebelum inflate", async () => {
  const row = `<row r="3"><c r="B3" t="inlineStr"><is><t>Gula</t></is></c></row>`;
  await expectTooBig(await bomb(row, { "xl/worksheets/sheet1.xml": 21 * MB }));
  await expectTooBig(
    await bomb(row, {
      "xl/sharedStrings.xml": 11 * MB,
      "xl/worksheets/sheet1.xml": 11 * MB,
    }),
  );
  // Ukuran jujur di bawah batas tetap terbaca.
  expect(await readSheet(await bomb(row), "Barang")).toEqual([
    { row: 3, cells: { B: "Gula" }, numbers: [] },
  ]);
});

const dataRows = (count: number) =>
  Array.from(
    { length: count },
    (_, i) =>
      `<row r="${i + 3}"><c r="B${i + 3}" t="inlineStr"><is><t>B${i}</t></is></c></row>`,
  ).join("");

test("lebih dari 5000 baris data → 'File terlalu besar atau rusak'; tepat 5000 baris data (+ judul baris 2) masih terbaca", async () => {
  const header = `<row r="2"><c r="B2" t="inlineStr"><is><t>Nama barang *</t></is></c></row>`;
  await expectTooBig(await bomb(header + dataRows(5001)));
  const ok = await readSheet(await bomb(header + dataRows(5000)), "Barang");
  expect(ok).toHaveLength(5001);
  expect(ok.at(-1)).toEqual({
    row: 5002,
    cells: { B: "B4999" },
    numbers: [],
  });
});
