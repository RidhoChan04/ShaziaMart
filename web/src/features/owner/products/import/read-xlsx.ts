// Pembaca satu sheet .xlsx tanpa dependensi: zip lewat central directory,
// inflate lewat DecompressionStream, XML lewat DOMParser. Hanya dimuat lewat
// `await import("./read-xlsx")` dari halaman impor (chunk terpisah).

/** Galat yang pesannya langsung ditampilkan ke pemilik. */
export class ImportFileError extends Error {}

/** `cells` berkunci huruf kolom; `numbers` = kolom yang selnya bertipe angka. */
export type SheetRow = {
  row: number;
  cells: Partial<Record<string, string>>;
  numbers?: string[];
};

const NOT_XLSX = "File ini bukan file .xlsx yang bisa dibaca";
const notXlsx = () => new ImportFileError(NOT_XLSX);
const tooBig = () => new ImportFileError("File terlalu besar atau rusak");

/** Total hasil ekstrak part yang dibaca (template 2000 baris ±6 MB); menahan bom dekompresi. */
const MAX_EXTRACTED_BYTES = 20 * 1024 * 1024;
/** Sama dengan batas kontrak impor (`rows` maks. 5000). */
const MAX_DATA_ROWS = 5000;
/** Data barang mulai baris 3 (baris 1–2 judul template). */
const FIRST_DATA_ROW = 3;

const EOCD_SIG = 0x06054b50;
const CENTRAL_SIG = 0x02014b50;
const LOCAL_SIG = 0x04034b50;
// EOCD 22 byte + komentar zip maks. 65.535 byte.
const EOCD_SEARCH = 22 + 0xffff;

/** `size` = ukuran terkompresi, `declared` = ukuran ekstrak menurut central directory. */
type Entry = { method: number; size: number; declared: number; offset: number };

/** Nama part OPC tanpa "/" depan, huruf kecil (nama part tidak peka huruf). */
const partKey = (name: string) => name.replace(/^\/+/, "").toLowerCase();

function readCentralDirectory(bytes: Uint8Array): Map<string, Entry> {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let end = -1;
  const stop = Math.max(0, bytes.length - EOCD_SEARCH);
  for (let i = bytes.length - 22; i >= stop; i--) {
    if (view.getUint32(i, true) === EOCD_SIG) {
      end = i;
      break;
    }
  }
  if (end < 0) throw notXlsx();
  const count = view.getUint16(end + 10, true);
  let p = view.getUint32(end + 16, true);
  const decoder = new TextDecoder();
  const entries = new Map<string, Entry>();
  for (let n = 0; n < count; n++) {
    if (p + 46 > bytes.length || view.getUint32(p, true) !== CENTRAL_SIG) {
      throw notXlsx();
    }
    const nameLength = view.getUint16(p + 28, true);
    const name = decoder.decode(bytes.subarray(p + 46, p + 46 + nameLength));
    entries.set(partKey(name), {
      method: view.getUint16(p + 10, true),
      size: view.getUint32(p + 20, true),
      declared: view.getUint32(p + 24, true),
      offset: view.getUint32(p + 42, true),
    });
    p +=
      46 +
      nameLength +
      view.getUint16(p + 30, true) +
      view.getUint16(p + 32, true);
  }
  return entries;
}

/** Inflate potong demi potong; berhenti begitu hasil melewati `limit` (header bisa berbohong). */
async function inflateRaw(
  data: Uint8Array<ArrayBuffer>,
  limit: number,
): Promise<Uint8Array> {
  const reader = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  })
    .pipeThrough(new DecompressionStream("deflate-raw"))
    .getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > limit) {
      await reader.cancel().catch(() => {});
      throw tooBig();
    }
    chunks.push(value);
  }
  const out = new Uint8Array(total);
  let at = 0;
  for (const chunk of chunks) {
    out.set(chunk, at);
    at += chunk.length;
  }
  return out;
}

class Zip {
  private readonly bytes: Uint8Array<ArrayBuffer>;
  private readonly view: DataView;
  private readonly entries: Map<string, Entry>;
  /** Byte hasil ekstrak yang sudah dipakai dari `MAX_EXTRACTED_BYTES`. */
  private extracted = 0;

  constructor(data: ArrayBuffer) {
    this.bytes = new Uint8Array(data);
    this.view = new DataView(data);
    this.entries = readCentralDirectory(this.bytes);
  }

  has(name: string): boolean {
    return this.entries.has(partKey(name));
  }

  /** Tolak sebelum inflate bila ukuran yang diakui header untuk part yang akan dibaca terlalu besar. */
  checkDeclared(names: string[]): void {
    const total = names.reduce(
      (sum, name) => sum + (this.entries.get(partKey(name))?.declared ?? 0),
      0,
    );
    if (total > MAX_EXTRACTED_BYTES) throw tooBig();
  }

  async text(name: string): Promise<string> {
    const entry = this.entries.get(partKey(name));
    if (!entry) throw notXlsx();
    const { offset, size, method } = entry;
    const budget = MAX_EXTRACTED_BYTES - this.extracted;
    if (entry.declared > budget) throw tooBig();
    if (
      offset + 30 > this.bytes.length ||
      this.view.getUint32(offset, true) !== LOCAL_SIG
    ) {
      throw notXlsx();
    }
    // Ukuran dari central directory: local header bisa berisi 0 (bit 3, data descriptor).
    const start =
      offset +
      30 +
      this.view.getUint16(offset + 26, true) +
      this.view.getUint16(offset + 28, true);
    if (start + size > this.bytes.length) throw notXlsx();
    const data = this.bytes.subarray(start, start + size);
    let raw: Uint8Array;
    if (method === 0) {
      if (data.length > budget) throw tooBig();
      raw = data;
    } else if (method === 8) raw = await inflateRaw(data, budget);
    else throw notXlsx();
    this.extracted += raw.length;
    return new TextDecoder().decode(raw);
  }

  async xml(name: string): Promise<Document> {
    const doc = new DOMParser().parseFromString(
      await this.text(name),
      "application/xml",
    );
    if (doc.getElementsByTagName("parsererror").length > 0) throw notXlsx();
    return doc;
  }
}

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
    zip.checkDeclared([
      "xl/workbook.xml",
      "xl/_rels/workbook.xml.rels",
      paths.sheet,
      ...(paths.shared === null ? [] : [paths.shared]),
    ]);
    const shared = await readSharedStrings(zip, paths.shared);
    return readRows(await zip.xml(paths.sheet), shared);
  } catch (err) {
    if (err instanceof ImportFileError) throw err;
    throw notXlsx();
  }
}
