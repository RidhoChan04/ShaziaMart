import type {
  ImportCheck,
  ImportResult,
  ImportRow,
  ImportRowResult,
  ImportSummary,
  ProductField,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { parseRupiah } from "@/shared/lib/money";
import type { ProductDraft } from "@/shared/lib/product-rules";
import type { MockProduct, MockState } from "../db";
import {
  type ApplyOk,
  type ApplyOptions,
  applyDraft,
  saveApplied,
} from "./apply";
import { key } from "./checks";
import { MONEY_LABEL } from "./drafts";

const MAX_ROWS = 5000;

/** Kolom B–O sheet Barang, urut kolom. */
const CELLS = [
  "name",
  "category",
  "sellUnit",
  "barcode",
  "cost",
  "price",
  "tierMinQty",
  "tierPrice",
  "bigName",
  "bigSize",
  "bigBarcode",
  "bigCost",
  "bigPrice",
  "minStock",
] as const satisfies readonly ProductField[];

const text = (cell: string | null): string | null => cell?.trim() || null;

const isEmpty = (row: ImportRow): boolean =>
  CELLS.every((f) => text(row[f]) === null);

const safe = (n: number): number | null => (Number.isSafeInteger(n) ? n : null);

/** Uang: `3500`, `3.500`, `Rp3.500`, atau angka Excel `3500.0`. */
const toMoney = (cell: string): number | null =>
  parseRupiah(cell) ?? (/^\d+\.0+$/.test(cell) ? safe(Number(cell)) : null);
const toCount = (cell: string): number | null =>
  /^\d+(\.0+)?$/.test(cell) ? safe(Number(cell)) : null;
const toDecimal = (cell: string): number | null =>
  /^\d+([.,]\d+)?$/.test(cell) ? Number(cell.replace(",", ".")) : null;

/** Sel teks → draft; sel angka yang tidak terbaca menjadi null dengan pesan per kolom. */
export function draftFromImportRow(row: ImportRow): {
  draft: ProductDraft;
  problems: string[];
} {
  const problems: string[] = [];
  const num = (
    cell: string | null,
    parse: (cell: string) => number | null,
    message: string,
  ): number | null => {
    const t = text(cell);
    if (t === null) return null;
    const n = parse(t);
    if (n === null) problems.push(message);
    return n;
  };
  const money = (field: keyof typeof MONEY_LABEL) =>
    num(
      row[field],
      toMoney,
      `${MONEY_LABEL[field]}: ketik angka saja, mis. 3500`,
    );
  const draft: ProductDraft = {
    name: text(row.name),
    category: text(row.category),
    sellUnit: text(row.sellUnit),
    barcode: text(row.barcode),
    cost: money("cost"),
    price: money("price"),
    tierMinQty: num(row.tierMinQty, toCount, "Grosir: beli minimal 2 ke atas"),
    tierPrice: money("tierPrice"),
    bigName: text(row.bigName),
    bigSize: num(row.bigSize, toCount, "Satuan besar: isi berapa? (min. 2)"),
    bigBarcode: text(row.bigBarcode),
    bigCost: money("bigCost"),
    bigPrice: money("bigPrice"),
    minStock: num(
      row.minStock,
      toDecimal,
      "Batas stok menipis: isi angka, mis. 20",
    ),
  };
  return { draft, problems };
}

/** Body `ImportRequest` → baris (sel tanpa key = null); bentuk salah, nomor baris dobel, atau > 5000 baris → null. */
export function readImportRows(
  body: Record<string, unknown> | null,
): ImportRow[] | null {
  const rows = body?.rows;
  if (!Array.isArray(rows) || rows.length === 0 || rows.length > MAX_ROWS) {
    return null;
  }
  const out: ImportRow[] = [];
  const seen = new Set<unknown>();
  for (const raw of rows as unknown[]) {
    if (typeof raw !== "object" || raw === null) return null;
    const r = raw as Record<string, unknown>;
    if (typeof r.row !== "number" || !Number.isSafeInteger(r.row) || r.row < 3)
      return null;
    if (seen.has(r.row)) return null;
    seen.add(r.row);
    const cells = CELLS.map((f) => [f, r[f] ?? null] as const);
    if (cells.some(([, v]) => v !== null && typeof v !== "string")) return null;
    out.push({ row: r.row, ...Object.fromEntries(cells) } as ImportRow);
  }
  return out;
}

type Parsed = { source: ImportRow; draft: ProductDraft; problems: string[] };
type Pending = { problems: string[]; taken: Set<ProductField> };

/** Masalah awal tiap baris: sel tak terbaca lalu dobel di file (nama; barcode di kolom E ∪ L). */
function pendingProblems(parsed: Parsed[]): Pending[] {
  const counts = new Map<string, number>();
  const bump = (k: string) => counts.set(k, (counts.get(k) ?? 0) + 1);
  for (const { draft: d } of parsed) {
    if (d.name !== null) bump(`n:${key(d.name)}`);
    for (const code of new Set([d.barcode, d.bigBarcode])) {
      if (code !== null) bump(`b:${code}`);
    }
  }
  const dup = (k: string) => (counts.get(k) ?? 0) > 1;
  return parsed.map(({ source, draft: d, problems }) => {
    // Sel terisi yang hasilnya kosong = gagal dibaca; galat aturan untuk field itu tidak diulang.
    const taken = new Set<ProductField>(
      CELLS.filter((f) => text(source[f]) !== null && d[f] === null),
    );
    const out = [...problems];
    const add = (field: ProductField, message: string) => {
      out.push(message);
      taken.add(field);
    };
    if (d.name !== null && dup(`n:${key(d.name)}`)) {
      add("name", "Nama sama dengan baris lain");
    }
    if (d.barcode !== null && dup(`b:${d.barcode}`)) {
      add("barcode", "Barcode sudah dipakai barang lain");
    }
    if (d.bigBarcode !== null && dup(`b:${d.bigBarcode}`)) {
      add("bigBarcode", "Barcode satuan besar sudah dipakai");
    }
    return { problems: out, taken };
  });
}

/** Barang yang diperbarui baris ini (null = baru), atau masalah bentrok barcode. */
function matchTarget(
  state: Readonly<MockState>,
  d: ProductDraft,
): { target: MockProduct | null } | { problem: string } {
  if (d.name === null) return { target: null };
  const name = key(d.name);
  const owners: MockProduct[] = [];
  for (const code of [d.barcode, d.bigBarcode]) {
    const owner =
      code === null
        ? undefined
        : state.products.find((p) =>
            p.units.some((u) => u.barcodes.includes(code)),
          );
    if (owner && !owners.includes(owner)) owners.push(owner);
  }
  if (owners.length === 0) {
    return {
      target: state.products.find((p) => key(p.name) === name) ?? null,
    };
  }
  const other = owners.find((p) => key(p.name) !== name);
  if (other === undefined) return { target: owners[0] ?? null };
  return { problem: `Barcode sudah dipakai: ${other.name}` };
}

const importOptions = (now: number): ApplyOptions => ({
  mode: "merge",
  source: "impor",
  now,
});

const SUMMARY_KEY = {
  baru: "ready",
  diperbarui: "update",
  tidak_berubah: "unchanged",
  perbaiki: "invalid",
} as const satisfies Record<ImportRowResult["status"], keyof ImportSummary>;

/**
 * Periksa baris berurutan (nomor baris Excel) tanpa mengubah `state`. Baris siap
 * diterapkan ke salinan kerja sehingga nama/barcode-nya ikut dicek terhadap baris
 * berikutnya; `plans` = hasil baris baru & diperbarui, urut baris.
 */
export function checkImport(
  state: Readonly<MockState>,
  rows: ImportRow[],
  now: number,
): { check: ImportCheck; plans: Map<number, ApplyOk> } {
  const work = structuredClone(state) as MockState;
  const opts = importOptions(now);
  const parsed: Parsed[] = rows
    .filter((r) => !isEmpty(r))
    .sort((a, b) => a.row - b.row)
    .map((source) => ({ source, ...draftFromImportRow(source) }));
  const pending = pendingProblems(parsed);
  const plans = new Map<number, ApplyOk>();
  const results = parsed.map(({ source, draft }, i): ImportRowResult => {
    const { row } = source;
    const { problems, taken } = pending[i] as Pending;
    const fix = (more: string[]): ImportRowResult => ({
      row,
      status: "perbaiki",
      problems: [...problems, ...more],
      changes: [],
      notes: [],
    });
    const match = matchTarget(work, draft);
    if ("problem" in match) return fix([match.problem]);
    const r = applyDraft(work, match.target, draft, opts);
    if (!r.ok) {
      return fix(
        r.errors.filter((e) => !taken.has(e.field)).map((e) => e.message),
      );
    }
    if (problems.length > 0) return fix([]);
    const status = r.isNew
      ? "baru"
      : r.changes.length > 0
        ? "diperbarui"
        : "tidak_berubah";
    if (status !== "tidak_berubah") {
      saveApplied(work, r, opts);
      plans.set(row, r);
    }
    return { row, status, problems: [], changes: r.changes, notes: r.notes };
  });
  const summary: ImportSummary = {
    ready: 0,
    update: 0,
    unchanged: 0,
    invalid: 0,
  };
  for (const r of results) summary[SUMMARY_KEY[r.status]] += 1;
  return { check: { rows: results, summary }, plans };
}

/** Periksa ulang terhadap `state` lalu simpan semua baris baru & diperbarui (atomik lewat `mockDb.update`). */
export function commitImport(
  state: MockState,
  rows: ImportRow[],
  now: number,
): ImportResult {
  const { check, plans } = checkImport(state, rows, now);
  for (const plan of plans.values()) {
    saveApplied(state, plan, importOptions(now));
  }
  const { ready, update } = check.summary;
  return {
    created: ready,
    updated: update,
    skipped: check.rows.length - ready - update,
  };
}
