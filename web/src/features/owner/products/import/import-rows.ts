import type {
  ImportCheck,
  ImportRow,
  ImportRowResult,
  ImportSummary,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import type { SheetRow } from "./read-xlsx";

export const MAX_FILE_BYTES = 5 * 1024 * 1024;

/** Data barang mulai baris 3 (baris 1 pita grup, baris 2 judul kolom). */
const FIRST_DATA_ROW = 3;

/** Kolom B–O sheet Barang, urut kolom; A (Status) dan P (Catatan) tidak diimpor. */
const COLUMNS = [
  ["B", "name"],
  ["C", "category"],
  ["D", "sellUnit"],
  ["E", "barcode"],
  ["F", "cost"],
  ["G", "price"],
  ["H", "tierMinQty"],
  ["I", "tierPrice"],
  ["J", "bigName"],
  ["K", "bigSize"],
  ["L", "bigBarcode"],
  ["M", "bigCost"],
  ["N", "bigPrice"],
  ["O", "minStock"],
] as const satisfies readonly (readonly [string, keyof ImportRow])[];

/** Sel B–O di-trim, "" → null; baris yang B–O semuanya kosong dibuang (template berisi ribuan baris rumus). */
export function toImportRows(rows: SheetRow[]): ImportRow[] {
  const out: ImportRow[] = [];
  for (const { row, cells } of rows) {
    if (row < FIRST_DATA_ROW) continue;
    const entries = COLUMNS.map(
      ([col, field]) => [field, cells[col]?.trim() || null] as const,
    );
    if (entries.every(([, v]) => v === null)) continue;
    out.push({ row, ...Object.fromEntries(entries) } as ImportRow);
  }
  return out;
}

const NUMBER_BARCODE: Partial<Record<string, string>> = {
  E: "Barcode tersimpan sebagai angka — ubah kolom ke Teks",
  L: "Barcode satuan besar tersimpan sebagai angka — ubah kolom ke Teks",
};

/**
 * Barcode yang tersimpan sebagai angka bisa kehilangan nol depan (089… → 89…),
 * sehingga ditolak walau angkanya kebetulan valid (keputusan C6). Masalah per baris Excel.
 */
export function numberBarcodeProblems(rows: SheetRow[]): Map<number, string[]> {
  const out = new Map<number, string[]>();
  for (const { row, numbers = [] } of rows) {
    if (row < FIRST_DATA_ROW) continue;
    const problems = numbers.flatMap((col) => NUMBER_BARCODE[col] ?? []);
    if (problems.length > 0) out.set(row, problems);
  }
  return out;
}

export type PreviewRow = { source: ImportRow; result: ImportRowResult };

export type Preview = {
  rows: PreviewRow[];
  summary: ImportSummary;
  /** Baris yang akan dikirim saat Impor: hanya yang di pratinjau baru atau diperbarui. */
  importable: ImportRow[];
};

const SUMMARY_KEY = {
  baru: "ready",
  diperbarui: "update",
  tidak_berubah: "unchanged",
  perbaiki: "invalid",
} as const satisfies Record<ImportRowResult["status"], keyof ImportSummary>;

/** Hasil periksa server digabung dengan masalah yang hanya terlihat di file (`local`). */
export function buildPreview(
  sent: ImportRow[],
  check: ImportCheck,
  local: ReadonlyMap<number, string[]>,
): Preview {
  const byRow = new Map(sent.map((r) => [r.row, r]));
  const summary: ImportSummary = {
    ready: 0,
    update: 0,
    unchanged: 0,
    invalid: 0,
  };
  const rows: PreviewRow[] = [];
  const importable: ImportRow[] = [];
  for (const result of check.rows) {
    const source = byRow.get(result.row);
    if (!source) continue;
    const extra = local.get(result.row) ?? [];
    const merged: ImportRowResult =
      extra.length === 0
        ? result
        : {
            row: result.row,
            status: "perbaiki",
            problems: [...extra, ...result.problems],
            changes: [],
            notes: [],
          };
    summary[SUMMARY_KEY[merged.status]] += 1;
    rows.push({ source, result: merged });
    if (merged.status === "baru" || merged.status === "diperbarui") {
      importable.push(source);
    }
  }
  return { rows, summary, importable };
}
