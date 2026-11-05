import { beforeEach, describe, expect, test } from "vitest";
import type {
  CatalogMatch,
  FieldError,
  OwnerProduct,
  OwnerProductRow,
  OwnerTodaySummary,
  Sale,
  StockMovement,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { newId } from "@/shared/lib/id";
import { mockDb } from "../db";
import {
  json,
  loginWithShift,
  ownerLogin,
  post,
  saleItem,
  unitOf,
  voidSale,
} from "./test-helpers";

const INDOMIE = "Indomie Goreng";
const send = (method: string, path: string, body?: unknown) =>
  fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  });
const put = (path: string, body: unknown) => send("PUT", path, body);
const del = (path: string) => send("DELETE", path);

const productId = (name: string): string => {
  const p = mockDb.get().products.find((x) => x.name === name);
  if (!p) throw new Error(`seed tanpa ${name}`);
  return p.id;
};
const detail = async (id: string) =>
  json<OwnerProduct>(await fetch(`/api/owner/products/${id}`));
const rows = async () =>
  json<OwnerProductRow[]>(await fetch("/api/owner/products"));
const attention = async () =>
  (await json<OwnerTodaySummary>(await fetch("/api/owner/summary/today")))
    .attention;
const errorsOf = async (res: Response) =>
  (await json<{ errors: FieldError[] }>(res)).errors;

const TEH = {
  name: "Teh Pucuk Harum 350 ml",
  category: "Minuman",
  sellUnit: "botol",
  barcode: "8996001600269",
  cost: 3000,
  price: 4000,
  tier: { minQty: 12, price: 3750 },
  bigUnit: {
    unitId: null,
    name: "dus",
    size: 24,
    barcode: null,
    cost: 70000,
    price: 84000,
  },
  minStock: 24,
};

/** Isi form Indomie sesuai seed; `patch` menimpa field atas, `big` menimpa satuan besar. */
function indomieInput(
  patch: Record<string, unknown> = {},
  big: Record<string, unknown> | null = {},
) {
  return {
    name: INDOMIE,
    category: "Mi Instan",
    sellUnit: "pcs",
    barcode: "089686010947",
    cost: null,
    price: 3100,
    tier: { minQty: 40, price: 2800 },
    bigUnit:
      big === null
        ? null
        : {
            unitId: unitOf(INDOMIE, "dus").id,
            name: "dus",
            size: 40,
            barcode: "189686010944",
            cost: 104000,
            price: 112000,
            ...big,
          },
    minStock: 10,
    ...patch,
  };
}

const create = async (body: unknown = TEH) => {
  const res = await post("/api/owner/products", body);
  expect(res.status).toBe(201);
  return json<OwnerProduct>(res);
};

/** Rina menjual Indomie (2 pcs + 1 dus) sehingga kedua satuan terkunci. */
async function sellIndomie(): Promise<Sale> {
  await loginWithShift();
  const res = await post("/api/sales", {
    saleId: newId(),
    items: [
      saleItem(INDOMIE, { qtyBase: 2 }, 3100, "pcs"),
      saleItem(INDOMIE, { qtyBase: 40 }, 112000, "dus"),
    ],
    payments: [{ method: "cash", amount: 118200 }],
    cashReceived: 118200,
    print: false,
  });
  expect(res.status).toBe(201);
  return json<Sale>(res);
}

describe("tanpa sesi pemilik", () => {
  test("tanpa sesi pemilik → 401 untuk semua endpoint barang", async () => {
    const id = productId(INDOMIE);
    const before = mockDb.get();
    const responses = [
      await fetch("/api/owner/products"),
      await post("/api/owner/products", TEH),
      await fetch(`/api/owner/products/${id}`),
      await put(`/api/owner/products/${id}`, indomieInput({ price: 3500 })),
      await del(`/api/owner/products/${id}`),
      await put(`/api/owner/products/${id}/status`, {
        status: "nonaktif",
        scarce: false,
      }),
      await put(`/api/owner/products/${id}/prices`, {
        lines: [{ unitId: unitOf(INDOMIE).id, tierMinQty: null, price: 3500 }],
      }),
      await del(`/api/owner/products/${id}/cost-alert`),
      await fetch(`/api/owner/products/${id}/movements`),
      await fetch("/api/owner/categories"),
    ];
    for (const res of responses) {
      expect(res.status).toBe(401);
      expect((await json<{ code: string }>(res)).code).toBe("UNAUTHORIZED");
    }
    expect(mockDb.get()).toEqual(before);
  });
});

describe("barang pemilik", () => {
  beforeEach(async () => {
    expect((await ownerLogin()).status).toBe(200);
  });

  test("daftar: 60 baris; Indomie = {unitName:'pcs', unitSize:1, price:3100, barcodes:['089686010947','189686010944'], category:'Mi Instan', stockAlert:'none'}; tanpa key cost", async () => {
    const list = await rows();
    expect(list).toHaveLength(60);
    const names = list.map((r) => r.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "id")));
    const indomie = list.find((r) => r.name === INDOMIE);
    expect(indomie).toMatchObject({
      id: productId(INDOMIE),
      storeCode: "1001",
      unitName: "pcs",
      unitSize: 1,
      price: 3100,
      barcodes: ["089686010947", "189686010944"],
      category: "Mi Instan",
      status: "aktif",
      scarce: false,
      stockCounted: true,
      isCurah: false,
      baseUnit: "pcs",
      stockAlert: "none",
    });
    expect(indomie?.stock).toBe(mockDb.get().stock[productId(INDOMIE)]);
    for (const row of list) expect(row).not.toHaveProperty("cost");
  });

  test("detail Indomie: units[0].cost 2600, units[1].cost 104000, cost {104000,40}, minStock 10", async () => {
    const p = await detail(productId(INDOMIE));
    expect(p.units.map((u) => [u.name, u.cost, u.active])).toEqual([
      ["pcs", 2600, true],
      ["dus", 104000, true],
    ]);
    expect(p).toMatchObject({
      cost: { amount: 104000, qtyBase: 40 },
      minStock: 10,
      stockAlert: "none",
      costAlert: null,
      priceHistory: [],
    });
    expect((await fetch(`/api/owner/products/${newId()}`)).status).toBe(404);
  });

  test("tambah Teh Pucuk → 201, storeCode '2006', stok 0 belum dihitung, cost {70000,24}, units[0].cost 2917, tier 12/3750, dus 24 Rp84.000", async () => {
    const p = await create();
    expect(p).toMatchObject({
      name: "Teh Pucuk Harum 350 ml",
      storeCode: "2006",
      category: "Minuman",
      status: "aktif",
      scarce: false,
      stock: 0,
      stockCounted: false,
      stockAlert: "none",
      isCurah: false,
      baseUnit: "pcs",
      cost: { amount: 70000, qtyBase: 24 },
      minStock: 24,
      hasSales: false,
      costAlert: null,
      recentMovements: [],
      priceHistory: [],
    });
    expect(p.units).toMatchObject([
      {
        name: "botol",
        unitSize: 1,
        price: 4000,
        cost: 2917,
        barcodes: ["8996001600269"],
        wholesaleTiers: [{ minQty: 12, price: 3750 }],
        active: true,
        sold: false,
      },
      {
        name: "dus",
        unitSize: 24,
        price: 84000,
        cost: 70000,
        barcodes: [],
        wholesaleTiers: [],
        active: true,
        sold: false,
      },
    ]);
    expect(await detail(p.id)).toEqual(p);
    expect((await rows()).length).toBe(61);
  });

  test("tambah curah kg batas 2,5 → baseUnit gram, unitSize 1000, minStock 2500", async () => {
    const p = await create({
      name: "Kacang Hijau",
      category: null,
      sellUnit: " KG ",
      barcode: null,
      cost: 20000,
      price: 24000,
      tier: null,
      bigUnit: null,
      minStock: 2.5,
    });
    expect(p).toMatchObject({
      isCurah: true,
      baseUnit: "gram",
      cost: { amount: 20000, qtyBase: 1000 },
      minStock: 2500,
      category: null,
    });
    expect(p.units).toMatchObject([
      // Disimpan seperti diketik (di-trim); jenisnya tetap dikenali tanpa beda huruf.
      { name: "KG", unitSize: 1000, cost: 20000, barcodes: [] },
    ]);
  });

  test("tambah dengan barcode 089686010947 → 422 [{field:'barcode', message:'Barcode sudah dipakai: Indomie Goreng'}]; nama ' indomie goreng ' → name 'Nama sudah dipakai barang lain'", async () => {
    const before = mockDb.get();
    const dupBarcode = await post("/api/owner/products", {
      ...TEH,
      barcode: "089686010947",
    });
    expect(dupBarcode.status).toBe(422);
    expect(await errorsOf(dupBarcode)).toEqual([
      { field: "barcode", message: "Barcode sudah dipakai: Indomie Goreng" },
    ]);
    const dupBig = await post("/api/owner/products", {
      ...TEH,
      bigUnit: { ...TEH.bigUnit, barcode: "189686010944" },
    });
    expect(await errorsOf(dupBig)).toEqual([
      { field: "bigBarcode", message: "Barcode sudah dipakai: Indomie Goreng" },
    ]);
    const dupName = await post("/api/owner/products", {
      ...TEH,
      name: " indomie goreng ",
    });
    expect(dupName.status).toBe(422);
    const body = await json<{ code: string; errors: FieldError[] }>(dupName);
    expect(body.code).toBe("VALIDATION");
    expect(body.errors).toEqual([
      { field: "name", message: "Nama sudah dipakai barang lain" },
    ]);
    expect(mockDb.get()).toEqual(before);
  });

  test("isi mentah divalidasi per field (bukan skema): tipe salah, nama 101 huruf, body kosong", async () => {
    const wrongTypes = await post("/api/owner/products", {
      ...TEH,
      price: "4000",
      cost: 2500.5,
      tier: { minQty: 1.5, price: 3750 },
      barcode: 8996001600269,
    });
    expect(wrongTypes.status).toBe(422);
    expect(await errorsOf(wrongTypes)).toEqual([
      { field: "barcode", message: "Barcode salah, scan ulang" },
      { field: "cost", message: "Harga modal: ketik angka saja, mis. 3500" },
      { field: "price", message: "Harga jual: ketik angka saja, mis. 3500" },
      { field: "tierMinQty", message: "Grosir: beli minimal 2 ke atas" },
    ]);
    const longName = await post("/api/owner/products", {
      ...TEH,
      name: "x".repeat(101),
    });
    expect(await errorsOf(longName)).toEqual([
      { field: "name", message: "Nama terlalu panjang (maks. 100 huruf)" },
    ]);
    const empty = await post("/api/owner/products", null);
    expect(empty.status).toBe(422);
    expect(await errorsOf(empty)).toEqual([
      { field: "name", message: "Nama barang belum diisi" },
      { field: "sellUnit", message: "'Dijual per' belum diisi" },
      { field: "price", message: "Harga jual belum diisi" },
    ]);
  });

  test("ubah barang terjual: Dijual per kg → 422 sellUnit terkunci; isi dus 24 → 422 bigSize 'Isi dus tidak bisa diubah — sudah terjual'", async () => {
    const id = productId(INDOMIE);
    const path = `/api/owner/products/${id}`;
    // Belum terjual di test ini? Seed riwayat bisa sudah menjualnya; pastikan terjual.
    await sellIndomie();
    const before = mockDb.get();

    const kg = await put(path, indomieInput({ sellUnit: "kg" }));
    expect(kg.status).toBe(422);
    expect(await errorsOf(kg)).toEqual([
      {
        field: "sellUnit",
        message: "'Dijual per' tidak bisa diubah — barang sudah terjual",
      },
    ]);
    const isi = await put(
      path,
      indomieInput({ cost: 2600 }, { size: 24, cost: null }),
    );
    expect(isi.status).toBe(422);
    expect(await errorsOf(isi)).toEqual([
      {
        field: "bigSize",
        message: "Isi dus tidak bisa diubah — sudah terjual",
      },
    ]);
    expect(mockDb.get()).toEqual(before);

    // Yang tidak dikunci tetap boleh: nama satuan eceran, nama satuan besar, harga.
    const ok = await put(
      path,
      indomieInput({ sellUnit: "bungkus" }, { name: "karton" }),
    );
    expect(ok.status).toBe(200);
    const p = await json<OwnerProduct>(ok);
    expect(p.units.map((u) => [u.name, u.unitSize, u.sold])).toEqual([
      ["bungkus", 1, true],
      ["karton", 40, true],
    ]);
    expect(p.units[1]?.id).toBe(
      before.products.find((x) => x.id === id)?.units[1]?.id,
    );
  });

  test("C11: Dijual per terkunci bila stok ≠ 0 walau belum terjual; barang baru stok 0 boleh diubah", async () => {
    // Barang seed tanpa penjualan (riwayat dibuang) tetapi stok > 0.
    mockDb.update((s) => {
      s.sales = [];
    });
    const id = productId("Kopi Kapal Api 165 g");
    expect(mockDb.get().stock[id]).toBeGreaterThan(0);
    const locked = await put(`/api/owner/products/${id}`, {
      name: "Kopi Kapal Api 165 g",
      category: "Kopi & Teh",
      sellUnit: "kg",
      barcode: "8991002105126",
      cost: null,
      price: 14500,
      tier: null,
      bigUnit: null,
      minStock: 10,
    });
    expect(locked.status).toBe(422);
    expect(await errorsOf(locked)).toEqual([
      {
        field: "sellUnit",
        message: "'Dijual per' tidak bisa diubah — barang sudah terjual",
      },
    ]);

    const teh = await create();
    const changed = await put(`/api/owner/products/${teh.id}`, {
      ...TEH,
      sellUnit: "liter",
      minStock: 2.5,
    });
    expect(changed.status).toBe(200);
    const p = await json<OwnerProduct>(changed);
    expect(p).toMatchObject({ isCurah: true, baseUnit: "ml", minStock: 2500 });
    expect(p.units.map((u) => [u.name, u.unitSize])).toEqual([
      ["liter", 1000],
      ["dus", 24000],
    ]);
  });

  test("hapus satuan besar terjual → active false (kasir tidak melihatnya); belum terjual → dibuang", async () => {
    await sellIndomie();
    const id = productId(INDOMIE);
    const dus = unitOf(INDOMIE, "dus");
    const res = await put(
      `/api/owner/products/${id}`,
      indomieInput({ cost: 2600 }, null),
    );
    expect(res.status).toBe(200);
    const p = await json<OwnerProduct>(res);
    expect(p.units.map((u) => [u.id, u.name, u.active, u.sold])).toEqual([
      [unitOf(INDOMIE, "pcs").id, "pcs", true, true],
      [dus.id, "dus", false, true],
    ]);
    expect(p.cost).toEqual({ amount: 2600, qtyBase: 1 });
    expect(p.costAlert).toBeNull();
    const lookup = await fetch("/api/catalog/lookup?code=189686010944");
    expect(lookup.status).toBe(410);
    const search = await json<CatalogMatch[]>(
      await fetch("/api/catalog/search?q=indomie"),
    );
    expect(
      search.find((m) => m.product.id === id)?.product.units.map((u) => u.name),
    ).toEqual(["pcs"]);

    // Satuan besar baru boleh ditambah; dus lama tetap nonaktif dan barcodenya tetap terpakai.
    const karton = await json<OwnerProduct>(
      await put(
        `/api/owner/products/${id}`,
        indomieInput(
          { cost: 2600 },
          {
            unitId: null,
            name: "karton",
            size: 20,
            barcode: null,
            cost: null,
            price: 60000,
          },
        ),
      ),
    );
    expect(karton.units.map((u) => [u.name, u.active])).toEqual([
      ["pcs", true],
      ["dus", false],
      ["karton", true],
    ]);
    const reuse = await put(
      `/api/owner/products/${id}`,
      indomieInput(
        { cost: 2600 },
        {
          unitId: null,
          name: "pak",
          size: 5,
          barcode: "189686010944",
          cost: null,
          price: 15000,
        },
      ),
    );
    expect(await errorsOf(reuse)).toEqual([
      { field: "bigBarcode", message: "Barcode sudah dipakai: Indomie Goreng" },
    ]);

    const teh = await create();
    const tehDus = teh.units[1]?.id;
    const removed = await json<OwnerProduct>(
      await put(`/api/owner/products/${teh.id}`, {
        ...TEH,
        bigUnit: null,
      }),
    );
    expect(removed.units.map((u) => u.name)).toEqual(["botol"]);
    expect(
      mockDb
        .get()
        .products.flatMap((p) => p.units)
        .some((u) => u.id === tehDus),
    ).toBe(false);
    expect(removed.cost).toEqual({ amount: 3000, qtyBase: 1 });
  });

  test("modal naik dua kali lalu kembali: satu butir 2600→2700, lalu 2600→2750, lalu hilang", async () => {
    const id = productId(INDOMIE);
    const path = `/api/owner/products/${id}`;
    expect((await attention()).costChanges).toEqual([]);

    const first = await put(path, indomieInput({}, { cost: 108000 }));
    expect(first.status).toBe(200);
    const items = (await attention()).costChanges;
    expect(items).toHaveLength(1);
    expect(items[0]).toMatchObject({
      productId: id,
      productName: "Indomie Goreng",
      unitName: "pcs",
      oldCost: 2600,
      newCost: 2700,
      price: 3100,
      source: "pemilik",
    });
    expect((await json<OwnerProduct>(first)).costAlert).toMatchObject({
      fromCost: { amount: 104000, qtyBase: 40 },
      source: "pemilik",
    });

    await put(path, indomieInput({}, { cost: 110000 }));
    const again = (await attention()).costChanges;
    expect(again).toHaveLength(1);
    expect(again[0]).toMatchObject({ oldCost: 2600, newCost: 2750 });
    expect(again[0]?.changedAt).toBeGreaterThanOrEqual(
      items[0]?.changedAt ?? 0,
    );

    await put(path, indomieInput({}, { cost: 104000 }));
    expect((await attention()).costChanges).toEqual([]);
    expect((await detail(id)).costAlert).toBeNull();
  });

  test("barang baru tidak memicu butir modal", async () => {
    const teh = await create();
    expect(teh.costAlert).toBeNull();
    expect((await attention()).costChanges).toEqual([]);
    expect(mockDb.get().costAlerts).toEqual({});
    // Modal pertama kali diisi pada barang tanpa modal juga tidak memicu butir.
    const noCost = await create({
      ...TEH,
      name: "Teh Kotak",
      barcode: null,
      cost: null,
      bigUnit: { ...TEH.bigUnit, cost: null },
    });
    expect(noCost.cost).toBeNull();
    await put(`/api/owner/products/${noCost.id}`, {
      ...TEH,
      name: "Teh Kotak",
      barcode: null,
    });
    expect((await attention()).costChanges).toEqual([]);
  });

  test("PUT prices pcs 3500 → harga berubah, priceHistory[0] {unitName:'pcs', isEceran:true, tierMinQty:null, oldPrice:3100, newPrice:3500, source:'pemilik'}, butir modal hilang", async () => {
    const id = productId(INDOMIE);
    await put(`/api/owner/products/${id}`, indomieInput({}, { cost: 108000 }));
    expect((await attention()).costChanges).toHaveLength(1);

    const res = await put(`/api/owner/products/${id}/prices`, {
      lines: [
        { unitId: unitOf(INDOMIE, "pcs").id, tierMinQty: null, price: 3500 },
        { unitId: unitOf(INDOMIE, "pcs").id, tierMinQty: 40, price: 3000 },
      ],
    });
    expect(res.status).toBe(200);
    const p = await json<OwnerProduct>(res);
    expect(p.units[0]).toMatchObject({
      price: 3500,
      wholesaleTiers: [{ minQty: 40, price: 3000 }],
    });
    expect(p.units[1]?.price).toBe(112000);
    expect(p.cost).toEqual({ amount: 108000, qtyBase: 40 });
    expect(p.costAlert).toBeNull();
    expect(p.priceHistory).toHaveLength(2);
    expect(p.priceHistory).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          unitName: "pcs",
          isEceran: true,
          unitSize: 1,
          tierMinQty: null,
          oldPrice: 3100,
          newPrice: 3500,
          source: "pemilik",
        }),
        expect.objectContaining({
          tierMinQty: 40,
          oldPrice: 2800,
          newPrice: 3000,
        }),
      ]),
    );
    expect((await attention()).costChanges).toEqual([]);

    await put(`/api/owner/products/${id}/prices`, {
      lines: [
        { unitId: unitOf(INDOMIE, "dus").id, tierMinQty: null, price: 120000 },
      ],
    });
    expect((await detail(id)).priceHistory[0]).toMatchObject({
      unitName: "dus",
      isEceran: false,
      unitSize: 40,
      tierMinQty: null,
      oldPrice: 112000,
      newPrice: 120000,
      source: "pemilik",
    });
  });

  test("PUT prices di bawah modal → 422 [{field:'price', message:'Harga jual di bawah modal (Rp2.600)'}]", async () => {
    const id = productId(INDOMIE);
    const path = `/api/owner/products/${id}/prices`;
    const pcs = unitOf(INDOMIE, "pcs").id;
    // Dengan grosir 2.800, harga eceran < 2.600 juga membuat grosir tidak lebih murah: lepas grosir dulu.
    await put(`/api/owner/products/${id}`, indomieInput({ tier: null }));
    const before = mockDb.get();

    const below = await put(path, {
      lines: [{ unitId: pcs, tierMinQty: null, price: 2500 }],
    });
    expect(below.status).toBe(422);
    expect(await errorsOf(below)).toEqual([
      { field: "price", message: "Harga jual di bawah modal (Rp2.600)" },
    ]);
    const missingTier = await put(path, {
      lines: [{ unitId: pcs, tierMinQty: 12, price: 2900 }],
    });
    expect(await errorsOf(missingTier)).toEqual([
      { field: "tierPrice", message: "Grosir tidak ditemukan" },
    ]);
    const bigBelow = await put(path, {
      lines: [
        { unitId: unitOf(INDOMIE, "dus").id, tierMinQty: null, price: 100000 },
      ],
    });
    expect(await errorsOf(bigBelow)).toEqual([
      {
        field: "bigPrice",
        message: "Satuan besar: harga jual di bawah modal (Rp104.000)",
      },
    ]);
    const fraction = await put(path, {
      lines: [{ unitId: pcs, tierMinQty: null, price: 3000.5 }],
    });
    expect(await errorsOf(fraction)).toEqual([
      { field: "price", message: "Harga jual: ketik angka saja, mis. 3500" },
    ]);
    const empty = await put(path, { lines: [] });
    expect(empty.status).toBe(422);
    expect(mockDb.get()).toEqual(before);

    // Barang bergrosir: harga eceran di bawah grosir ditolak pada baris grosir.
    await put(`/api/owner/products/${id}`, indomieInput());
    const underTier = await put(path, {
      lines: [{ unitId: pcs, tierMinQty: null, price: 2700 }],
    });
    expect(await errorsOf(underTier)).toEqual([
      { field: "tierPrice", message: "Harga grosir harus lebih murah" },
    ]);
  });

  test("DELETE cost-alert → 204, butir hilang, harga tetap", async () => {
    const id = productId(INDOMIE);
    await put(`/api/owner/products/${id}`, indomieInput({}, { cost: 108000 }));
    expect((await attention()).costChanges).toHaveLength(1);

    const res = await del(`/api/owner/products/${id}/cost-alert`);
    expect(res.status).toBe(204);
    expect((await attention()).costChanges).toEqual([]);
    const p = await detail(id);
    expect(p.costAlert).toBeNull();
    expect(p.units.map((u) => u.price)).toEqual([3100, 112000]);
    expect(p.cost).toEqual({ amount: 108000, qtyBase: 40 });
    expect((await del(`/api/owner/products/${id}/cost-alert`)).status).toBe(
      204,
    );
    expect(
      (await del(`/api/owner/products/${newId()}/cost-alert`)).status,
    ).toBe(404);
  });

  test("status: nonaktif & langka; stockOuts untuk tidak_diambil stok 0; aturan K5 pada lowStockCount/negativeStockCount", async () => {
    const setStatus = (id: string, status: string, scarce = false) =>
      put(`/api/owner/products/${id}/status`, { status, scarce });
    const low = (await rows()).filter((r) => r.stockAlert === "menipis");
    expect(low).toHaveLength(7);
    const [a, b, c] = low.map((r) => r.id);
    if (!a || !b || !c) throw new Error("seed tanpa 3 barang menipis");
    expect(await attention()).toMatchObject({
      lowStockCount: 7,
      negativeStockCount: 0,
      stockOuts: [],
    });

    const scarce = await setStatus(a, "aktif", true);
    expect(scarce.status).toBe(200);
    expect(await json<OwnerProduct>(scarce)).toMatchObject({
      status: "aktif",
      scarce: true,
      stockAlert: "none",
    });
    expect((await attention()).lowStockCount).toBe(6);
    await setStatus(b, "tidak_diambil");
    expect((await attention()).lowStockCount).toBe(5);
    await setStatus(c, "nonaktif");
    expect((await attention()).lowStockCount).toBe(4);
    const name = mockDb.get().products.find((p) => p.id === c)?.name ?? "";
    const search = await json<CatalogMatch[]>(
      await fetch(`/api/catalog/search?q=${encodeURIComponent(name)}`),
    );
    expect(search.map((m) => m.product.id)).not.toContain(c);

    // Barang baru (belum dihitung) stok −3 → tidak minus; setelah dihitung → minus.
    const teh = await create();
    mockDb.update((s) => {
      s.stock[teh.id] = -3;
    });
    expect((await attention()).negativeStockCount).toBe(0);
    expect((await detail(teh.id)).stockAlert).toBe("none");
    mockDb.update((s) => {
      const p = s.products.find((x) => x.id === teh.id);
      if (p) p.stockCounted = true;
    });
    expect((await attention()).negativeStockCount).toBe(1);
    // Sedang langka hanya membungkam menipis: stok minus tetap muncul.
    mockDb.update((s) => {
      s.stock[a] = -1;
    });
    expect((await detail(a)).stockAlert).toBe("minus");
    expect((await attention()).negativeStockCount).toBe(2);

    // Tidak diambil lagi & habis → stockOuts.
    mockDb.update((s) => {
      s.stock[b] = 0;
    });
    const bName = mockDb.get().products.find((p) => p.id === b)?.name;
    expect((await attention()).stockOuts).toEqual([
      { productId: b, productName: bName },
    ]);
    // Kembali Aktif → hilang dari stockOuts, muncul lagi sebagai menipis.
    await setStatus(b, "aktif");
    expect(await attention()).toMatchObject({
      stockOuts: [],
      lowStockCount: 5,
    });

    const bad = await setStatus(a, "hilang");
    expect(bad.status).toBe(422);
    expect((await setStatus(newId(), "aktif")).status).toBe(404);
  });

  test("hapus: barang baru tanpa penjualan → 204; Indomie setelah terjual → 409 PRODUCT_HAS_SALES", async () => {
    const teh = await create();
    await put(`/api/owner/products/${teh.id}`, { ...TEH, price: 4500 });
    const res = await del(`/api/owner/products/${teh.id}`);
    expect(res.status).toBe(204);
    expect((await fetch(`/api/owner/products/${teh.id}`)).status).toBe(404);
    const s = mockDb.get();
    expect(s.products.some((p) => p.id === teh.id)).toBe(false);
    expect(teh.id in s.stock).toBe(false);
    expect(teh.id in s.minStock).toBe(false);
    expect(s.priceHistory.some((e) => e.productId === teh.id)).toBe(false);
    // Barcode barang terhapus bebas dipakai lagi.
    expect((await post("/api/owner/products", TEH)).status).toBe(201);

    await sellIndomie();
    const id = productId(INDOMIE);
    const conflict = await del(`/api/owner/products/${id}`);
    expect(conflict.status).toBe(409);
    expect(
      await json<{ code: string; detail: string }>(conflict),
    ).toMatchObject({
      code: "PRODUCT_HAS_SALES",
      detail:
        "Barang yang sudah pernah terjual tidak bisa dihapus — gunakan Nonaktif.",
    });
    expect((await detail(id)).hasSales).toBe(true);
    expect((await del(`/api/owner/products/${newId()}`)).status).toBe(404);
  });

  test("mutasi: Rina jual 2 Indomie lalu batal → movements[0] {kind:'batal', qtyBase:2, kasirName:'Rina', reason:null}, [1] {kind:'jual', qtyBase:-2}; recentMovements ≤ 5", async () => {
    await loginWithShift();
    const res = await post("/api/sales", {
      saleId: newId(),
      items: [saleItem(INDOMIE, { qtyBase: 2 }, 3100)],
      payments: [{ method: "cash", amount: 6200 }],
      cashReceived: 6200,
      print: false,
    });
    const sale = await json<Sale>(res);
    expect(
      (await voidSale(sale.id, { ownerPin: "999999", reason: "salah input" }))
        .status,
    ).toBe(200);

    const id = productId(INDOMIE);
    const moves = await json<StockMovement[]>(
      await fetch(`/api/owner/products/${id}/movements`),
    );
    expect(moves[0]).toEqual({
      id: `${sale.id}:batal`,
      at: mockDb.get().sales.find((s) => s.id === sale.id)?.voidedAt,
      kind: "batal",
      qtyBase: 2,
      kasirName: "Rina",
      reason: null,
    });
    expect(moves[1]).toEqual({
      id: `${sale.id}:jual`,
      at: sale.createdAt,
      kind: "jual",
      qtyBase: -2,
      kasirName: "Rina",
      reason: null,
    });
    const ats = moves.map((m) => m.at);
    expect(ats).toEqual([...ats].sort((x, y) => y - x));
    const p = await detail(id);
    expect(p.recentMovements.length).toBeLessThanOrEqual(5);
    expect(p.recentMovements).toEqual(moves.slice(0, 5));
    expect(
      (await fetch(`/api/owner/products/${newId()}/movements`)).status,
    ).toBe(404);
  });

  test("kategori: 20 template; setelah tambah barang kategori 'Frozen Food' → ada di akhir", async () => {
    const before = await json<string[]>(await fetch("/api/owner/categories"));
    expect(before).toHaveLength(20);
    expect(before[0]).toBe("Beras");
    expect(before[19]).toBe("Lain-lain");

    await create({ ...TEH, category: "Frozen Food" });
    // Kategori yang sudah ada dipakai dengan ejaan daftar, tidak ditambah lagi.
    const kotak = await create({
      ...TEH,
      name: "Teh Kotak",
      barcode: null,
      category: " minuman ",
    });
    expect(kotak.category).toBe("Minuman");
    const after = await json<string[]>(await fetch("/api/owner/categories"));
    expect(after).toEqual([...before, "Frozen Food"]);
  });
});
