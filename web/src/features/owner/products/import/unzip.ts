// Pembaca zip minimal untuk .xlsx: entri lewat central directory, inflate lewat
// DecompressionStream. Hanya dipakai read-xlsx.ts, jadi ikut chunk malas pembaca xlsx.
// Tidak didukung (file .xlsx biasa tidak memakainya), semuanya berakhir sebagai galat
// "bukan file .xlsx": zip64 (offset 0xFFFFFFFF di luar file), enkripsi (file Office
// terenkripsi bukan zip; entri zip terenkripsi gagal di-inflate atau XML-nya rusak), dan
// CRC tidak diperiksa (data rusak tertangkap oleh inflate atau parser XML).

/** Galat yang pesannya langsung ditampilkan ke pemilik. */
export class ImportFileError extends Error {}

export const notXlsx = () =>
  new ImportFileError("File ini bukan file .xlsx yang bisa dibaca");
export const tooBig = () =>
  new ImportFileError("File terlalu besar atau rusak");

/** Total hasil ekstrak part yang dibaca (template 2000 baris ±6 MB); menahan bom dekompresi. */
const MAX_EXTRACTED_BYTES = 20 * 1024 * 1024;

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

export class Zip {
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

  async text(name: string): Promise<string> {
    const entry = this.entries.get(partKey(name));
    if (!entry) throw notXlsx();
    const { offset, size, method } = entry;
    const budget = MAX_EXTRACTED_BYTES - this.extracted;
    // Tolak lebih awal bila header mengaku besar; header yang berbohong ditahan saat inflate.
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
