import type {
  ProductCost,
  ReceiptEdit,
  ReceiptError,
  ReceiptField,
  ReceiptLine,
  ReceiptLineEdit,
  ReceiptPayment,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { jakartaIsoDate } from "@/shared/lib/business-day";
import { newId } from "@/shared/lib/id";
import {
  RECEIPT_LINES_MISMATCH,
  RECEIPT_PAYMENT_LOCKED,
  RECEIPT_TOO_LARGE,
  receiptLineTotal,
  validateReceipt,
} from "@/shared/lib/receipt-rules";
import type { MockAuditEntry, MockReceipt, MockState, MockUser } from "../db";
import { key } from "../products/checks";
import { CASH_NOT_RECORDED, editChanges } from "./audit";
import { addCashOut, laciPaid } from "./cash";
import { upsertSupplier } from "./receive";
import { productOf, setCost, stepOf } from "./revise-step";

const err = (
  lineId: string | null,
  field: ReceiptField,
  message: string,
): ReceiptError => ({ lineId, field, message });

const samePayment = (a: ReceiptPayment, b: ReceiptPayment): boolean =>
  a.timing === b.timing &&
  a.method === b.method &&
  a.cashSource === b.cashSource &&
  a.dueDate === b.dueDate;

/** K5: lineId isian ubah tepat sama dengan baris tersimpan (tanpa tambah, hapus, atau kembar). */
function editLines(
  r: MockReceipt,
  edit: ReceiptEdit,
): Map<string, ReceiptLineEdit> | null {
  const byId = new Map(edit.lines.map((l) => [l.lineId, l]));
  const same =
    byId.size === edit.lines.length &&
    byId.size === r.lines.length &&
    r.lines.every((l) => byId.has(l.lineId));
  return same ? byId : null;
}

const lineChanged = (l: ReceiptLine, e: ReceiptLineEdit): boolean =>
  l.qty !== e.qty || l.unitCost !== e.unitCost;

/** R13: stok & HPP setiap baris yang berubah (berurutan, barang sama berjalan) tetap aman. */
function overflowErrors(
  state: Readonly<MockState>,
  r: MockReceipt,
  lines: ReadonlyMap<string, ReceiptLineEdit>,
): ReceiptError[] {
  const out: ReceiptError[] = [];
  const sim = new Map<string, { stock: number; cost: ProductCost | null }>();
  for (const l of r.lines) {
    const e = lines.get(l.lineId);
    if (!e || !lineChanged(l, e)) continue;
    const cur = sim.get(l.productId) ?? {
      stock: state.stock[l.productId] ?? 0,
      cost: productOf(state, l.productId).cost,
    };
    const step = stepOf(cur.cost, cur.stock, l, e);
    if (step === "besar") out.push(err(l.lineId, "qty", RECEIPT_TOO_LARGE));
    else sim.set(l.productId, { stock: step.stock, cost: step.cost });
  }
  return out;
}

/**
 * Galat ubah nota: baris tepat sama, aturan `validateReceipt`, pembayaran hanya untuk Bayar
 * nanti yang belum lunas. Pembayaran tidak berubah tidak diperiksa ulang terhadap shift (R6).
 */
export function checkEdit(
  state: Readonly<MockState>,
  r: MockReceipt,
  edit: ReceiptEdit,
  now: number,
): ReceiptError[] {
  const lines = editLines(r, edit);
  if (lines === null) return [err(null, "lines", RECEIPT_LINES_MISMATCH)];
  const changed = !samePayment(r.payment, edit.payment);
  const editable = r.payment.timing === "nanti" && r.paid === null;
  const payment = changed && editable ? edit.payment : r.payment;
  const errors = validateReceipt(
    {
      supplierName: edit.supplierName,
      notaDate: edit.notaDate,
      lines: r.lines.map((l) => {
        const e = lines.get(l.lineId);
        return {
          lineId: l.lineId,
          productId: l.productId,
          unitId: l.unitId,
          newProduct: null,
          qty: e?.qty ?? null,
          unitCost: e?.unitCost ?? null,
          expiryDate: e?.expiryDate ?? null,
        };
      }),
      payment,
    },
    {
      today: jakartaIsoDate(now),
      shiftOpen: payment === r.payment || state.shift !== null,
    },
  );
  if (changed && !editable) {
    errors.push(err(null, "payment", RECEIPT_PAYMENT_LOCKED));
  }
  return errors.length > 0 ? errors : overflowErrors(state, r, lines);
}

function audit(
  state: MockState,
  r: MockReceipt,
  action: MockAuditEntry["action"],
  actor: MockUser,
  changes: string[],
  now: number,
): void {
  state.receiptAudit.push({
    id: newId(now),
    receiptId: r.id,
    at: now,
    actorName: actor.name,
    action,
    changes,
  });
}

/** Koreksi uang laci di shift yang sedang buka; tanpa shift → catatan audit (K6). */
function correctCash(
  state: MockState,
  r: MockReceipt,
  amount: number,
  now: number,
): string[] {
  if (amount === 0 || addCashOut(state, amount, r.id, "koreksi", now)) {
    return [];
  }
  return [CASH_NOT_RECORDED];
}

const supplierNameOf = (state: Readonly<MockState>, id: string): string =>
  state.suppliers.find((s) => s.id === id)?.name ?? "";

/** Ubah nota yang sudah lolos `checkEdit`: HPP, stok, isi nota, uang laci, audit. */
export function applyEdit(
  state: MockState,
  r: MockReceipt,
  edit: ReceiptEdit,
  actor: MockUser,
  now: number,
): void {
  const before = structuredClone(r);
  for (const l of r.lines) {
    const e = edit.lines.find((x) => x.lineId === l.lineId);
    if (!e) throw new Error("Nota belum dicek");
    if (lineChanged(l, e)) {
      const p = productOf(state, l.productId);
      const step = stepOf(p.cost, state.stock[p.id] ?? 0, l, e);
      if (step === "besar") throw new RangeError("Nota belum dicek");
      setCost(state, p, step.cost, now);
      state.stock[p.id] = step.stock;
      if (step.delta !== 0) {
        state.stockEntries.push({
          id: newId(now),
          productId: p.id,
          receiptId: r.id,
          at: now,
          kind: "koreksi_masuk",
          qtyBase: step.delta,
          actorName: actor.name,
        });
      }
    }
    l.qty = e.qty;
    l.unitCost = e.unitCost;
    l.subtotal = receiptLineTotal(e.qty, e.unitCost);
    l.expiryDate = e.expiryDate;
  }
  if (key(edit.supplierName) !== key(supplierNameOf(state, r.supplierId))) {
    r.supplierId = upsertSupplier(state, edit.supplierName, now).id;
  }
  r.notaDate = edit.notaDate;
  r.payment = { ...edit.payment };
  const changes = editChanges(before, r, (id) => supplierNameOf(state, id));
  changes.push(...correctCash(state, r, laciPaid(r) - laciPaid(before), now));
  if (changes.length === 0) return;
  r.editedByName = actor.name;
  r.editedAt = now;
  audit(state, r, "ubah", actor, changes, now);
}

/** Batalkan nota (idempoten): stok & HPP dibalik, uang laci dikembalikan, audit atas nama pemilik. */
export function applyCancel(
  state: MockState,
  r: MockReceipt,
  actor: MockUser,
  now: number,
): void {
  if (r.status === "dibatalkan") return;
  for (const l of r.lines) {
    const p = productOf(state, l.productId);
    const stock = state.stock[p.id] ?? 0;
    const step = stepOf(p.cost, stock, l, null);
    // Batal tidak pernah 422: HPP di luar batas aman dibiarkan tetap.
    setCost(state, p, step === "besar" ? null : step.cost, now);
    const qtyBase = l.qty * l.unitSize;
    state.stock[p.id] = stock - qtyBase;
    state.stockEntries.push({
      id: newId(now),
      productId: p.id,
      receiptId: r.id,
      at: now,
      kind: "batal_masuk",
      qtyBase: -qtyBase,
      actorName: actor.name,
    });
  }
  const changes = correctCash(state, r, -laciPaid(r), now);
  r.status = "dibatalkan";
  r.cancelledAt = now;
  audit(state, r, "batal", actor, changes, now);
}
