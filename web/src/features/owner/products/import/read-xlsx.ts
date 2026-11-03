// Pembaca satu sheet .xlsx tanpa dependensi: zip lewat ./unzip, XML lewat DOMParser.
// Hanya dimuat lewat `await import("./read-xlsx")` dari halaman impor (chunk terpisah).

import { ImportFileError, notXlsx, tooBig, Zip } from "./unzip";

export { ImportFileError };

/** `cells` berkunci huruf kolom; `numbers` = kolom yang selnya bertipe angka. */
export type SheetRow = {
  row: number;
  cells: Partial<Record<string, string>>;
  numbers?: string[];
};

/** Sama dengan batas kontrak impor (`rows` maks. 5000). */
const MAX_DATA_ROWS = 5000;
/** Data barang mulai baris 3 (baris 1–2 judul template). */
const FIRST_DATA_ROW = 3;

/** Elemen berdasarkan nama lokal, apa pun awalan namespace-nya (`c`, `x:c`). */
const all = (root: Document | Element, localName: string): Element[] =>
  Array.from(root.getElementsByTagNameNS("*", localName));

const children = (el: Element, localName: string): Element[] =>
  Array.from(el.children).filter((c) => c.localName === localName);

/** Target relasi relatif terhadap folder part sumber, atau absolut dari akar paket. */
function resolveTarget(baseDir: string, target: string): string {
  const parts = target.startsWith("/")
    ? []
    : baseDir.split("/").filter(Boolean);
  for (const seg of target.split("/")) {
    if (seg === "..") parts.pop();
    else if (seg && seg !== ".") parts.push(seg);
  }
  return parts.join("/");
}

/** Teks `<si>`/`<is>`: `<t>` langsung dan dalam `<r>` (teks kaya); `<rPh>` (fonetik) dibuang. */
function richText(el: Element): string {
  let text = "";
  for (const child of Array.from(el.children)) {
    if (child.localName === "t") text += child.textContent ?? "";
    else if (child.localName === "r") {
      for (const t of children(child, "t")) text += t.textContent ?? "";
    }
  }
  return text;
}

function columnIndex(letters: string): number {
  let n = 0;
  for (const ch of letters) n = n * 26 + (ch.charCodeAt(0) - 64);
  return n;
}

function columnLetters(index: number): string {
  let s = "";
  for (let n = index; n > 0; n = Math.floor((n - 1) / 26)) {
    s = String.fromCharCode(65 + ((n - 1) % 26)) + s;
  }
  return s;
}

async function sheetPaths(
  zip: Zip,
  sheetName: string,
): Promise<{ sheet: string; shared: string | null }> {
  if (!zip.has("xl/workbook.xml")) throw notXlsx();
  const workbook = await zip.xml("xl/workbook.xml");
  const rels = await zip.xml("xl/_rels/workbook.xml.rels");
  const targets = new Map<string, { type: string; target: string }>();
  for (const rel of all(rels, "Relationship")) {
    targets.set(rel.getAttribute("Id") ?? "", {
      type: rel.getAttribute("Type") ?? "",
      target: resolveTarget("xl", rel.getAttribute("Target") ?? ""),
    });
  }
  const sheet = all(workbook, "sheet").find(
    (s) => s.getAttribute("name") === sheetName,
  );
  if (!sheet) {
    throw new ImportFileError(
      `Sheet "${sheetName}" tidak ditemukan — pakai template Excel dari aplikasi`,
    );
  }
  // r:id; namespace relasi berbeda di OOXML transitional dan strict, jadi cukup nama lokal "id".
  const relId = Array.from(sheet.attributes).find(
    (a) => a.localName === "id" && a.prefix !== null,
  )?.value;
  const sheetPath = relId === undefined ? undefined : targets.get(relId);
  if (!sheetPath) throw notXlsx();
  const shared = [...targets.values()].find((t) =>
    t.type.endsWith("/sharedStrings"),
  );
  return { sheet: sheetPath.target, shared: shared?.target ?? null };
}

async function readSharedStrings(
  zip: Zip,
  path: string | null,
): Promise<string[]> {
  if (path === null || !zip.has(path)) return [];
  return all(await zip.xml(path), "si").map(richText);
}

function cellValue(cell: Element, shared: string[]): string | undefined {
  const type = cell.getAttribute("t");
  if (type === "inlineStr") {
    const is = children(cell, "is")[0];
    return is ? richText(is) : undefined;
  }
  const v = children(cell, "v")[0]?.textContent ?? undefined;
  if (v === undefined || type !== "s") return v;
  const text = shared[Number(v)];
  if (text === undefined) throw notXlsx();
  return text;
}

/** Sel berisi satu `<row>`; kolom dari atribut `r`, atau urutan bila tidak ada. */
function readRow(rowEl: Element, row: number, shared: string[]): SheetRow {
  const out: Required<SheetRow> = { row, cells: {}, numbers: [] };
  let column = 0;
  for (const cell of children(rowEl, "c")) {
    const ref = /^([A-Z]+)\d*$/.exec(cell.getAttribute("r") ?? "");
    column = ref?.[1] ? columnIndex(ref[1]) : column + 1;
    const letters = columnLetters(column);
    // Kolom A template berisi rumus Status; nilainya hasil hitung Excel, bukan data.
    if (letters === "A" && children(cell, "f").length > 0) continue;
    const value = cellValue(cell, shared);
    if (!value) continue;
    out.cells[letters] = value;
    const type = cell.getAttribute("t");
    if (type === null || type === "n") out.numbers.push(letters);
  }
  return out;
}

/** Baris berisi; lebih dari `MAX_DATA_ROWS` baris data → ditolak. */
function readRows(sheet: Document, shared: string[]): SheetRow[] {
  const out: SheetRow[] = [];
  let rowNumber = 0;
  let dataRows = 0;
  for (const rowEl of all(sheet, "row")) {
    rowNumber = Number(rowEl.getAttribute("r") ?? rowNumber + 1);
    const row = readRow(rowEl, rowNumber, shared);
    if (Object.keys(row.cells).length === 0) continue;
    if (row.row >= FIRST_DATA_ROW && ++dataRows > MAX_DATA_ROWS) {
      throw tooBig();
    }
    out.push(row);
  }
  return out;
}

/** Baris sheet `sheetName` yang berisi; sel kosong dan rumus kolom A (Status) dilewati. */
export async function readSheet(
  data: ArrayBuffer,
  sheetName: string,
): Promise<SheetRow[]> {
  try {
    const zip = new Zip(data);
    const paths = await sheetPaths(zip, sheetName);
    const shared = await readSharedStrings(zip, paths.shared);
    return readRows(await zip.xml(paths.sheet), shared);
  } catch (err) {
    if (err instanceof ImportFileError) throw err;
    throw notXlsx();
  }
}
