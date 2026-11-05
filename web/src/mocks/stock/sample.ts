import { addIsoDays, DAY_MS, jakartaIsoDate } from "@/shared/lib/business-day";
import { newId } from "@/shared/lib/id";
import { unitCost } from "@/shared/lib/product-rules";
import { receiptLineTotal } from "@/shared/lib/receipt-rules";
import type { MockProduct, MockState } from "../db";
import { nextStoreCode } from "../products/build";
import { key } from "../products/checks";
import { upsertSupplier } from "../receipts/receive";
import { buildProduct } from "../seed-data";

type SampleProduct = {
  name: string;
  category: string;
  unit: string;
  price: number;
  cost: number;
  stock: number;
};

/** K13: barang contoh mockup stok (harga & HPP per satuan eceran). */
const PRODUCTS: SampleProduct[] = [
  {
    name: "Sari Roti Tawar",
    category: "Roti & Biskuit",
    unit: "bungkus",
    price: 17_000,
    cost: 15_000,
    stock: 3,
  },
  {
    name: "Sari Roti Sobek Coklat",
    category: "Roti & Biskuit",
    unit: "bungkus",
    price: 14_000,
    cost: 12_500,
    stock: 5,
  },
  {
    name: "Susu Kental Manis Frisian Flag 370 g",
    category: "Susu",
    unit: "kaleng",
    price: 13_500,
    cost: 12_000,
    stock: 6,
  },
  {
    name: "Susu Bendera Kotak 200 ml",
    category: "Susu",
    unit: "kotak",
    price: 5_500,
    cost: 4_800,
    stock: 14,
  },
];

/** Satu nota = satu kiriman: `[id, barang, jumlah eceran, hari lalu, ED relatif hari ini]`. */
const RECEIPTS: [string, number, number, number, number][] = [
  ["contoh-stok-1", 3, 24, 30, 18], // Susu Bendera A
  ["contoh-stok-2", 2, 6, 21, 13],
  ["contoh-stok-3", 0, 3, 7, -2],
  ["contoh-stok-4", 1, 5, 3, 2],
  ["contoh-stok-5", 3, 12, 2, 48], // Susu Bendera B
];
const SUPPLIER = "CV Sumber Rejeki";
/** Di luar rentang ID barang/satuan seed (1–60 barang). */
const ID_BASE = 1000;

/** Barang contoh; barang seed bernama sama dipakai apa adanya (nama barang unik). */
function sampleProduct(
  state: MockState,
  spec: SampleProduct,
  index: number,
): MockProduct {
  const existing = state.products.find((p) => key(p.name) === key(spec.name));
  if (existing) return existing;
  const p = buildProduct(
    {
      name: spec.name,
      storeCode: nextStoreCode(state),
      category: spec.category,
      baseUnit: "pcs",
      isCurah: false,
      units: [
        { name: spec.unit, unitSize: 1, price: spec.price, barcodes: [] },
      ],
    },
    ID_BASE + index,
    { n: ID_BASE + index },
  );
  p.cost = { amount: spec.cost, qtyBase: 1 };
  state.products.push(p);
  state.stock[p.id] = spec.stock;
  return p;
}

/**
 * K13 (panel pengembang): barang & nota contoh ber-ED mockup stok, relatif terhadap hari ini.
 * Nota dicatat sebagai riwayat (barang masuk pada jam notanya) tanpa mengubah HPP; stok barang
 * contoh baru diisi sesuai mockup. Dipanggil lagi → tidak ada yang berubah.
 */
export function applySampleStock(state: MockState, now: number): void {
  if (state.receipts.some((r) => r.id === RECEIPTS[0]?.[0])) return;
  const actor = state.users.find((u) => u.role === "kasir");
  if (!actor) throw new Error("Seed tanpa kasir");
  const products = PRODUCTS.map((spec, i) => sampleProduct(state, spec, i));
  const today = jakartaIsoDate(now);
  for (const [id, index, qty, daysAgo, expiryDays] of RECEIPTS) {
    const p = products[index];
    const eceran = p?.units[0];
    if (!p || !eceran) throw new Error("Contoh stok tanpa barang");
    const at = now - daysAgo * DAY_MS;
    const cost =
      unitCost(p.cost, eceran.unitSize) ?? PRODUCTS[index]?.cost ?? 0;
    state.receipts.push({
      id,
      supplierId: upsertSupplier(state, SUPPLIER, at).id,
      notaDate: jakartaIsoDate(at),
      photoId: null,
      lines: [
        {
          lineId: "l1",
          productId: p.id,
          productName: p.name,
          unitId: eceran.id,
          unitName: eceran.name,
          unitSize: eceran.unitSize,
          qty,
          unitCost: cost,
          subtotal: receiptLineTotal(qty, cost),
          expiryDate: addIsoDays(today, expiryDays),
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
      status: "aktif",
      createdById: actor.id,
      createdByName: actor.name,
      createdAt: at,
      editedByName: null,
      editedAt: null,
      cancelledAt: null,
    });
    state.receiptAudit.push({
      id: newId(at),
      receiptId: id,
      at,
      actorName: actor.name,
      action: "buat",
      changes: [],
    });
    state.stockEntries.push({
      id: newId(at),
      productId: p.id,
      at,
      effectiveAt: at,
      qtyBase: qty * eceran.unitSize,
      actorName: actor.name,
      kind: "masuk",
      receiptId: id,
      lineId: "l1",
      opnameId: null,
      reason: null,
    });
  }
}
