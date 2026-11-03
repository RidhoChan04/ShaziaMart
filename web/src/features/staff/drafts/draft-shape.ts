import type { DraftPhoto, ReceiptDraft } from "./draft-types";

/** Pesan untuk draf yang rekamannya rusak di HP (tidak bisa dibaca/dikirim). */
export const CORRUPT_DRAFT = "Draf ini rusak — buka dan periksa lagi";

type Rec = Record<string, unknown>;

const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null;
const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number";
const strOrNull = (v: unknown) => v === null || isStr(v);
const oneOf = (v: unknown, values: readonly string[]) =>
  isStr(v) && values.includes(v);

const isUnit = (u: unknown) =>
  isRec(u) &&
  isStr(u.id) &&
  isStr(u.name) &&
  isNum(u.unitSize) &&
  Array.isArray(u.barcodes);

const isProduct = (p: unknown) =>
  p === null ||
  (isRec(p) &&
    isStr(p.id) &&
    isStr(p.name) &&
    Array.isArray(p.units) &&
    p.units.every(isUnit));

const NEW_PRODUCT_TEXT = [
  "name",
  "sellUnit",
  "notaUnit",
  "notaUnitSize",
  "barcode",
] as const;

const isNewProduct = (n: unknown) =>
  n === null || (isRec(n) && NEW_PRODUCT_TEXT.every((k) => isStr(n[k])));

const isLine = (l: unknown) =>
  isRec(l) &&
  isStr(l.lineId) &&
  isProduct(l.product) &&
  strOrNull(l.unitId) &&
  isNewProduct(l.newProduct) &&
  isNum(l.qty) &&
  isStr(l.unitCostText) &&
  strOrNull(l.expiryDate);

const isPayment = (p: unknown) =>
  isRec(p) &&
  oneOf(p.timing, ["sekarang", "nanti"]) &&
  oneOf(p.method, ["tunai", "transfer"]) &&
  oneOf(p.cashSource, ["laci", "pemilik"]) &&
  strOrNull(p.dueDate);

const isForm = (f: unknown) =>
  isRec(f) &&
  isStr(f.supplierName) &&
  isStr(f.notaDate) &&
  Array.isArray(f.lines) &&
  f.lines.every(isLine) &&
  isPayment(f.payment);

export const isPhoto = (p: unknown): p is DraftPhoto =>
  isRec(p) &&
  isStr(p.id) &&
  p.blob instanceof Blob &&
  isNum(p.takenAt) &&
  isNum(p.bytes) &&
  typeof p.uploaded === "boolean";

const isError = (e: unknown) =>
  isRec(e) && strOrNull(e.lineId) && isStr(e.field) && isStr(e.message);

/** Bentuk lengkap yang dibaca layar dan sync; rekaman lama/rusak gagal di sini. */
export function isIntactDraft(r: unknown): r is ReceiptDraft {
  return (
    isRec(r) &&
    isStr(r.id) &&
    isStr(r.userId) &&
    isNum(r.createdAt) &&
    isNum(r.updatedAt) &&
    oneOf(r.status, ["editing", "queued", "rejected"]) &&
    isForm(r.form) &&
    (r.photo === null || isPhoto(r.photo)) &&
    Array.isArray(r.errors) &&
    r.errors.every(isError)
  );
}

/** Identitas minimum agar rekaman rusak tetap bisa ditampilkan ke pemiliknya (dan dibuang). */
export function draftIdentity(
  r: unknown,
): Pick<ReceiptDraft, "id" | "userId" | "createdAt" | "updatedAt"> | null {
  if (!isRec(r) || !isStr(r.id) || !isStr(r.userId)) return null;
  const createdAt = isNum(r.createdAt) ? r.createdAt : 0;
  return {
    id: r.id,
    userId: r.userId,
    createdAt,
    updatedAt: isNum(r.updatedAt) ? r.updatedAt : createdAt,
  };
}
