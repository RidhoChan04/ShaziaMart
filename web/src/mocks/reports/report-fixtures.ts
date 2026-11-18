import type {
  OpnameItemState,
  OpnameReason,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import type { MockProduct, MockSale, MockState } from "../db";
import { eceranOf } from "../products/views";
import { createSeedState } from "../seed-data";
import { diffValue } from "../stock/opname-value";

/** Jam dinding Asia/Jakarta → epoch ms UTC (fixture test laporan stok & opname). */
export const wib = (iso: string, h: number, m = 0): number =>
  Date.parse(
    `${iso}T${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:00+07:00`,
  );

/** Kamis 5 Nov 2026 10.00 WIB. */
export const NOW = wib("2026-11-05", 10);

export const INDOMIE = "Indomie Goreng";
export const BIMOLI = "Minyak Goreng Bimoli 2 L";
export const BERAS5 = "Beras Pandan Wangi 5 kg";
export const KOPI = "Kopi Kapal Api 165 g";
export const GULA = "Gula Pasir";

const SEED = createSeedState(NOW);

/**
 * Seed tanpa riwayat (penjualan, shift, nota, stok, opname, kedaluwarsa); `only` = nama barang
 * yang dipertahankan (bawaan: semua).
 */
export function blankState(only?: readonly string[]): MockState {
  const s = structuredClone(SEED);
  s.sales = [];
  s.closedShifts = [];
  s.shift = null;
  s.receipts = [];
  s.stockEntries = [];
  s.opnameSessions = [];
  s.expiryLog = [];
  if (only) s.products = s.products.filter((p) => only.includes(p.name));
  return s;
}

export function productNamed(s: MockState, name: string): MockProduct {
  const p = s.products.find((x) => x.name === name);
  if (!p) throw new Error(`seed tanpa ${name}`);
  return p;
}

let saleSeq = 0;
/** Satu penjualan 1 satuan eceran barang `name` pada jam `at`. */
export function soldAt(
  s: MockState,
  name: string,
  at: number,
  status: MockSale["status"] = "selesai",
): void {
  const p = productNamed(s, name);
  const u = eceranOf(p);
  saleSeq += 1;
  s.sales.push({
    id: `jual-${saleSeq}`,
    number: `T-${saleSeq}`,
    createdAt: at,
    kasirName: "Rina",
    shiftId: "shift-x",
    items: [
      {
        unitId: u.id,
        productName: p.name,
        unitName: u.name,
        isCurah: p.isCurah,
        baseUnit: p.baseUnit,
        unitSize: u.unitSize,
        qtyBase: u.unitSize,
        unitPrice: u.price,
        subtotal: u.price,
        wholesale: false,
      },
    ],
    total: u.price,
    payments: [{ method: "cash", amount: u.price }],
    cashReceived: u.price,
    change: 0,
    customerId: null,
    status,
    printStatus: "tercetak",
    costTotal: 0,
    lineCosts: [null],
    voidedAt: null,
    voidedById: null,
    voidedByName: null,
    voidReason: null,
    voidChannel: null,
    voidRefund: null,
    creditOverLimit: null,
  });
}

export type CountSpec = {
  session: string;
  product: string;
  at: number;
  diff: number;
  by?: string;
  /** Id pembuat sesi; bawaan "u-x" (bukan pengguna seed). */
  byId?: string;
  state?: OpnameItemState;
  reason?: OpnameReason | null;
  /** Bawaan: nilai dari HPP barang sekarang. */
  value?: number | null;
  recount?: { at: number; diff: number; value?: number | null; by: string };
};

/** Tambah satu hitungan barang ke sesi `session` (dibuat bila belum ada). */
export function addCount(s: MockState, c: CountSpec): void {
  const p = productNamed(s, c.product);
  const u = eceranOf(p);
  let session = s.opnameSessions.find((x) => x.id === c.session);
  if (!session) {
    session = {
      id: c.session,
      scope: { kind: "semua", category: null },
      createdById: c.byId ?? "u-x",
      createdByName: c.by ?? "Rina",
      submittedAt: c.at,
      finishedAt: c.at,
      status: "selesai",
      flagged: false,
      reviewedByName: null,
      reviewedAt: null,
      items: [],
    };
    s.opnameSessions.push(session);
  }
  const state = c.state ?? (c.diff === 0 ? "cocok" : "disesuaikan");
  session.items.push({
    productId: p.id,
    productName: p.name,
    unitName: u.name,
    unitSize: u.unitSize,
    isCurah: p.isCurah,
    countedQtyBase: 50 + c.diff,
    countedAt: c.at,
    clockEstimated: false,
    systemQtyBase: 50,
    diffQtyBase: c.diff,
    value: c.value === undefined ? diffValue(c.diff, p.cost) : c.value,
    state,
    reason: c.reason ?? (c.diff === 0 ? null : "tidak_diketahui"),
    receiptRefId: null,
    resolvedByName: c.recount ? c.recount.by : null,
    resolvedAt: c.recount ? c.recount.at : null,
    replacedBySessionId: null,
    replacedByName: null,
    mustHold: false,
    recount: c.recount
      ? {
          countedQtyBase: 50 + c.recount.diff,
          countedAt: c.recount.at,
          systemQtyBase: 50,
          diffQtyBase: c.recount.diff,
          value:
            c.recount.value === undefined
              ? diffValue(c.recount.diff, p.cost)
              : c.recount.value,
        }
      : null,
  });
}

export function addClosedShift(
  s: MockState,
  kasirName: string,
  openedAt: number,
  closedAt: number,
): void {
  s.closedShifts.push({
    shiftId: `shift-${s.closedShifts.length + 1}`,
    openingCash: 0,
    cashSales: 0,
    supplierPayments: 0,
    creditPayments: 0,
    saleRefunds: 0,
    expectedCash: 0,
    countedCash: 0,
    difference: 0,
    salesCount: 0,
    kasirName,
    openedAt,
    closedAt,
  });
}

/** Nota barang masuk satu baris barang `product` oleh `by` pada jam `at`. */
export function addReceipt(
  s: MockState,
  r: {
    id: string;
    by: string;
    /** Bawaan "u-x" (bukan pengguna seed). */
    byId?: string;
    at: number;
    product: string;
    status?: "aktif" | "dibatalkan";
  },
): void {
  const p = productNamed(s, r.product);
  const u = eceranOf(p);
  s.receipts.push({
    id: r.id,
    supplierId: "sup-x",
    notaDate: "2026-11-01",
    photoId: null,
    lines: [
      {
        lineId: "l1",
        productId: p.id,
        productName: p.name,
        unitId: u.id,
        unitName: u.name,
        unitSize: u.unitSize,
        qty: 1,
        unitCost: 1000,
        subtotal: 1000,
        expiryDate: null,
        newProduct: false,
      },
    ],
    payment: {
      timing: "sekarang",
      method: "transfer",
      cashSource: null,
      dueDate: null,
    },
    paid: null,
    status: r.status ?? "aktif",
    createdById: r.byId ?? "u-x",
    createdByName: r.by,
    createdAt: r.at,
    editedByName: null,
    editedAt: null,
    cancelledAt: r.status === "dibatalkan" ? r.at : null,
  });
}

/** Log kedaluwarsa barang `product` oleh `by` pada jam `at`. */
export function addExpiry(
  s: MockState,
  e: { by: string; at: number; product: string; kind?: "keluar" | "ubah_ed" },
): void {
  const p = productNamed(s, e.product);
  const u = eceranOf(p);
  s.expiryLog.push({
    id: `ed-${s.expiryLog.length + 1}`,
    at: e.at,
    actorName: e.by,
    kind: e.kind ?? "keluar",
    productId: p.id,
    productName: p.name,
    unitName: u.name,
    unitSize: u.unitSize,
    isCurah: p.isCurah,
    receiptId: "nota-x",
    lineId: "l1",
    qtyBase: 1,
    fromDate: null,
    toDate: null,
    lossValue: null,
  });
}
