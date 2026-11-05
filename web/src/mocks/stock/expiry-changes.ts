import { isIsoDate } from "@/shared/lib/business-day";
import { newId } from "@/shared/lib/id";
import { formatQty } from "@/shared/lib/quantity";
import type { MockReceipt, MockState } from "../db";
import { invalid, problem } from "../handlers/respond";
import { eceranOf } from "../products/views";
import { editChanges } from "../receipts/audit";
import { audit } from "../receipts/revise";
import { productById, supplierNameOf } from "./expiry";
import { shipmentsOf } from "./fifo";
import { diffValue } from "./opname-value";

const ID_MAX = 64;

const lotNotFound = (): Response =>
  problem(404, "NOT_FOUND", "Kiriman tidak ditemukan");

/** Baris nota aktif `(receiptId, lineId)`; `lineId` hanya unik di dalam notanya (K9). */
function activeLine(
  state: Readonly<MockState>,
  receiptId: string,
  lineId: string,
) {
  const r = state.receipts.find(
    (x) => x.id === receiptId && x.status === "aktif",
  );
  const line = r?.lines.find((l) => l.lineId === lineId);
  return r && line ? { r, line } : null;
}

export type Removal = {
  id: string;
  receiptId: string;
  lineId: string;
  qtyBase: number;
};

const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

/**
 * K9 (J6): isian keluarkan sah dan `1 ≤ qtyBase ≤ capacity` kiriman itu. `id` yang sudah
 * tercatat lolos tanpa pemeriksaan lagi agar kirim ulang tetap 204 (`applyRemoval` tidak mencatat).
 */
export function checkRemoval(
  state: Readonly<MockState>,
  input: unknown,
): Removal | Response {
  if (
    !isObj(input) ||
    typeof input.id !== "string" ||
    input.id.length < 1 ||
    input.id.length > ID_MAX ||
    typeof input.receiptId !== "string" ||
    typeof input.lineId !== "string"
  ) {
    return invalid("Data pengeluaran tidak valid");
  }
  const { id, receiptId, lineId, qtyBase } = input;
  if (typeof qtyBase !== "number" || !Number.isSafeInteger(qtyBase)) {
    return invalid("Jumlah tidak valid");
  }
  const removal = { id, receiptId, lineId, qtyBase };
  if (state.expiryLog.some((e) => e.id === id)) return removal;
  const found = activeLine(state, receiptId, lineId);
  if (!found) return lotNotFound();
  if (qtyBase < 1) return invalid("Jumlah minimal 1");
  const productId = found.line.productId;
  const shipment = shipmentsOf(state, productId).find(
    (s) => s.receiptId === receiptId && s.lineId === lineId,
  );
  const capacity = Math.max(
    0,
    (shipment?.qtyBase ?? 0) - (shipment?.removedQtyBase ?? 0),
  );
  if (qtyBase > capacity) {
    const eceran = eceranOf(productById(state, productId));
    const qty = formatQty(capacity, eceran.unitSize, eceran.name);
    return invalid(`Jumlah melebihi kiriman ini (${qty})`);
  }
  return removal;
}

/** Keluarkan yang sudah lolos `checkRemoval`; idempoten per `id`. Stok boleh jadi minus. */
export function applyRemoval(
  state: MockState,
  r: Removal,
  actorName: string,
  now: number,
): void {
  if (state.expiryLog.some((e) => e.id === r.id)) return;
  const found = activeLine(state, r.receiptId, r.lineId);
  if (!found) throw new Error("Pengeluaran belum dicek");
  const p = productById(state, found.line.productId);
  state.stock[p.id] = (state.stock[p.id] ?? 0) - r.qtyBase;
  state.stockEntries.push({
    id: newId(now),
    productId: p.id,
    at: now,
    effectiveAt: now,
    qtyBase: -r.qtyBase,
    actorName,
    kind: "keluar_kedaluwarsa",
    receiptId: r.receiptId,
    lineId: r.lineId,
    opnameId: null,
    reason: null,
  });
  state.expiryLog.push({
    id: r.id,
    at: now,
    actorName,
    kind: "keluar",
    productId: p.id,
    receiptId: r.receiptId,
    lineId: r.lineId,
    qtyBase: r.qtyBase,
    fromDate: null,
    toDate: null,
    lossValue: diffValue(r.qtyBase, p.cost),
  });
}

/** K11: kiriman harus aktif (404) dan tanggal wajib & sah (422); hasilnya tanggal baru. */
export function checkExpiryDate(
  state: Readonly<MockState>,
  receiptId: string,
  lineId: string,
  input: unknown,
): string | Response {
  if (!activeLine(state, receiptId, lineId)) return lotNotFound();
  const date = isObj(input) ? input.expiryDate : undefined;
  return typeof date === "string" && isIsoDate(date)
    ? date
    : invalid("Tanggal kedaluwarsa tidak valid");
}

/** K11: ubah ED satu kiriman + audit nota + log; tanggal sama → tanpa perubahan. */
export function applyExpiryDate(
  state: MockState,
  receiptId: string,
  lineId: string,
  expiryDate: string,
  actorName: string,
  now: number,
): void {
  const found = activeLine(state, receiptId, lineId);
  if (!found) throw new Error("Kiriman belum dicek");
  const { r, line } = found;
  if (line.expiryDate === expiryDate) return;
  const before: MockReceipt = structuredClone(r);
  const fromDate = line.expiryDate;
  line.expiryDate = expiryDate;
  r.editedByName = actorName;
  r.editedAt = now;
  const changes = editChanges(before, r, (id) => supplierNameOf(state, id));
  audit(state, r, "ubah", actorName, changes, now);
  state.expiryLog.push({
    id: newId(now),
    at: now,
    actorName,
    kind: "ubah_ed",
    productId: line.productId,
    receiptId,
    lineId,
    qtyBase: null,
    fromDate,
    toDate: expiryDate,
    lossValue: null,
  });
}
