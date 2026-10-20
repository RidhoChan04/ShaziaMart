import { beforeEach, expect, test } from "vitest";
import type {
  CatalogMatch,
  Product,
} from "../../../shared/api/gen/shaziaMartAPI.schemas";
import { createCartStore, useCart } from "./cart-store";
import { cartLineView, cartSummary } from "./cart-view";

const indomie: Product = {
  id: "p-indomie",
  name: "Indomie Goreng",
  storeCode: "A001",
  isCurah: false,
  baseUnit: "pcs",
  units: [
    {
      id: "u-pcs",
      productId: "p-indomie",
      name: "pcs",
      unitSize: 1,
      price: 3100,
      wholesaleTiers: [{ minQty: 40, price: 2800 }],
      barcodes: [],
    },
    {
      id: "u-dus",
      productId: "p-indomie",
      name: "dus",
      unitSize: 40,
      price: 112000,
      wholesaleTiers: [],
      barcodes: [],
    },
  ],
};
const gula: Product = {
  id: "p-gula",
  name: "Gula Curah",
  storeCode: "G001",
  isCurah: true,
  baseUnit: "gram",
  units: [
    {
      id: "u-gula",
      productId: "p-gula",
      name: "kg",
      unitSize: 1000,
      price: 18000,
      wholesaleTiers: [],
      barcodes: [],
    },
  ],
};
const minyak: Product = {
  id: "p-minyak",
  name: "Minyak Curah",
  storeCode: "M001",
  isCurah: true,
  baseUnit: "ml",
  units: [
    {
      id: "u-minyak",
      productId: "p-minyak",
      name: "L",
      unitSize: 1000,
      price: 16000,
      wholesaleTiers: [],
      barcodes: [],
    },
  ],
};

const pcs: CatalogMatch = { product: indomie, unitId: "u-pcs" };
const dus: CatalogMatch = { product: indomie, unitId: "u-dus" };
const gulaMatch: CatalogMatch = { product: gula, unitId: "u-gula" };

let store = createCartStore();
beforeEach(() => {
  store = createCartStore();
});
const s = () => store.getState();
function at<T>(list: T[], i: number): T {
  const item = list[i];
  if (item === undefined) throw new Error(`indeks ${i} tidak ada`);
  return item;
}

test("scan Indomie pcs dua kali → satu baris 2 pcs", () => {
  s().addUnit(pcs);
  s().addUnit(pcs);
  expect(s().lines).toHaveLength(1);
  const line = at(s().lines, 0);
  expect(line.qtyBase).toBe(2);
  expect(cartLineView(line, 0).qtyLabel).toBe("2 pcs");
  expect(s().selectedLineId).toBe(line.lineId);
  expect(s().lastAddedLineId).toBe(line.lineId);
});

test("Indomie pcs dan dus → dua baris", () => {
  s().addUnit(pcs);
  s().addUnit(dus);
  expect(s().lines).toHaveLength(2);
  expect(cartLineView(at(s().lines, 1), 1).qtyLabel).toBe("1 dus");
  expect(at(s().lines, 1).qtyBase).toBe(40);
});

test("addUnit: curah tidak menambah baris, unit tak dikenal melempar", () => {
  s().addUnit(gulaMatch);
  expect(s().lines).toHaveLength(0);
  expect(() => s().addUnit({ product: indomie, unitId: "nope" })).toThrow();
});

test("addUnit membersihkan lastChange", () => {
  s().addUnit(pcs);
  s().completeSale(500);
  expect(s().lastChange).toBe(500);
  s().addUnit(pcs);
  expect(s().lastChange).toBeNull();
});

test("addCurah gula 1500 g → baris '1,5 kg' '18.000/kg' subtotal 27000", () => {
  s().addCurah(gulaMatch, { qtyBase: 1500 });
  const v = cartLineView(at(s().lines, 0), 0);
  expect(v.qtyLabel).toBe("1,5 kg");
  expect(v.priceLabel).toBe("18.000/kg");
  expect(v.subtotal).toBe(27000);
  expect(v.no).toBe(1);
  expect(v.wholesale).toBe(false);
});

test("addCurah nominal 20000 → subtotal 20000, qtyLabel '1,111 kg'", () => {
  s().addCurah(gulaMatch, { amount: 20000 });
  const line = at(s().lines, 0);
  expect(line.amount).toBe(20000);
  const v = cartLineView(line, 0);
  expect(v.subtotal).toBe(20000);
  expect(v.qtyLabel).toBe("1,111 kg");
});

test("addCurah selalu baris baru; ml berlabel L", () => {
  s().addCurah(gulaMatch, { qtyBase: 500 });
  s().addCurah(gulaMatch, { qtyBase: 500 });
  s().addCurah({ product: minyak, unitId: "u-minyak" }, { qtyBase: 2500 });
  expect(s().lines).toHaveLength(3);
  expect(cartLineView(at(s().lines, 2), 2).qtyLabel).toBe("2,5 L");
  expect(cartLineView(at(s().lines, 2), 2).priceLabel).toBe("16.000/L");
});

test("decrement tidak di bawah 1 satuan; remove menghapus", () => {
  s().addUnit(dus);
  const id = at(s().lines, 0).lineId;
  s().increment(id);
  expect(at(s().lines, 0).qtyBase).toBe(80);
  s().decrement(id);
  s().decrement(id);
  expect(at(s().lines, 0).qtyBase).toBe(40);
  s().remove(id);
  expect(s().lines).toHaveLength(0);
  expect(s().selectedLineId).toBeNull();
});

test("harga grosir berlaku pada kelipatan tier", () => {
  s().addUnit(pcs);
  const id = at(s().lines, 0).lineId;
  for (let i = 0; i < 39; i++) s().increment(id);
  const v = cartLineView(at(s().lines, 0), 0);
  expect(v.wholesale).toBe(true);
  expect(v.unitPrice).toBe(2800);
  expect(v.subtotal).toBe(112000);
});

test("selectNext/selectPrev berputar dalam batas (tidak melewati ujung)", () => {
  s().addUnit(pcs);
  s().addUnit(dus);
  s().addCurah(gulaMatch, { qtyBase: 1000 });
  const [a, b, c] = s().lines.map((l) => l.lineId);
  s().select(null);
  s().selectNext();
  expect(s().selectedLineId).toBe(a);
  s().selectNext();
  expect(s().selectedLineId).toBe(b);
  s().selectNext();
  s().selectNext();
  expect(s().selectedLineId).toBe(c);
  s().selectPrev();
  s().selectPrev();
  s().selectPrev();
  expect(s().selectedLineId).toBe(a);
  s().select(null);
  s().selectPrev();
  expect(s().selectedLineId).toBe(c);
});

test("cartSummary contoh spec → 6 barang, total 361500", () => {
  const base = {
    productId: "p",
    productName: "x",
    unitName: "pcs",
    isCurah: false,
    baseUnit: "pcs" as const,
    unitSize: 1,
    wholesaleTiers: [],
    amount: null,
  };
  const mk = (id: string, listPrice: number, qtyBase: number) => ({
    ...base,
    lineId: id,
    unitId: id,
    listPrice,
    qtyBase,
  });
  const curah = {
    isCurah: true,
    baseUnit: "gram" as const,
    unitSize: 1000,
    unitName: "kg",
  };
  const lines = [
    mk("1", 78000, 1),
    mk("2", 36000, 2),
    { ...mk("3", 18000, 1500), ...curah },
    { ...mk("4", 29000, 1000), ...curah },
    mk("5", 112000, 1),
    mk("6", 14500, 3),
  ];
  expect(cartSummary(lines)).toEqual({ itemCount: 6, total: 361500 });
});

test("completeSale: baris kosong, saleId baru, lastChange tersimpan", () => {
  s().addUnit(pcs);
  s().setPrintReceipt(true);
  const oldId = s().saleId;
  s().completeSale(38500);
  expect(s().lines).toEqual([]);
  expect(s().saleId).not.toBe(oldId);
  expect(s().lastChange).toBe(38500);
  expect(s().printReceipt).toBeNull();
  expect(s().selectedLineId).toBeNull();
  expect(s().lastAddedLineId).toBeNull();
  s().clearLastChange();
  expect(s().lastChange).toBeNull();
});

test("persist: state dipulihkan dari localStorage (saleId & baris sama)", async () => {
  s().addUnit(pcs);
  s().addCurah(gulaMatch, { amount: 20000 });
  s().setPrintReceipt(false);
  const { saleId, lines } = s();
  const fresh = createCartStore();
  await fresh.persist.rehydrate();
  expect(fresh.getState().saleId).toBe(saleId);
  expect(fresh.getState().lines).toEqual(lines);
  expect(fresh.getState().printReceipt).toBe(false);
  expect(typeof fresh.getState().addUnit).toBe("function");
  const stored = JSON.parse(localStorage.getItem("kasir.cart") ?? "{}") as {
    state: Record<string, unknown>;
  };
  expect(stored.state.addUnit).toBeUndefined();
});

test("setelah completeSale, rehydrate tidak memunculkan baris lama", async () => {
  s().addUnit(pcs);
  s().completeSale(0);
  const { saleId } = s();
  const fresh = createCartStore();
  await fresh.persist.rehydrate();
  expect(fresh.getState().lines).toEqual([]);
  expect(fresh.getState().saleId).toBe(saleId);
});

test("hold lalu resume mengembalikan saleId & baris; resume saat keranjang berisi menahan yang aktif", () => {
  s().hold();
  expect(s().held).toHaveLength(0);
  s().addUnit(pcs);
  const first = { saleId: s().saleId, lines: s().lines };
  s().hold();
  expect(s().lines).toEqual([]);
  expect(s().saleId).not.toBe(first.saleId);
  expect(at(s().held, 0).label).toBe("Keranjang 1");
  s().addUnit(dus);
  const second = { saleId: s().saleId, lines: s().lines };
  s().resume(at(s().held, 0).id);
  expect(s().saleId).toBe(first.saleId);
  expect(s().lines).toEqual(first.lines);
  expect(s().held).toHaveLength(1);
  expect(at(s().held, 0).label).toBe("Keranjang 2");
  expect(at(s().held, 0).saleId).toBe(second.saleId);
  expect(at(s().held, 0).lines).toEqual(second.lines);
});

test("applyPriceChanges mengubah harga baris", () => {
  s().addUnit(dus);
  s().addUnit(pcs);
  s().applyPriceChanges([
    { unitId: "u-dus", oldUnitPrice: 112000, newUnitPrice: 115000 },
  ]);
  expect(at(s().lines, 0).listPrice).toBe(115000);
  expect(cartLineView(at(s().lines, 0), 0).subtotal).toBe(115000);
  expect(at(s().lines, 1).listPrice).toBe(3100);
});

test("applyPriceChanges pada baris grosir: tier tetap, listPrice hanya bila harga lama cocok", () => {
  s().addUnit(pcs);
  const id = at(s().lines, 0).lineId;
  for (let i = 0; i < 39; i++) s().increment(id);
  s().applyPriceChanges([
    { unitId: "u-pcs", oldUnitPrice: 9999, newUnitPrice: 4000 },
  ]);
  expect(at(s().lines, 0).listPrice).toBe(3100);
  s().applyPriceChanges([
    { unitId: "u-pcs", oldUnitPrice: 3100, newUnitPrice: 3300 },
  ]);
  expect(at(s().lines, 0).listPrice).toBe(3300);
  expect(at(s().lines, 0).wholesaleTiers).toEqual([
    { minQty: 40, price: 2800 },
  ]);
});

test("useCart: store tunggal yang tahan di localStorage", () => {
  useCart.getState().addUnit(pcs);
  expect(useCart.getState().lines).toHaveLength(1);
  expect(localStorage.getItem("kasir.cart")).toContain(
    useCart.getState().saleId,
  );
});
