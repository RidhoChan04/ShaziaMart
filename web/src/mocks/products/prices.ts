import type {
  FieldError,
  PriceLineInput,
  ProductField,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  activeBigUnit,
  type ProductDraft,
  validateDraft,
} from "@/shared/lib/product-rules";
import type { MockProduct, MockState, MockUnit } from "../db";
import type { ApplyResult } from "./apply";
import { changesOf, priceEntriesOf } from "./changes";
import { draftFromProduct, MONEY_LABEL } from "./drafts";
import { eceranOf } from "./views";

type PriceField = "price" | "tierPrice" | "bigPrice";
const PRICE_FIELDS: ReadonlySet<ProductField> = new Set<PriceField>([
  "price",
  "tierPrice",
  "bigPrice",
]);

/** Field draft untuk satu baris harga, atau pesan galatnya. */
function fieldOf(
  line: PriceLineInput,
  d: ProductDraft,
  eceran: MockUnit,
  big: MockUnit | null,
): PriceField | FieldError {
  const isEceran = line.unitId === eceran.id;
  if (!isEceran && line.unitId !== big?.id) {
    return { field: "price", message: "Satuan tidak ditemukan" };
  }
  if (line.tierMinQty === null) return isEceran ? "price" : "bigPrice";
  // Model barang: satu tier grosir, hanya di satuan eceran.
  if (isEceran && line.tierMinQty === d.tierMinQty) return "tierPrice";
  return { field: "tierPrice", message: "Grosir tidak ditemukan" };
}

/** Isi harga baris ke draft; galat tipe/baris dikembalikan. */
function setPrices(
  d: ProductDraft,
  lines: readonly PriceLineInput[],
  eceran: MockUnit,
  big: MockUnit | null,
): FieldError[] {
  const errors: FieldError[] = [];
  for (const line of lines) {
    const field = fieldOf(line, d, eceran, big);
    if (typeof field !== "string") errors.push(field);
    else if (Number.isSafeInteger(line.price) && line.price >= 1) {
      d[field] = line.price;
    } else {
      const message = `${MONEY_LABEL[field]}: ketik angka saja, mis. 3500`;
      errors.push({ field, message });
    }
  }
  return errors;
}

function withPrices(
  p: MockProduct,
  d: ProductDraft,
  bigId: string | undefined,
): MockProduct {
  const product = structuredClone(p);
  const [eceran, ...rest] = product.units;
  if (eceran) {
    eceran.price = d.price ?? eceran.price;
    const tier = eceran.wholesaleTiers[0];
    if (tier) tier.price = d.tierPrice ?? tier.price;
  }
  const big = rest.find((u) => u.id === bigId);
  if (big) big.price = d.bigPrice ?? big.price;
  return product;
}

/** Body `PriceLinesInput` → baris harga (harga bukan angka = NaN, ditolak per field); bentuk salah → null. */
export function readPriceLines(
  body: Record<string, unknown> | null,
): PriceLineInput[] | null {
  const lines = body?.lines;
  if (!Array.isArray(lines) || lines.length === 0) return null;
  const out: PriceLineInput[] = [];
  for (const line of lines as unknown[]) {
    if (typeof line !== "object" || line === null) return null;
    const {
      unitId,
      tierMinQty = null,
      price,
    } = line as Record<string, unknown>;
    if (typeof unitId !== "string") return null;
    if (tierMinQty !== null && typeof tierMinQty !== "number") return null;
    out.push({
      unitId,
      tierMinQty,
      price: typeof price === "number" ? price : Number.NaN,
    });
  }
  return out;
}

/**
 * Lembar ubah harga: ganti harga baris (eceran, tier grosir eceran, satuan besar aktif)
 * lalu validasi hanya field harga, agar isian lain barang tidak menghalangi.
 */
export function applyPriceLines(
  state: Readonly<MockState>,
  p: MockProduct,
  lines: PriceLineInput[],
  now: number,
): ApplyResult {
  const d = draftFromProduct(state, p);
  const big = activeBigUnit(p);
  const errors = setPrices(d, lines, eceranOf(p), big);
  const taken = new Set(errors.map((e) => e.field));
  errors.push(
    ...validateDraft(d).filter(
      (e) => PRICE_FIELDS.has(e.field) && !taken.has(e.field),
    ),
  );
  if (errors.length > 0) return { ok: false, errors };

  const product = withPrices(p, d, big?.id);
  const minStock = state.minStock[p.id] ?? null;
  return {
    ok: true,
    product,
    isNew: false,
    changes: changesOf(p, minStock, product, minStock),
    notes: [],
    priceEntries: priceEntriesOf(p, product, "pemilik", now),
    costChanged: false,
    minStock,
  };
}
