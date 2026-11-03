import { beforeEach, describe, expect, test } from "vitest";
import type {
  ProductCost,
  ReceiptEdit,
  ReceiptInput,
  ReceiptLineEdit,
  ReceiptLineInput,
  ReceiptPayment,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { roundHalfUp } from "@/shared/lib/quantity";
import {
  RECEIPT_LINES_MISMATCH,
  RECEIPT_PAYMENT_LOCKED,
  RECEIPT_TOO_LARGE,
} from "@/shared/lib/receipt-rules";
import type { MockProduct, MockReceipt, MockState, MockUser } from "../db";
import { sameCost } from "../products/cost-alert";
import { createSeedState } from "../seed-data";
import { CASH_NOT_RECORDED } from "./audit";
import { supplierPaymentsOf } from "./cash";
import { applyReceipt } from "./receive";
import { applyCancel, applyEdit, checkEdit } from "./revise";
import { receiptTotalOf } from "./views";

const NOW = Date.UTC(2026, 10, 3, 3); // 3 Nov 2026 10.00 WIB
const LATER = NOW + 60_000;
const INDOMIE = "Indomie Goreng";
const BIMOLI = "Minyak Goreng Bimoli 2 L";
const GULA = "Gula Pasir";

let state: MockState;
let rina: MockUser;
let owner: MockUser;

const userOf = (name: string): MockUser => {
  const u = state.users.find((x) => x.name === name);
  if (!u) throw new Error(`seed tanpa ${name}`);
  return u;
};
const productOf = (name: string): MockProduct => {
  const p = state.products.find((x) => x.name === name);
  if (!p) throw new Error(`seed tanpa ${name}`);
  return p;
};
const stockOf = (name: string) => state.stock[productOf(name).id];
const costOf = (name: string) => productOf(name).cost;
const receiptOf = (id = "draf-1"): MockReceipt => {
  const r = state.receipts.find((x) => x.id === id);
  if (!r) throw new Error(`tanpa nota ${id}`);
  return r;
};
const auditOf = (id = "draf-1") =>
  state.receiptAudit.filter((a) => a.receiptId === id);
const correctionsOf = (id = "draf-1") =>
  state.stockEntries.filter((e) => e.receiptId === id && e.kind !== "masuk");

function line(
  lineId: string,
  name: string,
  unitName: string,
  qty: number,
  unitCost: number,
  expiryDate: string | null = null,
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
    expiryDate,
  };
}

const LACI: ReceiptPayment = {
  timing: "sekarang",
  method: "tunai",
  cashSource: "laci",
  dueDate: null,
};
const nanti = (dueDate: string): ReceiptPayment => ({
  timing: "nanti",
  method: null,
  cashSource: null,
  dueDate,
});

/** Nota mockup: Indomie 2 dus × 112.000 ED 2027-04-20, Bimoli 12 pcs × 34.000, Gula 50 kg × 16.200. */
function mockupInput(patch: Partial<ReceiptInput> = {}): ReceiptInput {
  return {
    id: "draf-1",
    supplierName: "CV Sumber Rejeki",
    notaDate: "2026-11-02",
    photoId: null,
    lines: [
      line("l1", INDOMIE, "dus", 2, 112_000, "2027-04-20"),
      line("l2", BIMOLI, "pcs", 12, 34_000),
      line("l3", GULA, "kg", 50, 16_200),
    ],
    payment: LACI,
    ...patch,
  };
}

/** Isi ubah = nota tersimpan, dengan baris & isian yang diganti. */
function editOf(
  r: MockReceipt,
  patch: Partial<Omit<ReceiptEdit, "lines">> = {},
  lines: Record<string, Partial<ReceiptLineEdit>> = {},
): ReceiptEdit {
  const supplier = state.suppliers.find((s) => s.id === r.supplierId);
  return {
    supplierName: supplier?.name ?? "",
    notaDate: r.notaDate,
    lines: r.lines.map((l) => ({
      lineId: l.lineId,
      qty: l.qty,
      unitCost: l.unitCost,
      expiryDate: l.expiryDate,
      ...lines[l.lineId],
    })),
    payment: r.payment,
    ...patch,
  };
}

/** Periksa lalu ubah (gagal bila ada galat). */
function edit(e: ReceiptEdit, r: MockReceipt = receiptOf(), now = LATER): void {
  expect(checkEdit(state, r, e, now)).toEqual([]);
  applyEdit(state, r, e, rina, now);
}

const perUnit = (c: ProductCost | null) =>
  c === null ? null : roundHalfUp(c.amount, c.qtyBase);

function openShift(id = "shift-1"): void {
  state.shift = {
    id,
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
  rina = userOf("Rina");
  owner = userOf("Pak Ahmad");
  openShift();
  state.stock[productOf(INDOMIE).id] = 60;
  state.stock[productOf(BIMOLI).id] = 4;
  state.stock[productOf(GULA).id] = 20_000;
  productOf(BIMOLI).cost = { amount: 34_000, qtyBase: 1 };
  applyReceipt(state, mockupInput(), rina, NOW);
  expect(stockOf(INDOMIE)).toBe(140);
  expect(costOf(INDOMIE)).toEqual({ amount: 380_000, qtyBase: 140 });
  state.stock[productOf(INDOMIE).id] = 120; // terjual 20
});

describe("ubah nota: HPP & stok", () => {
  test("ubah harga Indomie 112.000→108.000 → HPP {317714,120} (Rp2.648); stok tetap 120; butir modal sumber ubah_nota; audit changes ['Indomie Goreng: harga beli Rp112.000 → Rp108.000']", () => {
    edit(editOf(receiptOf(), {}, { l1: { unitCost: 108_000 } }));
    expect(costOf(INDOMIE)).toEqual({ amount: 317_714, qtyBase: 120 });
    expect(perUnit(costOf(INDOMIE))).toBe(2_648);
    expect(stockOf(INDOMIE)).toBe(120);
    expect(correctionsOf()).toEqual([]);
    expect(state.costAlerts[productOf(INDOMIE).id]).toEqual({
      fromCost: { amount: 104_000, qtyBase: 40 },
      changedAt: LATER,
      source: "ubah_nota",
    });
    const r = receiptOf();
    expect(r.lines[0]).toMatchObject({ unitCost: 108_000, subtotal: 216_000 });
    expect(r).toMatchObject({ editedByName: "Rina", editedAt: LATER });
    expect(auditOf()).toEqual([
      expect.objectContaining({ action: "buat" }),
      {
        id: expect.any(String),
        receiptId: "draf-1",
        at: LATER,
        actorName: "Rina",
        action: "ubah",
        changes: ["Indomie Goreng: harga beli Rp112.000 → Rp108.000"],
      },
    ]);
    // Barang lain tidak tersentuh.
    expect(costOf(GULA)).toEqual({ amount: 1_140_000, qtyBase: 70_000 });
  });

  test("ubah jumlah Indomie 2→1 dus → HPP {213714,80} (Rp2.671); stok 80; mutasi {kind:'koreksi_masuk', qtyBase:-40}; audit 'Indomie Goreng: jumlah 2 dus → 1 dus'", () => {
    edit(editOf(receiptOf(), {}, { l1: { qty: 1 } }));
    expect(costOf(INDOMIE)).toEqual({ amount: 213_714, qtyBase: 80 });
    expect(perUnit(costOf(INDOMIE))).toBe(2_671);
    expect(stockOf(INDOMIE)).toBe(80);
    expect(correctionsOf()).toEqual([
      {
        id: expect.any(String),
        productId: productOf(INDOMIE).id,
        receiptId: "draf-1",
        at: LATER,
        kind: "koreksi_masuk",
        qtyBase: -40,
        actorName: "Rina",
      },
    ]);
    expect(receiptOf().lines[0]).toMatchObject({ qty: 1, subtotal: 112_000 });
    expect(auditOf().at(-1)?.changes).toEqual([
      "Indomie Goreng: jumlah 2 dus → 1 dus",
    ]);
  });

  test("ubah 2→1 dus saat stok 30 → HPP {112000,40}; stok −10", () => {
    state.stock[productOf(INDOMIE).id] = 30;
    edit(editOf(receiptOf(), {}, { l1: { qty: 1 } }));
    expect(costOf(INDOMIE)).toEqual({ amount: 112_000, qtyBase: 40 });
    expect(stockOf(INDOMIE)).toBe(-10);
  });

  test("PUT identik dua kali → HPP, stok, mutasi, dan audit sama seperti setelah PUT pertama (audit 'ubah' hanya satu)", () => {
    const e = editOf(receiptOf(), {}, { l1: { qty: 1, unitCost: 108_000 } });
    edit(e);
    const after = structuredClone(state);
    edit(e, receiptOf(), LATER + 60_000);
    expect(state.products).toEqual(after.products);
    expect(state.stock).toEqual(after.stock);
    expect(state.stockEntries).toEqual(after.stockEntries);
    expect(state.receiptAudit).toEqual(after.receiptAudit);
    expect(state.shift?.cashOuts).toEqual(after.shift?.cashOuts);
    expect(state.costAlerts).toEqual(after.costAlerts);
    expect(receiptOf()).toEqual(after.receipts[0]);
    expect(auditOf().filter((a) => a.action === "ubah")).toHaveLength(1);
  });

  test("PUT tanpa perubahan apa pun → tanpa audit, editedAt null", () => {
    const before = structuredClone(state);
    edit(editOf(receiptOf()));
    expect(state).toEqual(before);
    expect(receiptOf()).toMatchObject({ editedAt: null, editedByName: null });
  });

  test("ubah ED Indomie ke null & supplier → changes ['Supplier CV Sumber Rejeki → Toko Grosir Makmur', 'Indomie Goreng: ED 20 Apr 2027 → —']", () => {
    const before = structuredClone(state);
    edit(
      editOf(
        receiptOf(),
        { supplierName: "Toko Grosir Makmur" },
        { l1: { expiryDate: null } },
      ),
    );
    expect(auditOf().at(-1)?.changes).toEqual([
      "Supplier CV Sumber Rejeki → Toko Grosir Makmur",
      "Indomie Goreng: ED 20 Apr 2027 → —",
    ]);
    const supplier = state.suppliers.find(
      (s) => s.id === receiptOf().supplierId,
    );
    expect(supplier?.name).toBe("Toko Grosir Makmur");
    expect(receiptOf().lines[0]?.expiryDate).toBeNull();
    // ED & supplier tidak menyentuh HPP, stok, atau laci.
    expect(state.products).toEqual(before.products);
    expect(state.stock).toEqual(before.stock);
    expect(state.shift?.cashOuts).toEqual(before.shift?.cashOuts);
  });

  test("supplier sama dengan beda huruf → tanpa perubahan", () => {
    edit(editOf(receiptOf(), { supplierName: " cv sumber REJEKI " }));
    expect(auditOf()).toHaveLength(1);
    expect(state.suppliers).toHaveLength(1);
  });
});

describe("ubah nota: uang laci (R6, K6)", () => {
  test("Gula 50→48 kg (laci, shift buka) → cashOuts += {amount:-32400, kind:'koreksi'}; Σ = 1409600; total nota 1409600", () => {
    edit(editOf(receiptOf(), {}, { l3: { qty: 48 } }));
    expect(state.shift?.cashOuts.at(-1)).toEqual({
      id: expect.any(String),
      at: LATER,
      amount: -32_400,
      receiptId: "draf-1",
      kind: "koreksi",
    });
    expect(state.shift && supplierPaymentsOf(state.shift)).toBe(1_409_600);
    expect(receiptTotalOf(receiptOf())).toBe(1_409_600);
  });

  test("Gula 50→48 kg setelah shift ditutup → tanpa cashOut; changes memuat 'Koreksi laci tidak dicatat — tidak ada shift buka'", () => {
    state.shift = null;
    const e = editOf(receiptOf(), {}, { l3: { qty: 48 } });
    // R6: nota laci boleh diubah setelah shift ditutup.
    edit(e);
    expect(state.shift).toBeNull();
    expect(stockOf(GULA)).toBe(68_000);
    expect(auditOf().at(-1)?.changes).toEqual([
      "Gula Pasir: jumlah 50 kg → 48 kg",
      CASH_NOT_RECORDED,
    ]);
  });

  test("shift lain sudah buka → koreksi masuk ke shift yang sedang buka", () => {
    // Shift saat nota dicatat sudah ditutup; shift lain sedang buka.
    openShift("shift-2");
    edit(editOf(receiptOf(), {}, { l3: { qty: 48 } }));
    expect(state.shift?.cashOuts).toEqual([
      expect.objectContaining({ amount: -32_400, kind: "koreksi" }),
    ]);
  });
});

describe("ubah nota: pembayaran", () => {
  test("ubah pembayaran nota 'sekarang' → 422 payment 'Cara bayar tidak bisa diubah — sudah dibayar'", () => {
    const e = editOf(receiptOf(), {
      payment: { ...LACI, cashSource: "pemilik" },
    });
    expect(checkEdit(state, receiptOf(), e, LATER)).toEqual([
      { lineId: null, field: "payment", message: RECEIPT_PAYMENT_LOCKED },
    ]);
  });

  test("nota 'nanti' belum lunas: jatuh tempo 2026-11-16→2026-11-30 → lolos, audit 'Jatuh tempo 16 Nov 2026 → 30 Nov 2026'", () => {
    applyReceipt(
      state,
      mockupInput({ id: "draf-2", payment: nanti("2026-11-16") }),
      rina,
      NOW,
    );
    const r = receiptOf("draf-2");
    edit(editOf(r, { payment: nanti("2026-11-30") }), r);
    expect(r.payment.dueDate).toBe("2026-11-30");
    expect(auditOf("draf-2").at(-1)?.changes).toEqual([
      "Jatuh tempo 16 Nov 2026 → 30 Nov 2026",
    ]);
  });

  test("nota 'nanti' belum lunas → bayar sekarang dari laci: uang keluar sebesar total di shift buka", () => {
    applyReceipt(
      state,
      mockupInput({ id: "draf-2", payment: nanti("2026-11-16") }),
      rina,
      NOW,
    );
    const r = receiptOf("draf-2");
    edit(editOf(r, { payment: LACI }), r);
    expect(state.shift?.cashOuts.at(-1)).toMatchObject({
      amount: 1_442_000,
      receiptId: "draf-2",
      kind: "koreksi",
    });
    expect(auditOf("draf-2").at(-1)?.changes).toEqual([
      "Pembayaran Bayar nanti · jatuh tempo 16 Nov 2026 → Bayar sekarang · Tunai · Dari laci kasir",
    ]);
  });

  test("R8: nota 'nanti' → laci tanpa shift buka → 422 cashSource", () => {
    applyReceipt(
      state,
      mockupInput({ id: "draf-2", payment: nanti("2026-11-16") }),
      rina,
      NOW,
    );
    state.shift = null;
    const r = receiptOf("draf-2");
    expect(checkEdit(state, r, editOf(r, { payment: LACI }), LATER)).toEqual([
      expect.objectContaining({ lineId: null, field: "cashSource" }),
    ]);
  });

  test("nota 'nanti' sudah lunas → pembayaran terkunci", () => {
    applyReceipt(
      state,
      mockupInput({ id: "draf-2", payment: nanti("2026-11-16") }),
      rina,
      NOW,
    );
    const r = receiptOf("draf-2");
    r.paid = {
      at: NOW,
      method: "transfer",
      cashSource: null,
      byName: "Pak Ahmad",
    };
    const e = editOf(r, { payment: nanti("2026-11-30") });
    expect(checkEdit(state, r, e, LATER)).toEqual([
      { lineId: null, field: "payment", message: RECEIPT_PAYMENT_LOCKED },
    ]);
  });

  test("tanggal nota digeser melewati jatuh tempo → 422 dueDate", () => {
    applyReceipt(
      state,
      mockupInput({
        id: "draf-2",
        notaDate: "2026-11-01",
        payment: nanti("2026-11-02"),
      }),
      rina,
      NOW,
    );
    const r = receiptOf("draf-2");
    expect(
      checkEdit(state, r, editOf(r, { notaDate: "2026-11-03" }), LATER),
    ).toEqual([expect.objectContaining({ lineId: null, field: "dueDate" })]);
  });
});

describe("checkEdit: aturan isi", () => {
  test("lineId kurang/lebih/kembar → 422 lines 'Baris nota tidak cocok — muat ulang'", () => {
    const r = receiptOf();
    const base = editOf(r);
    const mismatch = [
      { lineId: null, field: "lines", message: RECEIPT_LINES_MISMATCH },
    ];
    const [l1, l2, l3] = base.lines;
    if (!l1 || !l2 || !l3) throw new Error("nota tanpa 3 baris");
    for (const lines of [
      [l1, l2],
      [l1, l2, l3, { ...l3, lineId: "l4" }],
      [l1, l2, { ...l2 }],
      [l1, l2, { ...l3, lineId: "lain" }],
    ]) {
      expect(checkEdit(state, r, { ...base, lines }, LATER)).toEqual(mismatch);
    }
  });

  test("aturan validateReceipt: supplier, tanggal, jumlah, harga beli, ED", () => {
    const r = receiptOf();
    const e = editOf(
      r,
      { supplierName: " ", notaDate: "2026-11-04" },
      {
        l1: { qty: 0 },
        l2: { unitCost: -1 },
        l3: { expiryDate: "2027-02-30" },
      },
    );
    expect(
      checkEdit(state, r, e, LATER).map((x) => [x.lineId, x.field]),
    ).toEqual([
      [null, "supplierName"],
      [null, "notaDate"],
      ["l1", "qty"],
      ["l2", "unitCost"],
      ["l3", "expiryDate"],
    ]);
  });

  test("R13: qtyBase di luar bilangan bulat aman → 422 qty, bukan lempar", () => {
    const r = receiptOf();
    const e = editOf(r, {}, { l1: { qty: 2 ** 50, unitCost: 0 } });
    expect(checkEdit(state, r, e, LATER)).toEqual([
      { lineId: "l1", field: "qty", message: RECEIPT_TOO_LARGE },
    ]);
  });
});

describe("batalkan nota", () => {
  test("pemilik batalkan (stok 120) → HPP {101714,40} (Rp2.543); stok Indomie 40; mutasi batal_masuk −80; cashOuts += −1442000; status dibatalkan; audit [buat, batal 'Pak Ahmad']", () => {
    applyCancel(state, receiptOf(), owner, LATER);
    expect(costOf(INDOMIE)).toEqual({ amount: 101_714, qtyBase: 40 });
    expect(perUnit(costOf(INDOMIE))).toBe(2_543);
    expect(stockOf(INDOMIE)).toBe(40);
    expect(correctionsOf()).toEqual([
      expect.objectContaining({
        kind: "batal_masuk",
        qtyBase: -80,
        actorName: "Pak Ahmad",
      }),
      expect.objectContaining({ kind: "batal_masuk", qtyBase: -12 }),
      expect.objectContaining({ kind: "batal_masuk", qtyBase: -50_000 }),
    ]);
    expect(state.shift?.cashOuts.at(-1)).toEqual({
      id: expect.any(String),
      at: LATER,
      amount: -1_442_000,
      receiptId: "draf-1",
      kind: "koreksi",
    });
    expect(receiptOf()).toMatchObject({
      status: "dibatalkan",
      cancelledAt: LATER,
      editedAt: null,
    });
    expect(auditOf().map((a) => [a.action, a.actorName, a.changes])).toEqual([
      ["buat", "Rina", []],
      ["batal", "Pak Ahmad", []],
    ]);
  });

  test("batal kedua → tanpa mutasi/audit/cashOut tambahan", () => {
    applyCancel(state, receiptOf(), owner, LATER);
    const after = structuredClone(state);
    applyCancel(state, receiptOf(), owner, LATER + 60_000);
    expect(state).toEqual(after);
  });

  test("batal saat stok 70 → HPP tetap {380000,140}; stok −10", () => {
    state.stock[productOf(INDOMIE).id] = 70;
    applyCancel(state, receiptOf(), owner, LATER);
    expect(costOf(INDOMIE)).toEqual({ amount: 380_000, qtyBase: 140 });
    expect(stockOf(INDOMIE)).toBe(-10);
  });

  test("batal tanpa shift buka → tanpa cashOut; audit memuat catatan K6", () => {
    state.shift = null;
    applyCancel(state, receiptOf(), owner, LATER);
    expect(auditOf().at(-1)?.changes).toEqual([CASH_NOT_RECORDED]);
  });

  test("nota transfer → tanpa koreksi laci", () => {
    applyReceipt(
      state,
      mockupInput({
        id: "draf-2",
        payment: { ...LACI, method: "transfer", cashSource: null },
      }),
      rina,
      NOW,
    );
    state.shift = null;
    applyCancel(state, receiptOf("draf-2"), owner, LATER);
    expect(auditOf("draf-2").at(-1)?.changes).toEqual([]);
  });
});

describe("pulang-pergi: terima → ubah → batal", () => {
  test("HPP kembali ke nilai semula, stok & mutasi berjumlah nol, uang laci Σ 0, audit [buat, ubah, batal]", () => {
    state.stock[productOf(INDOMIE).id] = 140; // tanpa penjualan
    const seed = createSeedState(NOW);
    const seedCost = (name: string) =>
      seed.products.find((p) => p.name === name)?.cost ?? null;

    edit(
      editOf(
        receiptOf(),
        {},
        {
          l1: { qty: 1 },
          l2: { unitCost: 35_000 },
          l3: { qty: 48, unitCost: 16_000 },
        },
      ),
    );
    expect(stockOf(INDOMIE)).toBe(100);
    expect(costOf(INDOMIE)).toEqual({ amount: 268_000, qtyBase: 100 });
    applyCancel(state, receiptOf(), owner, LATER + 60_000);

    expect([stockOf(INDOMIE), stockOf(BIMOLI), stockOf(GULA)]).toEqual([
      60, 4, 20_000,
    ]);
    // R10: dibandingkan menurut nilai.
    expect(sameCost(costOf(INDOMIE), seedCost(INDOMIE))).toBe(true);
    expect(sameCost(costOf(GULA), seedCost(GULA))).toBe(true);
    expect(sameCost(costOf(BIMOLI), { amount: 34_000, qtyBase: 1 })).toBe(true);
    // HPP kembali ke fromCost → butir modal hilang.
    expect(state.costAlerts[productOf(INDOMIE).id]).toBeUndefined();
    expect(state.costAlerts[productOf(GULA).id]).toBeUndefined();

    for (const name of [INDOMIE, BIMOLI, GULA]) {
      const id = productOf(name).id;
      const moved = state.stockEntries
        .filter((e) => e.productId === id && e.receiptId === "draf-1")
        .reduce((sum, e) => sum + e.qtyBase, 0);
      expect(moved).toBe(0);
    }
    expect(state.stockEntries.map((e) => e.kind)).toEqual([
      "masuk",
      "masuk",
      "masuk",
      "koreksi_masuk",
      "koreksi_masuk",
      "batal_masuk",
      "batal_masuk",
      "batal_masuk",
    ]);
    const cash = state.shift?.cashOuts ?? [];
    expect(cash.map((c) => [c.kind, c.amount])).toEqual([
      ["bayar", 1_442_000],
      ["koreksi", -112_000 + 12_000 - 42_000],
      ["koreksi", -(1_442_000 - 142_000)],
    ]);
    expect(state.shift && supplierPaymentsOf(state.shift)).toBe(0);
    expect(auditOf().map((a) => a.action)).toEqual(["buat", "ubah", "batal"]);
  });
});
