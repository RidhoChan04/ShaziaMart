import { expect, test } from "vitest";
import type { ReceiptLine } from "@/shared/api/gen/shaziaMartAPI.schemas";
import type { MockReceipt, MockState, MockStockEntry } from "../db";
import { createSeedState } from "../seed-data";
import { allocateFifo, type Shipment, shipmentsOf } from "./fifo";

const NOW = Date.UTC(2026, 10, 5, 3);
const DAY = 86_400_000;

const ship = (
  lineId: string,
  notaDate: string,
  qtyBase: number,
  expiryDate: string | null,
): Shipment => ({
  receiptId: `r-${lineId}`,
  lineId,
  notaDate,
  createdAt: Date.parse(notaDate),
  order: 0,
  qtyBase,
  removedQtyBase: 0,
  expiryDate,
});

// Susu Bendera A 24 (ED 20 Nov, nota 1 Nov), B 12 (ED 20 Des, nota 3 Nov)
const A = ship("A", "2026-11-01", 24, "2026-11-20");
const B = ship("B", "2026-11-03", 12, "2026-12-20");

test.each([
  [14, [2, 12]],
  [10, [0, 10]],
  [40, [24, 12]],
  [-3, [0, 0]],
])("stok %i → A,B = %j", (stock, [a, b]) =>
  expect(allocateFifo([A, B], stock).map((x) => x.estimateQtyBase)).toEqual([
    a,
    b,
  ]),
);

test("J6: 12 dikeluarkan dari B saat stok 2 → A 2, B 0", () =>
  expect(
    allocateFifo([A, { ...B, removedQtyBase: 12 }], 2).map(
      (x) => x.estimateQtyBase,
    ),
  ).toEqual([2, 0]));

test("dikeluarkan > jumlah baris (nota diubah turun) → kapasitas 0, tidak negatif", () =>
  expect(allocateFifo([{ ...A, qtyBase: 10, removedQtyBase: 15 }], 5)).toEqual([
    { receiptId: "r-A", lineId: "A", capacityQtyBase: 0, estimateQtyBase: 0 },
  ]));

test("kiriman tanpa ED yang lebih baru menyerap stok lebih dulu", () =>
  expect(
    allocateFifo([A, ship("C", "2026-11-04", 10, null)], 14).map(
      (x) => x.estimateQtyBase,
    ),
  ).toEqual([4, 10]));

test("urutan masukan dipertahankan; tanggal nota sama → dibuat terakhir, lalu baris terakhir lebih dulu", () => {
  const early = { ...ship("E", "2026-11-03", 5, null), createdAt: 1 };
  const late1 = { ...ship("L1", "2026-11-03", 5, null), createdAt: 2 };
  const late2 = { ...late1, lineId: "L2", order: 1 };
  expect(
    allocateFifo([late1, early, late2], 8).map((x) => [
      x.lineId,
      x.capacityQtyBase,
      x.estimateQtyBase,
    ]),
  ).toEqual([
    ["L1", 5, 3],
    ["E", 5, 0],
    ["L2", 5, 5],
  ]);
});

const SEED = createSeedState(NOW);
const productNamed = (name: string) => {
  const p = SEED.products.find((x) => x.name === name);
  if (!p) throw new Error(`seed tanpa ${name}`);
  return p;
};
const indomie = productNamed("Indomie Goreng");
const bimoli = productNamed("Minyak Goreng Bimoli 2 L");
const dus = indomie.units.find((u) => u.unitSize > 1);

const line = (
  lineId: string,
  productId: string,
  qty: number,
  unitSize: number,
  expiryDate: string | null,
): ReceiptLine => ({
  lineId,
  productId,
  productName: "",
  unitId: "",
  unitName: "",
  unitSize,
  qty,
  unitCost: 1000,
  subtotal: qty * 1000,
  expiryDate,
  newProduct: false,
});

const receipt = (
  id: string,
  notaDate: string,
  createdAt: number,
  lines: ReceiptLine[],
  status: MockReceipt["status"] = "aktif",
): MockReceipt => ({
  id,
  supplierId: "sup",
  notaDate,
  photoId: null,
  lines,
  payment: {
    timing: "sekarang",
    method: "tunai",
    cashSource: "laci",
    dueDate: null,
  },
  paid: null,
  status,
  createdById: "u",
  createdByName: "Rina",
  createdAt,
  editedByName: null,
  editedAt: null,
  cancelledAt: status === "dibatalkan" ? createdAt : null,
});

const removal = (
  receiptId: string,
  lineId: string,
  qtyBase: number,
): MockStockEntry => ({
  id: `k-${receiptId}-${lineId}-${qtyBase}`,
  productId: indomie.id,
  at: NOW,
  effectiveAt: NOW,
  qtyBase,
  actorName: "Rina",
  kind: "keluar_kedaluwarsa",
  receiptId,
  lineId,
  opnameId: null,
  reason: null,
});

test("shipmentsOf: baris nota aktif barang itu; dikeluarkan dijumlah per (receiptId, lineId)", () => {
  if (!dus) throw new Error("seed berubah");
  const state: MockState = {
    ...SEED,
    receipts: [
      receipt("r1", "2026-11-01", NOW - 4 * DAY, [
        line("l1", indomie.id, 2, dus.unitSize, "2026-11-20"),
        line("l2", bimoli.id, 12, 1, null),
        line("l3", indomie.id, 6, 1, null),
      ]),
      receipt("r2", "2026-11-03", NOW - 2 * DAY, [
        line("l1", indomie.id, 12, 1, "2026-12-20"),
      ]),
      receipt(
        "r3",
        "2026-11-04",
        NOW - DAY,
        [line("l1", indomie.id, 5, 1, null)],
        "dibatalkan",
      ),
    ],
    stockEntries: [
      removal("r2", "l1", -4),
      removal("r2", "l1", -3),
      removal("r1", "l3", -1),
      // Entri jenis lain pada baris yang sama tidak mengurangi kapasitas.
      { ...removal("r1", "l1", -9), kind: "koreksi_masuk" },
    ],
  };
  expect(shipmentsOf(state, indomie.id)).toEqual([
    {
      receiptId: "r1",
      lineId: "l1",
      notaDate: "2026-11-01",
      createdAt: NOW - 4 * DAY,
      order: 0,
      qtyBase: 2 * dus.unitSize,
      removedQtyBase: 0,
      expiryDate: "2026-11-20",
    },
    {
      receiptId: "r1",
      lineId: "l3",
      notaDate: "2026-11-01",
      createdAt: NOW - 4 * DAY,
      order: 2,
      qtyBase: 6,
      removedQtyBase: 1,
      expiryDate: null,
    },
    {
      receiptId: "r2",
      lineId: "l1",
      notaDate: "2026-11-03",
      createdAt: NOW - 2 * DAY,
      order: 0,
      qtyBase: 12,
      removedQtyBase: 7,
      expiryDate: "2026-12-20",
    },
  ]);
  expect(shipmentsOf(state, "tidak-ada")).toEqual([]);
});
