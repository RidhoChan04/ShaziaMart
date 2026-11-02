/** Isi data URL hasil import `?inline` (base64) sebagai byte. */
export function dataUrlBytes(url: string): Uint8Array<ArrayBuffer> {
  const base64 = url.slice(url.indexOf(",") + 1);
  return Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
}

/** Salinan ArrayBuffer tersendiri (seperti `File.arrayBuffer()`). */
export const bufferOf = (bytes: Uint8Array): ArrayBuffer =>
  bytes.slice().buffer as ArrayBuffer;

async function deflateRaw(data: Uint8Array<ArrayBuffer>): Promise<Uint8Array> {
  const stream = new ReadableStream<BufferSource>({
    start(controller) {
      controller.enqueue(data);
      controller.close();
    },
  }).pipeThrough(new CompressionStream("deflate-raw"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

/**
 * Zip minimal untuk test pembaca xlsx: entri `stored` (metode 0) atau dikompres
 * (metode 8). CRC diisi 0 karena pembaca tidak memeriksanya.
 */
export async function makeZip(
  files: Record<string, string>,
  { stored = false }: { stored?: boolean | undefined } = {},
): Promise<ArrayBuffer> {
  const encoder = new TextEncoder();
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const [name, text] of Object.entries(files)) {
    const nameBytes = encoder.encode(name);
    const raw = encoder.encode(text);
    const data = stored ? raw : await deflateRaw(raw);
    const method = stored ? 0 : 8;

    const local = new Uint8Array(30 + nameBytes.length + data.length);
    const lv = new DataView(local.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(8, method, true);
    lv.setUint32(18, data.length, true);
    lv.setUint32(22, raw.length, true);
    lv.setUint16(26, nameBytes.length, true);
    local.set(nameBytes, 30);
    local.set(data, 30 + nameBytes.length);

    const central = new Uint8Array(46 + nameBytes.length);
    const cv = new DataView(central.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(10, method, true);
    cv.setUint32(20, data.length, true);
    cv.setUint32(24, raw.length, true);
    cv.setUint16(28, nameBytes.length, true);
    cv.setUint32(42, offset, true);
    central.set(nameBytes, 46);

    locals.push(local);
    centrals.push(central);
    offset += local.length;
  }
  const centralSize = centrals.reduce((n, c) => n + c.length, 0);
  const end = new Uint8Array(22);
  const ev = new DataView(end.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, centrals.length, true);
  ev.setUint16(10, centrals.length, true);
  ev.setUint32(12, centralSize, true);
  ev.setUint32(16, offset, true);
  const parts = [...locals, ...centrals, end];
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0));
  let at = 0;
  for (const part of parts) {
    out.set(part, at);
    at += part.length;
  }
  return out.buffer;
}

const MAIN = "http://schemas.openxmlformats.org/spreadsheetml/2006/main";
const REL =
  "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG = "http://schemas.openxmlformats.org/package/2006/relationships";

export type XlsxBook = {
  /** Isi `<sheetData>` sheet "Barang" (atau `sheetName`). */
  rows: string;
  shared?: string;
  sheetName?: string;
  /** Target relasi sheet di workbook.xml.rels. */
  target?: string;
  stored?: boolean;
};

/** Workbook kecil: sheet "Petunjuk" (berisi teks pengecoh) lalu sheet data (default "Barang") di sheet2.xml. */
export function makeXlsx({
  rows,
  shared,
  sheetName = "Barang",
  target = "worksheets/sheet2.xml",
  stored,
}: XlsxBook): Promise<ArrayBuffer> {
  const files: Record<string, string> = {
    "[Content_Types].xml": "<Types/>",
    "xl/workbook.xml": `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="${MAIN}" xmlns:r="${REL}"><sheets>
<sheet name="Petunjuk" sheetId="1" r:id="rId1"/>
<sheet name="${sheetName}" sheetId="2" r:id="rId2"/>
</sheets></workbook>`,
    "xl/_rels/workbook.xml.rels": `<Relationships xmlns="${PKG}">
<Relationship Id="rId1" Type="${REL}/worksheet" Target="worksheets/sheet1.xml"/>
<Relationship Id="rId2" Type="${REL}/worksheet" Target="${target}"/>
${shared === undefined ? "" : `<Relationship Id="rId3" Type="${REL}/sharedStrings" Target="sharedStrings.xml"/>`}
</Relationships>`,
    "xl/worksheets/sheet1.xml": `<worksheet xmlns="${MAIN}"><sheetData><row r="3"><c r="B3" t="inlineStr"><is><t>sheet salah</t></is></c></row></sheetData></worksheet>`,
    "xl/worksheets/sheet2.xml": `<worksheet xmlns="${MAIN}"><sheetData>${rows}</sheetData></worksheet>`,
  };
  if (shared !== undefined) {
    files["xl/sharedStrings.xml"] = `<sst xmlns="${MAIN}">${shared}</sst>`;
  }
  return makeZip(files, { stored });
}
