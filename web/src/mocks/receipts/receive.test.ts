import { beforeEach, describe, expect, test } from "vitest";
import type {
  DebtPayment,
  ReceiptLineInput,
  ReceiptPayment,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { RECEIPT_TOO_LARGE } from "@/shared/lib/receipt-rules";
import type { MockProduct, MockReceipt, MockState, MockUser } from "../db";
import { createSeedState } from "../seed-data";
import { addCashOut, laciPaid, supplierPaymentsOf } from "./cash";
import { checkReceipt } from "./check";
import { applyReceipt, upsertSupplier } from "./receive";
import { receiptTotalOf } from "./views";

const NOW = Date.UTC(2026, 10, 3, 3);
let state: MockState;
let rina: MockUser;

const productOf = (name: string): MockProduct => {
  const p = state.products.find((x) => x.name === name);
  if (!p) throw new Error(`seed tanpa ${name}`);
  return p;
};

function line(
  lineId: string,
  name: string,
  unitName: string,
  qty: number,
  unitCost: number,
): ReceiptLineInput {
  const p = productOf(name);
  const unit = p.units.find((u) => u.name === unitName);
  if (!unit) throw new Error(`${name} tanpa ${unitName}`);
  return {
    lineId,
    productId: p.id,
    unitId: unit.id,
    newProduct: null,
    qty,
    unitCost,
    expiryDate: null,
  };
}

const transfer: ReceiptPayment = {
  timing: "sekarang",
  method: "transfer",
  cashSource: null,
  dueDate: null,
};

const input = (lines: ReceiptLineInput[]) => ({
  id: "draf-1",
  supplierName: "CV Sumber Rejeki",
  notaDate: "2026-11-02",
  photoId: null,
  lines,
  payment: transfer,
});

function openShift(): void {
  state.shift = {
    id: "shift-1",
    kasirId: rina.id,
    kasirName: "Rina",
    openedAt: NOW - 3_600_000,
    openingCash: 1_500_000,
    cashSales: 0,
    salesCount: 0,
    cashOuts: [],
  };
}

beforeEach(() => {
  state = createSeedState(NOW);
  const user = state.users.find((u) => u.name === "Rina");
  if (!user) throw new Error("seed tanpa Rina");
  rina = user;
});

describe("upsertSupplier", () => {
  test("nama sama tanpa beda huruf & spasi ujung dipakai ulang dengan ejaan pertama; lastUsedAt diperbarui", () => {
    const a = upsertSupplier(state, "  CV Sumber Rejeki ", NOW);
    expect(a).toEqual({
      id: expect.any(String),
      name: "CV Sumber Rejeki",
      lastUsedAt: NOW,
    });
    const b = upsertSupplier(state, "cv sumber rejeki", NOW + 1);
    expect(b.id).toBe(a.id);
    expect(state.suppliers).toEqual([
      { id: a.id, name: "CV Sumber Rejeki", lastUsedAt: NOW + 1 },
    ]);
    upsertSupplier(state, "Toko Makmur", NOW + 2);
    expect(state.suppliers.map((s) => s.name)).toEqual([
      "CV Sumber Rejeki",
      "Toko Makmur",
    ]);
  });
});

describe("uang laci", () => {
  const receipt = (
    payment: ReceiptPayment,
    paid: DebtPayment | null = null,
  ): MockReceipt => ({
    id: "r1",
    supplierId: "s1",
    notaDate: "2026-11-02",
    photoId: null,
    lines: [
      {
        lineId: "l1",
        productId: "p1",
        productName: "Indomie Goreng",
        unitId: "u1",
        unitName: "dus",
        unitSize: 40,
        qty: 2,
        unitCost: 112_000,
        subtotal: 224_000,
        expiryDate: null,
        newProduct: false,
      },
    ],
    payment,
    paid,
    status: "aktif",
    createdById: "u",
    createdByName: "Rina",
    createdAt: NOW,
    editedByName: null,
    editedAt: null,
    cancelledAt: null,
  });
  const nanti: ReceiptPayment = {
    timing: "nanti",
    method: null,
    cashSource: null,
    dueDate: "2026-11-16",
  };
  const paidBy = (
    method: DebtPayment["method"],
    cashSource: DebtPayment["cashSource"],
  ): DebtPayment => ({ at: NOW, method, cashSource, byName: "Pak Ahmad" });

  test.each<[string, MockReceipt, number]>([
    [
      "sekarang tunai laci",
      receipt({ ...transfer, method: "tunai", cashSource: "laci" }),
      224_000,
    ],
    [
      "sekarang tunai pemilik",
      receipt({ ...transfer, method: "tunai", cashSource: "pemilik" }),
      0,
    ],
    ["sekarang transfer", receipt(transfer), 0],
    ["nanti belum lunas", receipt(nanti), 0],
    [
      "nanti lunas tunai laci",
      receipt(nanti, paidBy("tunai", "laci")),
      224_000,
    ],
    [
      "nanti lunas tunai pemilik",
      receipt(nanti, paidBy("tunai", "pemilik")),
      0,
    ],
    ["nanti lunas transfer", receipt(nanti, paidBy("transfer", null)), 0],
  ])("laciPaid: %s → %i", (_, r, expected) => {
    expect(laciPaid(r)).toBe(expected);
    expect(receiptTotalOf(r)).toBe(224_000);
  });

  test("addCashOut: tanpa shift → false; 0 tidak ditulis; supplierPaymentsOf = Σ amount (koreksi negatif mengurangi)", () => {
    expect(addCashOut(state, 1000, "r1", "bayar", NOW)).toBe(false);
    openShift();
    expect(addCashOut(state, 0, "r1", "koreksi", NOW)).toBe(true);
    expect(state.shift?.cashOuts).toEqual([]);
    expect(addCashOut(state, 224_000, "r1", "bayar", NOW)).toBe(true);
    expect(addCashOut(state, -24_000, "r1", "koreksi", NOW + 1)).toBe(true);
    expect(state.shift?.cashOuts).toEqual([
      {
        id: expect.any(String),
        at: NOW,
        amount: 224_000,
        receiptId: "r1",
        kind: "bayar",
      },
      {
        id: expect.any(String),
        at: NOW + 1,
        amount: -24_000,
        receiptId: "r1",
        kind: "koreksi",
      },
    ]);
    expect(state.shift && supplierPaymentsOf(state.shift)).toBe(200_000);
  });
});

describe("applyReceipt", () => {
  test("barang sama di dua baris: stok & HPP berjalan berurutan; satu butir modal dari HPP awal", () => {
    const indomie = productOf("Indomie Goreng");
    state.stock[indomie.id] = 60;
    const lines = [
      line("l1", "Indomie Goreng", "dus", 2, 112_000),
      line("l2", "Indomie Goreng", "pcs", 20, 2500),
    ];
    expect(checkReceipt(state, input(lines), rina.id, NOW)).toEqual([]);
    const r = applyReceipt(state, input(lines), rina, NOW);
    // 60 → 140 {380000,140} → 160 {380000+50000, 160}
    expect(state.stock[indomie.id]).toBe(160);
    expect(productOf("Indomie Goreng").cost).toEqual({
      amount: 430_000,
      qtyBase: 160,
    });
    expect(state.costAlerts[indomie.id]?.fromCost).toEqual({
      amount: 104_000,
      qtyBase: 40,
    });
    expect(r.lines.map((l) => [l.unitName, l.unitSize, l.subtotal])).toEqual([
      ["dus", 40, 224_000],
      ["pcs", 1, 50_000],
    ]);
    expect(state.stockEntries.map((e) => e.qtyBase)).toEqual([80, 20]);
    // K7: entri barang masuk berlaku saat dicatat; dikunci ke baris notanya (K9).
    expect(state.stockEntries[1]).toEqual({
      id: expect.any(String),
      productId: indomie.id,
      receiptId: r.id,
      lineId: "l2",
      opnameId: null,
      reason: null,
      at: NOW,
      effectiveAt: NOW,
      kind: "masuk",
      qtyBase: 20,
      actorName: rina.name,
    });
    // Transfer: tanpa uang keluar laci.
    expect(state.shift).toBeNull();
  });

  test("butir modal yang kembali ke fromCost dihapus (aturan F3b-1)", () => {
    const indomie = productOf("Indomie Goreng");
    state.stock[indomie.id] = 40;
    state.costAlerts[indomie.id] = {
      fromCost: { amount: 2700, qtyBase: 1 },
      changedAt: NOW - 1,
      source: "pemilik",
    };
    // HPP seed {104000,40}: 40 × 2600 + 1 dus 112000 = {216000,80} = 2700 per pcs = fromCost.
    const lines = [line("l1", "Indomie Goreng", "dus", 1, 112_000)];
    applyReceipt(state, input(lines), rina, NOW);
    expect(productOf("Indomie Goreng").cost).toEqual({
      amount: 216_000,
      qtyBase: 80,
    });
    expect(state.costAlerts[indomie.id]).toBeUndefined();
  });
});

describe("checkReceipt: batas aman berjalan (R13)", () => {
  test("stok barang yang sama menumpuk antar baris → baris yang meluap ditandai qty", () => {
    const bimoli = productOf("Minyak Goreng Bimoli 2 L");
    state.stock[bimoli.id] = 0;
    const half = Math.floor(Number.MAX_SAFE_INTEGER / 2) + 1;
    const lines = [
      line("l1", "Minyak Goreng Bimoli 2 L", "pcs", half, 0),
      line("l2", "Minyak Goreng Bimoli 2 L", "pcs", half, 0),
    ];
    expect(checkReceipt(state, input(lines), rina.id, NOW)).toEqual([
      { lineId: "l2", field: "qty", message: RECEIPT_TOO_LARGE },
    ]);
  });

  test("isi satuan nota barang baru meluap → newNotaUnitSize", () => {
    const lines: ReceiptLineInput[] = [
      {
        lineId: "l1",
        productId: null,
        unitId: null,
        newProduct: {
          name: "Beras Curah Uji",
          sellUnit: "kg",
          notaUnit: "karung",
          notaUnitSize: Number.MAX_SAFE_INTEGER,
          barcode: null,
        },
        qty: 1,
        unitCost: 0,
        expiryDate: null,
      },
    ];
    expect(checkReceipt(state, input(lines), rina.id, NOW)).toEqual([
      { lineId: "l1", field: "newNotaUnitSize", message: RECEIPT_TOO_LARGE },
    ]);
  });
});
