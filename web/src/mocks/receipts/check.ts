import type {
  NewProductInput,
  ProductCost,
  ReceiptError,
  ReceiptField,
  ReceiptInput,
  ReceiptLineInput,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { jakartaIsoDate } from "@/shared/lib/business-day";
import {
  newProductUnits,
  RECEIPT_TOO_LARGE,
  validateReceipt,
} from "@/shared/lib/receipt-rules";
import type { MockState } from "../db";
import { mockPhotos } from "../photos";
import { key } from "../products/checks";
import { receiveCost } from "./hpp";

const err = (
  lineId: string | null,
  field: ReceiptField,
  message: string,
): ReceiptError => ({ lineId, field, message });

/** R13: HPP rusak (qtyBase ≤ 0) dianggap belum ada agar rumus K3 tidak membagi nol. */
export const usableCost = (c: ProductCost | null): ProductCost | null =>
  c !== null && c.qtyBase > 0 && c.amount >= 0 ? c : null;

type Received = { stock: number; cost: ProductCost };

/** Stok & HPP sesudah satu baris masuk (K3); null bila di luar bilangan bulat aman (R13). */
export function afterReceive(
  prev: ProductCost | null,
  stock: number,
  qtyIn: number,
  lineCost: number,
): Received | null {
  const next = stock + qtyIn;
  if (
    !Number.isSafeInteger(qtyIn) ||
    qtyIn <= 0 ||
    !Number.isSafeInteger(next)
  ) {
    return null;
  }
  try {
    const cost = receiveCost(usableCost(prev), stock, qtyIn, lineCost);
    return Number.isSafeInteger(cost.amount) ? { stock: next, cost } : null;
  } catch (e) {
    if (e instanceof RangeError) return null;
    throw e;
  }
}

/** Satuan nota barang baru: satuan besar bila berbeda dari `Dijual per`, selain itu eceran. */
function notaUnitSize(n: NewProductInput): number | null {
  try {
    const units = newProductUnits(n);
    return units && (units.nota ?? units.eceran).unitSize;
  } catch (e) {
    if (e instanceof RangeError) return null;
    throw e;
  }
}

/** Aturan server per baris barang terdaftar; satuan tidak aktif diteruskan sebagai `unitId: null`. */
function checkProductLine(
  state: Readonly<MockState>,
  l: ReceiptLineInput,
  out: ReceiptError[],
): ReceiptLineInput {
  if (l.productId === null || l.newProduct !== null) return l;
  const p = state.products.find((x) => x.id === l.productId);
  if (p === undefined) {
    out.push(err(l.lineId, "product", "Barang tidak ditemukan"));
    return l;
  }
  if (p.status === "nonaktif") {
    out.push(err(l.lineId, "product", "Barang ini tidak dijual lagi"));
    return l;
  }
  const active = p.units.some((u) => u.active && u.id === l.unitId);
  // validateReceipt memberi galat `unit` untuk satuan kosong (satu sumber pesan, R11).
  return active ? l : { ...l, unitId: null };
}

/** Nama/barcode barang baru yang sudah dipakai barang lain (termasuk satuan nonaktif). */
function newProductErrors(
  state: Readonly<MockState>,
  lines: readonly ReceiptLineInput[],
  flagged: ReadonlySet<string>,
): ReceiptError[] {
  const out: ReceiptError[] = [];
  for (const { lineId, newProduct: n } of lines) {
    if (n === null) continue;
    if (
      !flagged.has(`${lineId}:newName`) &&
      state.products.some((p) => key(p.name) === key(n.name))
    ) {
      out.push(err(lineId, "newName", "Nama sudah dipakai barang lain"));
    }
    const code = n.barcode;
    const owner =
      code === null || flagged.has(`${lineId}:newBarcode`)
        ? undefined
        : state.products.find((p) =>
            p.units.some((u) => u.barcodes.includes(code)),
          );
    if (owner) {
      out.push(
        err(lineId, "newBarcode", `Barcode sudah dipakai: ${owner.name}`),
      );
    }
  }
  return out;
}

/** Stok & HPP berjalan per barang selama nota diperiksa. */
type Running = { stock: number; cost: ProductCost | null };
type Slot = { slot: string; size: number; start: Running };

/** Barang & isi satuan nota sebuah baris (barang baru: stok 0, HPP null); "besar" bila isi meluap. */
function slotOf(
  state: Readonly<MockState>,
  l: ReceiptLineInput,
): Slot | "besar" | null {
  if (l.newProduct !== null) {
    const size = notaUnitSize(l.newProduct);
    if (size === null) return "besar";
    return { slot: `baru:${l.lineId}`, size, start: { stock: 0, cost: null } };
  }
  const p = state.products.find((x) => x.id === l.productId);
  const unit = p?.units.find((u) => u.id === l.unitId);
  if (!p || !unit) return null; // sudah ditolak checkProductLine
  const start = { stock: state.stock[p.id] ?? 0, cost: p.cost };
  return { slot: p.id, size: unit.unitSize, start };
}

/** R13: jumlah satuan dasar, stok, dan HPP setiap baris (berurutan) tetap bilangan bulat aman. */
function overflowErrors(
  state: Readonly<MockState>,
  lines: readonly ReceiptLineInput[],
): ReceiptError[] {
  const out: ReceiptError[] = [];
  // Barang yang sama di beberapa baris: stok & HPP berjalan.
  const sim = new Map<string, Running>();
  for (const l of lines) {
    const target = slotOf(state, l);
    if (target === "besar") {
      out.push(err(l.lineId, "newNotaUnitSize", RECEIPT_TOO_LARGE));
      continue;
    }
    if (target === null) continue;
    const cur = sim.get(target.slot) ?? target.start;
    const qtyIn = l.qty * target.size;
    const next = afterReceive(cur.cost, cur.stock, qtyIn, l.qty * l.unitCost);
    if (next === null) out.push(err(l.lineId, "qty", RECEIPT_TOO_LARGE));
    else sim.set(target.slot, next);
  }
  return out;
}

/**
 * Semua galat nota terhadap state sekarang: aturan bersama `validateReceipt`, lalu aturan
 * server (barang, satuan, nama/barcode barang baru, foto milik `userId`, batas aman).
 */
export function checkReceipt(
  state: Readonly<MockState>,
  input: ReceiptInput,
  userId: string,
  now: number,
): ReceiptError[] {
  const server: ReceiptError[] = [];
  const lines = input.lines.map((l) => checkProductLine(state, l, server));
  const errors = validateReceipt(
    { ...input, lines },
    { today: jakartaIsoDate(now), shiftOpen: state.shift !== null },
  );
  const flagged = new Set(errors.map((e) => `${e.lineId}:${e.field}`));
  errors.push(...server, ...newProductErrors(state, input.lines, flagged));
  if (
    input.photoId !== null &&
    mockPhotos.load(input.photoId)?.ownerId !== userId
  ) {
    errors.push(err(null, "photoId", "Foto nota belum terkirim"));
  }
  return errors.length > 0 ? errors : overflowErrors(state, input.lines);
}
