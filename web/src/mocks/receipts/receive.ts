import type {
  NewProductInput,
  ReceiptInput,
  ReceiptLine,
  ReceiptLineInput,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { newId } from "@/shared/lib/id";
import { sellUnitKind } from "@/shared/lib/product-rules";
import { newProductUnits, receiptLineTotal } from "@/shared/lib/receipt-rules";
import type {
  MockProduct,
  MockReceipt,
  MockState,
  MockSupplier,
  MockUnit,
  MockUser,
} from "../db";
import { nextStoreCode } from "../products/build";
import { key } from "../products/checks";
import { noteCostChange, sameCost } from "../products/cost-alert";
import { addCashOut, laciPaid } from "./cash";
import { afterReceive, usableCost } from "./check";

/** Supplier dengan nama sama (tanpa beda huruf & spasi ujung) dipakai ulang dengan ejaan pertamanya. */
export function upsertSupplier(
  state: MockState,
  name: string,
  now: number,
): MockSupplier {
  const found = state.suppliers.find((s) => key(s.name) === key(name));
  if (found) {
    found.lastUsedAt = now;
    return found;
  }
  const supplier = { id: newId(now), name: name.trim(), lastUsedAt: now };
  state.suppliers.push(supplier);
  return supplier;
}

/** K2: barang baru dari nota menunggu harga jual; barcode melekat ke satuan nota. */
function createProduct(
  state: MockState,
  n: NewProductInput,
  now: number,
): { product: MockProduct; unit: MockUnit } {
  const units = newProductUnits(n);
  const kind = sellUnitKind(n.sellUnit);
  if (units === null || kind === null) throw new Error("Nota belum dicek");
  const id = newId(now);
  const make = (u: { name: string; unitSize: number }): MockUnit => ({
    id: newId(now),
    productId: id,
    name: u.name,
    unitSize: u.unitSize,
    price: 0,
    wholesaleTiers: [],
    barcodes: [],
    active: true,
  });
  const eceran = make(units.eceran);
  const nota = units.nota === null ? eceran : make(units.nota);
  if (n.barcode !== null) nota.barcodes.push(n.barcode);
  const product: MockProduct = {
    id,
    name: n.name.trim(),
    storeCode: nextStoreCode(state),
    isCurah: kind.isCurah,
    baseUnit: kind.baseUnit,
    units: nota === eceran ? [eceran] : [eceran, nota],
    category: null,
    status: "menunggu_harga",
    scarce: false,
    stockCounted: true,
    cost: null,
  };
  state.products.push(product);
  state.stock[id] = 0;
  return { product, unit: nota };
}

function applyLine(
  state: MockState,
  l: ReceiptLineInput,
  receiptId: string,
  user: MockUser,
  now: number,
): ReceiptLine {
  const created = l.newProduct && createProduct(state, l.newProduct, now);
  const p =
    created?.product ?? state.products.find((x) => x.id === l.productId);
  const unit = created?.unit ?? p?.units.find((u) => u.id === l.unitId);
  if (!p || !unit) throw new Error("Nota belum dicek");
  const qtyIn = l.qty * unit.unitSize;
  const lineCost = receiptLineTotal(l.qty, l.unitCost);
  const next = afterReceive(p.cost, state.stock[p.id] ?? 0, qtyIn, lineCost);
  if (next === null) throw new RangeError("Nota belum dicek");
  const prevCost = usableCost(p.cost);
  if (prevCost !== null && !sameCost(prevCost, next.cost)) {
    noteCostChange(state, p, next.cost, "barang_masuk", now);
  }
  p.cost = next.cost;
  p.scarce = false;
  state.stock[p.id] = next.stock;
  state.stockEntries.push({
    id: newId(now),
    productId: p.id,
    receiptId,
    at: now,
    kind: "masuk",
    qtyBase: qtyIn,
    actorName: user.name,
  });
  return {
    lineId: l.lineId,
    productId: p.id,
    productName: p.name,
    unitId: unit.id,
    unitName: unit.name,
    unitSize: unit.unitSize,
    qty: l.qty,
    unitCost: l.unitCost,
    subtotal: lineCost,
    expiryDate: l.expiryDate,
    newProduct: created !== null,
  };
}

/** Catat nota yang sudah lolos `checkReceipt`: stok, HPP, supplier, audit, uang keluar laci. */
export function applyReceipt(
  state: MockState,
  input: ReceiptInput,
  user: MockUser,
  now: number,
): MockReceipt {
  const supplier = upsertSupplier(state, input.supplierName, now);
  const receipt: MockReceipt = {
    id: input.id,
    supplierId: supplier.id,
    notaDate: input.notaDate,
    photoId: input.photoId,
    lines: input.lines.map((l) => applyLine(state, l, input.id, user, now)),
    payment: input.payment,
    paid: null,
    status: "aktif",
    createdById: user.id,
    createdByName: user.name,
    createdAt: now,
    editedByName: null,
    editedAt: null,
    cancelledAt: null,
  };
  state.receipts.push(receipt);
  state.receiptAudit.push({
    id: newId(now),
    receiptId: receipt.id,
    at: now,
    actorName: user.name,
    action: "buat",
    changes: [],
  });
  addCashOut(state, laciPaid(receipt), receipt.id, "bayar", now);
  return receipt;
}
