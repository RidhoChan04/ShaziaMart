import type {
  OwnerProduct,
  OwnerProductRow,
  Product,
  StaffProduct,
  StockAlert,
  StockMovement,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { unitCost } from "@/shared/lib/product-rules";
import type { MockProduct, MockState, MockUnit } from "../db";
import { meaningfulCostAlert } from "./cost-alert";

const RECENT_MOVEMENTS = 5;

/** Satuan eceran = satuan pertama; setiap barang selalu punya. */
export function eceranOf(p: MockProduct): MockUnit {
  const first = p.units[0];
  if (!first) throw new Error(`Barang ${p.id} tanpa satuan`);
  return first;
}

/** Proyeksi untuk endpoint kasir: tanpa HPP, kategori, status; satuan nonaktif dibuang. */
export function toKasirProduct(p: MockProduct): Product {
  return {
    id: p.id,
    name: p.name,
    storeCode: p.storeCode,
    isCurah: p.isCurah,
    baseUnit: p.baseUnit,
    units: p.units
      .filter((u) => u.active)
      .map(({ active: _, ...unit }) => unit),
  };
}

/** Proyeksi untuk orang toko: tanpa harga jual, HPP, dan stok; satuan nonaktif dibuang. */
export function toStaffProduct(p: MockProduct): StaffProduct {
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    isCurah: p.isCurah,
    baseUnit: p.baseUnit,
    status: p.status,
    units: p.units
      .filter((u) => u.active)
      .map(({ id, name, unitSize, barcodes }) => ({
        id,
        name,
        unitSize,
        barcodes,
      })),
  };
}

const STAFF_MAX_RESULTS = 20;
const STAFF_MIN_NAME_QUERY = 2;

/**
 * K17: nama mengandung `q` (tanpa beda huruf, min. 2 karakter), atau `q` persis
 * barcode satuan aktif / kode toko; tanpa barang nonaktif; urut nama, maks. 20.
 */
export function searchStaffProducts(
  state: Readonly<MockState>,
  query: string,
): StaffProduct[] {
  const q = query.trim();
  const lower = q.toLowerCase();
  const byName = q.length >= STAFF_MIN_NAME_QUERY;
  const matches = (p: MockProduct): boolean =>
    (byName && p.name.toLowerCase().includes(lower)) ||
    p.storeCode === q ||
    p.units.some((u) => u.active && u.barcodes.includes(q));
  return state.products
    .filter((p) => p.status !== "nonaktif" && q !== "" && matches(p))
    .sort((a, b) => a.name.localeCompare(b.name, "id"))
    .slice(0, STAFF_MAX_RESULTS)
    .map(toStaffProduct);
}

/** Barang pemilik satuan ini, termasuk satuan nonaktif. */
export function productOfUnit(
  state: Readonly<MockState>,
  unitId: string,
): MockProduct | undefined {
  return state.products.find((p) => p.units.some((u) => u.id === unitId));
}

/**
 * K5: nonaktif dan "Stok belum dihitung" diam total; "Sedang langka" dan
 * "Tidak diambil lagi" hanya membungkam menipis (stok minus = masalah data).
 */
export function stockAlertOf(
  state: Readonly<MockState>,
  p: MockProduct,
): StockAlert {
  if (p.status === "nonaktif" || !p.stockCounted) return "none";
  const stock = state.stock[p.id] ?? 0;
  if (stock < 0) return "minus";
  if (p.scarce || p.status === "tidak_diambil") return "none";
  const min = state.minStock[p.id];
  return min !== undefined && stock < min ? "menipis" : "none";
}

/** Barang ada di baris nota barang masuk yang tidak dibatalkan (modal mengikuti barang masuk, K16). */
export function hasReceipts(
  state: Readonly<MockState>,
  productId: string,
): boolean {
  return state.receipts.some(
    (r) =>
      r.status === "aktif" && r.lines.some((l) => l.productId === productId),
  );
}

/** Satuan yang pernah masuk penjualan, selesai maupun dibatalkan. */
export function soldUnitIds(state: Readonly<MockState>): Set<string> {
  return new Set(state.sales.flatMap((s) => s.items.map((i) => i.unitId)));
}

/** Mutasi dari penjualan (jual, batal) dan barang masuk (`stockEntries`); terbaru dulu. */
export function movementsOf(
  state: Readonly<MockState>,
  productId: string,
): StockMovement[] {
  const product = state.products.find((p) => p.id === productId);
  const unitIds = new Set(product?.units.map((u) => u.id));
  const out: StockMovement[] = [];
  for (const sale of state.sales) {
    const qty = sale.items
      .filter((i) => unitIds.has(i.unitId))
      .reduce((sum, i) => sum + i.qtyBase, 0);
    if (qty === 0) continue;
    const kasirName = sale.kasirName;
    out.push({
      id: `${sale.id}:jual`,
      at: sale.createdAt,
      kind: "jual",
      qtyBase: -qty,
      kasirName,
      reason: null,
    });
    if (sale.status === "dibatalkan") {
      out.push({
        id: `${sale.id}:batal`,
        at: sale.voidedAt ?? sale.createdAt,
        kind: "batal",
        qtyBase: qty,
        kasirName,
        reason: null,
      });
    }
  }
  for (const e of state.stockEntries) {
    if (e.productId !== productId) continue;
    const { id, at, kind, qtyBase, actorName: kasirName } = e;
    out.push({ id, at, kind, qtyBase, kasirName, reason: null });
  }
  // Batal di milidetik yang sama dengan jualnya tetap tampil di atas.
  const rank = (m: StockMovement) => (m.kind === "batal" ? 0 : 1);
  return out.sort((a, b) => b.at - a.at || rank(a) - rank(b));
}

export function toOwnerRow(
  state: Readonly<MockState>,
  p: MockProduct,
): OwnerProductRow {
  const eceran = eceranOf(p);
  return {
    id: p.id,
    name: p.name,
    storeCode: p.storeCode,
    category: p.category,
    status: p.status,
    scarce: p.scarce,
    stockCounted: p.stockCounted,
    isCurah: p.isCurah,
    baseUnit: p.baseUnit,
    unitName: eceran.name,
    unitSize: eceran.unitSize,
    price: eceran.price,
    barcodes: p.units.flatMap((u) => u.barcodes),
    stock: state.stock[p.id] ?? 0,
    stockAlert: stockAlertOf(state, p),
  };
}

export function toOwnerProduct(
  state: Readonly<MockState>,
  p: MockProduct,
): OwnerProduct {
  const sold = soldUnitIds(state);
  return {
    id: p.id,
    name: p.name,
    storeCode: p.storeCode,
    category: p.category,
    status: p.status,
    scarce: p.scarce,
    stockCounted: p.stockCounted,
    isCurah: p.isCurah,
    baseUnit: p.baseUnit,
    units: p.units.map((u) => ({
      ...u,
      cost: unitCost(p.cost, u.unitSize),
      sold: sold.has(u.id),
    })),
    cost: p.cost,
    stock: state.stock[p.id] ?? 0,
    minStock: state.minStock[p.id] ?? null,
    stockAlert: stockAlertOf(state, p),
    hasSales: p.units.some((u) => sold.has(u.id)),
    hasReceipts: hasReceipts(state, p.id),
    costAlert: meaningfulCostAlert(state, p),
    recentMovements: movementsOf(state, p.id).slice(0, RECENT_MOVEMENTS),
    priceHistory: state.priceHistory
      .filter((e) => e.productId === p.id)
      .reverse()
      .map(({ productId: _, ...entry }) => entry),
  };
}
