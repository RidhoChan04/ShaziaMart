import { expect, test } from "vitest";
import type { MockSale, MockState, MockStockEntry } from "../db";
import { createSeedState } from "../seed-data";
import { stockAt } from "./stock-at";

// 5 Nov 2026, jam WIB "HH.MM" → epoch ms UTC.
const T = (hm: string): number => {
  const [h = 0, m = 0] = hm.split(".").map(Number);
  return Date.UTC(2026, 10, 5, h - 7, m);
};
const SEED = createSeedState(T("06.00"));
const product = (name: string) => {
  const p = SEED.products.find((x) => x.name === name);
  if (!p) throw new Error(`seed tanpa ${name}`);
  return p;
};
const indomie = product("Indomie Goreng");
const INDOMIE = indomie.id;

type SaleSpec = {
  at: number;
  qtyBase: number;
  voidedAt?: number;
  unitId?: string;
};
type EntrySpec = Pick<MockStockEntry, "kind" | "at" | "qtyBase"> &
  Partial<Pick<MockStockEntry, "effectiveAt" | "productId">>;

const sale = (s: SaleSpec, i: number): MockSale => ({
  id: `sale-${i}`,
  number: `S${i}`,
  createdAt: s.at,
  kasirName: "Rina",
  items: [
    {
      unitId: s.unitId ?? indomie.units[0]?.id ?? "",
      productName: indomie.name,
      unitName: "pcs",
      isCurah: false,
      baseUnit: "pcs",
      unitSize: 1,
      qtyBase: s.qtyBase,
      unitPrice: 3500,
      subtotal: 3500 * s.qtyBase,
      wholesale: false,
    },
  ],
  total: 3500 * s.qtyBase,
  payments: [],
  cashReceived: 0,
  change: 0,
  customerId: null,
  status: s.voidedAt === undefined ? "selesai" : "dibatalkan",
  printStatus: "tercetak",
  costTotal: 0,
  voidedAt: s.voidedAt ?? null,
});

const entry = (e: EntrySpec, i: number): MockStockEntry => ({
  id: `e-${i}`,
  productId: e.productId ?? INDOMIE,
  at: e.at,
  effectiveAt: e.effectiveAt ?? e.at,
  qtyBase: e.qtyBase,
  actorName: "Rina",
  kind: e.kind,
  receiptId: null,
  lineId: null,
  opnameId: null,
  reason: null,
});

function stateWith(spec: {
  stock: number;
  sales?: SaleSpec[];
  entries?: EntrySpec[];
}): MockState {
  return {
    ...SEED,
    stock: { ...SEED.stock, [INDOMIE]: spec.stock },
    sales: (spec.sales ?? []).map(sale),
    stockEntries: (spec.entries ?? []).map(entry),
  };
}

// Indomie: stok 12 pukul 10.05; terjual 3 pukul 10.10
test("stok pada jam hitung mengabaikan penjualan sesudahnya (contoh spec)", () => {
  const s = stateWith({ stock: 9, sales: [{ at: T("10.10"), qtyBase: 3 }] });
  expect(stockAt(s, INDOMIE, T("10.05"))).toBe(12);
  expect(stockAt(s, INDOMIE, T("10.10"))).toBe(9); // mutasi tepat di t sudah termasuk
});

test("batal jual sesudah t dan entri opname/keluar sesudah t ikut dibalik", () => {
  const s = stateWith({
    stock: 10,
    sales: [{ at: T("09.00"), qtyBase: 2, voidedAt: T("10.30") }],
    entries: [{ kind: "keluar_kedaluwarsa", at: T("10.40"), qtyBase: -4 }],
  });
  expect(stockAt(s, INDOMIE, T("10.00"))).toBe(12); // 10 − (+2 batal) − (−4 keluar)
  // Sebelum jualnya: jual −2 dan batal +2 sama-sama dibalik.
  expect(stockAt(s, INDOMIE, T("08.59"))).toBe(14);
});

test("K7: koreksi opname dicatat 10.30 untuk hitungan 10.00 (effectiveAt 10.00) tidak dibalik untuk t = 10.20", () => {
  const s = stateWith({
    stock: 10,
    entries: [
      { kind: "opname", at: T("10.30"), effectiveAt: T("10.00"), qtyBase: -2 },
    ],
  });
  expect(stockAt(s, INDOMIE, T("10.20"))).toBe(10);
  expect(stockAt(s, INDOMIE, T("09.59"))).toBe(12);
});

test("penjualan satuan besar dihitung dalam satuan dasar; barang lain dan entri barang lain diabaikan", () => {
  const dus = indomie.units.find((u) => u.unitSize > 1);
  const other = SEED.products.find((p) => p.id !== INDOMIE);
  const otherUnit = other?.units[0];
  if (!dus || !other || !otherUnit) throw new Error("seed berubah");
  const s = stateWith({
    stock: 50,
    sales: [
      { at: T("11.00"), qtyBase: dus.unitSize, unitId: dus.id },
      { at: T("11.00"), qtyBase: 7, unitId: otherUnit.id },
    ],
    entries: [
      { kind: "masuk", at: T("11.30"), qtyBase: 5 },
      {
        kind: "masuk",
        at: T("11.30"),
        qtyBase: 99,
        productId: other.id,
      },
    ],
  });
  expect(stockAt(s, INDOMIE, T("10.00"))).toBe(50 + dus.unitSize - 5);
});

test("barang tanpa stok tercatat dianggap 0", () => {
  const s = stateWith({ stock: 0 });
  delete s.stock[INDOMIE];
  expect(stockAt(s, INDOMIE, T("10.00"))).toBe(0);
});
