import type { OpnameScope } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { CORRUPT_DRAFT, draftIdentity } from "../drafts/draft-shape";
import type { OpnameDraft } from "./opname-draft-types";

type Rec = Record<string, unknown>;

const isRec = (v: unknown): v is Rec => typeof v === "object" && v !== null;
const isStr = (v: unknown): v is string => typeof v === "string";
const isNum = (v: unknown): v is number => typeof v === "number";
const strOrNull = (v: unknown) => v === null || isStr(v);
const oneOf = (v: unknown, values: readonly string[]) =>
  isStr(v) && values.includes(v);

const isScope = (s: unknown): s is OpnameScope =>
  isRec(s) &&
  oneOf(s.kind, ["kategori", "tanpa_kategori", "semua"]) &&
  strOrNull(s.category);

const isUnit = (u: unknown) =>
  isRec(u) &&
  isStr(u.id) &&
  isStr(u.name) &&
  isNum(u.unitSize) &&
  Array.isArray(u.barcodes) &&
  u.barcodes.every(isStr);

const isProduct = (p: unknown) =>
  isRec(p) &&
  isStr(p.id) &&
  isStr(p.name) &&
  strOrNull(p.category) &&
  typeof p.isCurah === "boolean" &&
  oneOf(p.baseUnit, ["pcs", "gram", "ml"]) &&
  isStr(p.status) &&
  Array.isArray(p.units) &&
  p.units.every(isUnit);

const isCount = (c: unknown) =>
  isRec(c) && isNum(c.qtyBase) && isNum(c.countedAt);

const isError = (e: unknown) =>
  isRec(e) && strOrNull(e.productId) && isStr(e.message);

/** Bentuk lengkap yang dibaca layar dan sync; rekaman lama/rusak gagal di sini. */
function isIntactOpnameDraft(r: unknown): r is OpnameDraft {
  return (
    isRec(r) &&
    isStr(r.id) &&
    isStr(r.userId) &&
    isNum(r.createdAt) &&
    isNum(r.updatedAt) &&
    oneOf(r.status, ["counting", "queued", "rejected"]) &&
    isScope(r.scope) &&
    Array.isArray(r.products) &&
    r.products.every(isProduct) &&
    isRec(r.counts) &&
    Object.values(r.counts).every(isCount) &&
    Array.isArray(r.errors) &&
    r.errors.every(isError)
  );
}

export type OpnameRead = { draft: OpnameDraft; intact: boolean };

/**
 * Rekaman tersimpan → draf yang aman ditampilkan. Rekaman rusak tampil sebagai draf ditolak
 * "rusak" (lingkup dipertahankan bila utuh, tanpa hitungan) tanpa menimpa data aslinya;
 * tanpa id/pengguna → null (diabaikan).
 */
export function readOpnameDraft(raw: unknown): OpnameRead | null {
  if (isIntactOpnameDraft(raw)) return { draft: raw, intact: true };
  const identity = draftIdentity(raw);
  if (identity === null) return null;
  const scope = (raw as { scope?: unknown }).scope;
  return {
    intact: false,
    draft: {
      ...identity,
      status: "rejected",
      scope: isScope(scope) ? scope : { kind: "semua", category: null },
      products: [],
      counts: {},
      errors: [{ productId: null, message: CORRUPT_DRAFT }],
    },
  };
}
