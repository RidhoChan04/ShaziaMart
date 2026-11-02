import { describe, expect, test } from "vitest";
import type { MockProduct, MockSale, MockState } from "../db";
import { createSeedState } from "../seed-data";
import {
  type ApplyOk,
  type ApplyOptions,
  applyDraft,
  saveApplied,
} from "./apply";
import { draftFromProduct } from "./drafts";
import { applyPriceLines } from "./prices";

const NOW = Date.UTC(2026, 10, 2, 7);
const REPLACE: ApplyOptions = { mode: "replace", source: "pemilik", now: NOW };
const MERGE: ApplyOptions = { mode: "merge", source: "impor", now: NOW };

function byName(s: Readonly<MockState>, name: string): MockProduct {
  const p = s.products.find((x) => x.name === name);
  if (!p) throw new Error(`seed tanpa ${name}`);
  return p;
}

const EMPTY = {
  name: null,
  category: null,
  sellUnit: null,
  barcode: null,
  cost: null,
  price: null,
  tierMinQty: null,
  tierPrice: null,
  bigName: null,
  bigSize: null,
  bigBarcode: null,
  bigCost: null,
  bigPrice: null,
  minStock: null,
};

function ok(r: ReturnType<typeof applyDraft>): ApplyOk {
  if (!r.ok) throw new Error(JSON.stringify(r.errors));
  return r;
}

/** Tandai satuan sebagai terjual lewat satu penjualan berisi satuan itu. */
function sold(s: MockState, unitIds: string[]): void {
  const sale = structuredClone(s.sales[0]) as MockSale;
  sale.id = "jual-uji";
  sale.items = unitIds.map(
    (unitId) => ({ ...sale.items[0], unitId }) as MockSale["items"][number],
  );
  s.sales = [sale];
}

describe("draftFromProduct + applyDraft", () => {
  test("semua 60 barang seed: draft dari barang lalu replace → tidak ada perubahan", () => {
    const s = createSeedState(NOW);
    for (const p of s.products) {
      const big = p.units.slice(1).find((u) => u.active);
      const r = ok(
        applyDraft(s, p, draftFromProduct(s, p), {
          ...REPLACE,
          bigUnitId: big?.id ?? null,
        }),
      );
      expect(r).toMatchObject({
        isNew: false,
        changes: [],
        notes: [],
        priceEntries: [],
        costChanged: false,
        minStock: s.minStock[p.id] ?? null,
      });
      expect(r.product).toEqual(p);
    }
  });

  test("draft Indomie: modal di bigCost (qtyBase = isi dus), batas dalam satuan eceran; Gula: modal eceran per kg", () => {
    const s = createSeedState(NOW);
    expect(draftFromProduct(s, byName(s, "Indomie Goreng"))).toEqual({
      name: "Indomie Goreng",
      category: "Mi Instan",
      sellUnit: "pcs",
      barcode: "089686010947",
      cost: null,
      price: 3100,
      tierMinQty: 40,
      tierPrice: 2800,
      bigName: "dus",
      bigSize: 40,
      bigBarcode: "189686010944",
      bigCost: 104000,
      bigPrice: 112000,
      minStock: 10,
    });
    expect(draftFromProduct(s, byName(s, "Gula Pasir"))).toMatchObject({
      sellUnit: "kg",
      cost: 16500,
      bigName: null,
      bigCost: null,
      minStock: 10,
    });
  });

  test("applyDraft tidak memutasi state; saveApplied menyimpan barang, kategori, riwayat, dan peringatan", () => {
    const s = createSeedState(NOW);
    const snapshot = structuredClone(s);
    const indomie = byName(s, "Indomie Goreng");
    const draft = {
      ...draftFromProduct(s, indomie),
      bigCost: 108000,
      category: "Mi & Pasta",
      price: 3200,
    };
    const r = ok(applyDraft(s, indomie, draft, { ...MERGE, bigUnitId: null }));
    expect(s).toEqual(snapshot);

    saveApplied(s, r, MERGE);
    expect(byName(s, "Indomie Goreng")).toEqual(r.product);
    expect(s.categories.at(-1)).toBe("Mi & Pasta");
    expect(s.costAlerts[indomie.id]).toEqual({
      fromCost: { amount: 104000, qtyBase: 40 },
      changedAt: NOW,
      source: "impor",
    });
    expect(s.priceHistory.at(-1)).toMatchObject({
      productId: indomie.id,
      unitId: indomie.units[0]?.id,
      at: NOW,
      oldPrice: 3100,
      newPrice: 3200,
      source: "impor",
    });
  });

  test("changes berurutan dan notes", () => {
    const s = createSeedState(NOW);
    const indomie = byName(s, "Indomie Goreng");
    const r = ok(
      applyDraft(
        s,
        indomie,
        {
          ...draftFromProduct(s, indomie),
          category: "Mie",
          sellUnit: "bungkus",
          barcode: null,
          cost: 2500,
          bigCost: 108000,
          price: 3200,
          tierMinQty: 20,
          tierPrice: 2900,
          bigName: "karton",
          bigPrice: 115000,
          bigBarcode: "18992628022191",
          minStock: 12,
        },
        { ...REPLACE, bigUnitId: indomie.units[1]?.id ?? null },
      ),
    );
    expect(r.changes).toEqual([
      "Kategori Mi Instan → Mie",
      "Dijual per pcs → bungkus",
      "Barcode 089686010947 → —",
      "Harga modal Rp2.600 → Rp2.700",
      "Harga jual Rp3.100 → Rp3.200",
      "Grosir beli 40 · Rp2.800 → beli 20 · Rp2.900",
      "Satuan besar dus isi 40 · Rp112.000 → karton isi 40 · Rp115.000",
      "Barcode karton 189686010944 → 18992628022191",
      "Batas stok menipis 10 pcs → 12 bungkus",
    ]);
    expect(r.notes).toEqual([
      "Modal eceran diabaikan — memakai modal satuan besar",
      "Kategori baru: Mie",
    ]);
    expect(r.costChanged).toBe(true);
    // Satuan besar diganti nama, id tetap (form menyebut unitId-nya).
    expect(r.product.units.map((u) => [u.id, u.name])).toEqual(
      indomie.units.map((u, i) => [u.id, i === 0 ? "bungkus" : "karton"]),
    );
  });

  test("barang baru: tanpa changes/priceEntries, storeCode 2006, notes modal & kategori", () => {
    const s = createSeedState(NOW);
    const r = ok(
      applyDraft(
        s,
        null,
        {
          ...EMPTY,
          name: "Beras Cianjur",
          category: "Beras Lokal",
          sellUnit: "kg",
          cost: 12500,
          price: 14000,
          bigName: "karung",
          bigSize: 25,
          bigCost: 300000,
          bigPrice: 340000,
          minStock: 50,
        },
        MERGE,
      ),
    );
    expect(r).toMatchObject({
      isNew: true,
      changes: [],
      priceEntries: [],
      costChanged: false,
      minStock: 50000,
      notes: [
        "Modal eceran diabaikan — memakai modal satuan besar",
        "Kategori baru: Beras Lokal",
      ],
    });
    expect(r.product).toMatchObject({
      storeCode: "2006",
      isCurah: true,
      baseUnit: "gram",
      status: "aktif",
      scarce: false,
      stockCounted: false,
      cost: { amount: 300000, qtyBase: 25000 },
    });
    expect(r.product.units.map((u) => [u.name, u.unitSize, u.price])).toEqual([
      ["kg", 1000, 14000],
      ["karung", 25000, 340000],
    ]);
    saveApplied(s, r, MERGE);
    expect(s.stock[r.product.id]).toBe(0);
    expect(s.minStock[r.product.id]).toBe(50000);
    expect(s.costAlerts).toEqual({});
  });

  test("merge (impor): field kosong mempertahankan nilai lama; satuan besar dicocokkan lewat nama", () => {
    const s = createSeedState(NOW);
    const indomie = byName(s, "Indomie Goreng");
    const r = ok(
      applyDraft(
        s,
        indomie,
        { ...EMPTY, name: "indomie goreng ", sellUnit: "PCS", price: 3300 },
        MERGE,
      ),
    );
    expect(r.changes).toEqual(["Harga jual Rp3.100 → Rp3.300"]);
    expect(r.product).toEqual({
      ...indomie,
      units: [{ ...indomie.units[0], price: 3300 }, indomie.units[1]],
    });
    expect(r.minStock).toBe(10);

    sold(s, [indomie.units[1]?.id ?? ""]);
    const locked = applyDraft(
      s,
      indomie,
      {
        ...EMPTY,
        name: "Indomie Goreng",
        bigName: "DUS",
        bigSize: 24,
        bigCost: 62400, // modal per pcs tetap Rp2.600 agar hanya kunci isi yang gagal
      },
      MERGE,
    );
    expect(locked).toEqual({
      ok: false,
      errors: [
        {
          field: "bigSize",
          message: "Isi dus tidak bisa diubah — sudah terjual",
        },
      ],
    });
  });

  test("replace (form): field kosong menghapus; priceEntries untuk berubah, ditambah, dihapus", () => {
    const s = createSeedState(NOW);
    s.sales = []; // tanpa riwayat: dus belum terjual
    const indomie = byName(s, "Indomie Goreng");
    const [pcs, dus] = indomie.units;
    const r = ok(
      applyDraft(
        s,
        indomie,
        {
          ...draftFromProduct(s, indomie),
          tierMinQty: null,
          tierPrice: null,
          bigPrice: 110000,
          minStock: null,
        },
        { ...REPLACE, bigUnitId: dus?.id ?? null },
      ),
    );
    expect(r.minStock).toBeNull();
    expect(r.product.units[0]?.wholesaleTiers).toEqual([]);
    expect(
      r.priceEntries.map((e) => [
        e.unitId,
        e.tierMinQty,
        e.oldPrice,
        e.newPrice,
        e.isEceran,
      ]),
    ).toEqual([
      [dus?.id, null, 112000, 110000, false],
      [pcs?.id, 40, 2800, null, true],
    ]);
    expect(r.changes).toEqual([
      "Grosir beli 40 · Rp2.800 → —",
      "Satuan besar dus isi 40 · Rp112.000 → dus isi 40 · Rp110.000",
      "Batas stok menipis 10 pcs → —",
    ]);

    const fresh = ok(
      applyDraft(
        s,
        indomie,
        {
          ...draftFromProduct(s, indomie),
          bigName: "pak",
          bigSize: 5,
          bigBarcode: null,
          bigCost: null,
          cost: 2600,
          bigPrice: 15000,
        },
        { ...REPLACE, bigUnitId: null },
      ),
    );
    // dus belum terjual → dibuang; pak baru dengan id baru.
    expect(fresh.product.units.map((u) => u.name)).toEqual(["pcs", "pak"]);
    expect(fresh.product.units[1]?.id).not.toBe(dus?.id);
    expect(
      fresh.priceEntries.map((e) => [e.unitName, e.oldPrice, e.newPrice]),
    ).toEqual([
      ["pak", null, 15000],
      ["dus", 112000, null],
    ]);
  });

  test("terjual: 'Dijual per' terkunci bila satuan mana pun terjual (curah → pcs juga)", () => {
    const s = createSeedState(NOW);
    const gula = byName(s, "Gula Pasir");
    sold(s, [gula.units[0]?.id ?? ""]);
    const r = applyDraft(
      s,
      gula,
      { ...draftFromProduct(s, gula), sellUnit: "ons" },
      REPLACE,
    );
    expect(r).toEqual({
      ok: false,
      errors: [
        {
          field: "sellUnit",
          message: "'Dijual per' tidak bisa diubah — barang sudah terjual",
        },
      ],
    });
    // Nama satuan sama jenis (kg → KG) tetap boleh dan tidak dihitung perubahan.
    expect(
      ok(
        applyDraft(
          s,
          gula,
          { ...draftFromProduct(s, gula), sellUnit: " KG " },
          REPLACE,
        ),
      ).changes,
    ).toEqual([]);
  });

  test("C11: belum terjual tetapi stok > 0 → 'Dijual per' terkunci (pcs → kg 422)", () => {
    const s = createSeedState(NOW);
    s.sales = [];
    const indomie = byName(s, "Indomie Goreng");
    expect(s.stock[indomie.id]).toBeGreaterThan(0);
    const r = applyDraft(
      s,
      indomie,
      { ...draftFromProduct(s, indomie), sellUnit: "kg" },
      { ...REPLACE, bigUnitId: indomie.units[1]?.id ?? null },
    );
    expect(r).toEqual({
      ok: false,
      errors: [
        {
          field: "sellUnit",
          message: "'Dijual per' tidak bisa diubah — barang sudah terjual",
        },
      ],
    });
    // Stok minus juga mengunci.
    s.stock[indomie.id] = -2;
    expect(
      applyDraft(
        s,
        indomie,
        { ...draftFromProduct(s, indomie), sellUnit: "kg" },
        REPLACE,
      ).ok,
    ).toBe(false);
  });

  test("belum terjual & stok 0: 'Dijual per' boleh diubah (pcs → kg) dan isi satuan besar ikut satuan dasar", () => {
    const s = createSeedState(NOW);
    s.sales = [];
    const indomie = byName(s, "Indomie Goreng");
    s.stock[indomie.id] = 0;
    const r = ok(
      applyDraft(
        s,
        indomie,
        { ...draftFromProduct(s, indomie), sellUnit: "kg" },
        { ...REPLACE, bigUnitId: indomie.units[1]?.id ?? null },
      ),
    );
    expect(r.product).toMatchObject({ isCurah: true, baseUnit: "gram" });
    expect(r.product.units.map((u) => u.unitSize)).toEqual([1000, 40000]);
    expect(r.minStock).toBe(10000);
  });
});

describe("applyPriceLines", () => {
  test("mengganti harga baris tanpa menyentuh field lain; satuan tidak dikenal ditolak", () => {
    const s = createSeedState(NOW);
    const indomie = byName(s, "Indomie Goreng");
    const [pcs, dus] = indomie.units;
    const r = ok(
      applyPriceLines(
        s,
        indomie,
        [
          { unitId: pcs?.id ?? "", tierMinQty: null, price: 3500 },
          { unitId: dus?.id ?? "", tierMinQty: null, price: 116500 },
        ],
        NOW,
      ),
    );
    expect(r.product).toEqual({
      ...indomie,
      units: [
        { ...pcs, price: 3500 },
        { ...dus, price: 116500 },
      ],
    });
    expect(
      r.priceEntries.map((e) => [
        e.unitName,
        e.oldPrice,
        e.newPrice,
        e.source,
        e.at,
      ]),
    ).toEqual([
      ["pcs", 3100, 3500, "pemilik", NOW],
      ["dus", 112000, 116500, "pemilik", NOW],
    ]);
    expect(r.costChanged).toBe(false);
    expect(
      applyPriceLines(
        s,
        indomie,
        [{ unitId: "x", tierMinQty: null, price: 1000 }],
        NOW,
      ),
    ).toEqual({
      ok: false,
      errors: [{ field: "price", message: "Satuan tidak ditemukan" }],
    });
  });
});
