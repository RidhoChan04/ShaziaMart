import { expect, test } from "vitest";
import { __resetMockDbCacheForTests, mockDb } from "./db";
import { createSeedState } from "./seed-data";

test("60 barang, storeCode & barcode unik", () => {
  const s = createSeedState();
  expect(s.products).toHaveLength(60);
  const codes = s.products.map((p) => p.storeCode);
  expect(new Set(codes).size).toBe(60);
  const barcodes = s.products.flatMap((p) =>
    p.units.flatMap((u) => u.barcodes),
  );
  expect(new Set(barcodes).size).toBe(barcodes.length);
  expect(new Set(s.products.map((p) => p.name)).size).toBe(60);
  expect(codes.filter((c) => c.startsWith("11"))[0]).toBe("1101");
});

test("barang buatan: barcode 13 digit berawalan 899, harga kelipatan 500", () => {
  const made = createSeedState().products.filter((p) =>
    p.storeCode.startsWith("11"),
  );
  expect(made).toHaveLength(51);
  for (const p of made) {
    const [pcs] = p.units;
    expect(pcs?.name).toBe("pcs");
    expect(pcs?.price).toBeGreaterThanOrEqual(1000);
    expect(pcs?.price).toBeLessThanOrEqual(95000);
    expect((pcs?.price ?? 1) % 500).toBe(0);
    for (const u of p.units) {
      for (const b of u.barcodes) expect(b).toMatch(/^899\d{10}$/);
    }
  }
  expect(made.filter((p) => p.units.length > 1).length).toBeGreaterThanOrEqual(
    3,
  );
});

test("fixture Indomie dus 40 pcs Rp112.000", () => {
  const p = createSeedState().products.find((x) => x.storeCode === "1001");
  expect(p?.name).toBe("Indomie Goreng");
  const [pcs, dus] = p?.units ?? [];
  expect(pcs).toMatchObject({
    name: "pcs",
    unitSize: 1,
    price: 3100,
    barcodes: ["089686010947"],
    wholesaleTiers: [{ minQty: 40, price: 2800 }],
  });
  expect(dus).toMatchObject({
    name: "dus",
    unitSize: 40,
    price: 112000,
    barcodes: ["189686010944"],
  });
});

test("fixture curah & settings", () => {
  const s = createSeedState();
  const curah = ["2001", "2002", "2003", "2004", "2005"].map((c) =>
    s.products.find((p) => p.storeCode === c),
  );
  expect(curah.map((p) => p?.isCurah)).toEqual([true, true, true, true, true]);
  expect(curah.map((p) => p?.baseUnit)).toEqual([
    "gram",
    "gram",
    "gram",
    "ml",
    "gram",
  ]);
  expect(curah.map((p) => p?.units[0]?.price)).toEqual([
    18000, 14000, 29000, 17000, 13000,
  ]);
  expect(s.settings).toEqual({
    storeName: "ShaziaMart",
    autoPrint: true,
    curahFractions: [250, 500, 1000, 1500, 2000],
    quickCurahProductIds: curah.map((p) => p?.id),
    qrisImageUrl: "/qris-contoh.svg",
    allowNegativeStock: true,
  });
});

test("deterministik", () => {
  expect(createSeedState()).toEqual(createSeedState());
});

test("PIN seed dan state awal", () => {
  const s = createSeedState();
  expect(s.version).toBe(2);
  expect(s.users.map((u) => [u.name, u.role, u.pin])).toEqual([
    ["Rina", "kasir", "123456"],
    ["Budi", "kasir", "654321"],
    ["Pak Ahmad", "pemilik", "999999"],
  ]);
  expect([
    s.session,
    s.shift,
    s.closedShifts,
    s.sales,
    s.pinFailures,
    s.saleSeq,
  ]).toEqual([null, null, [], [], {}, {}]);
});

test("pelanggan seed", () => {
  const s = createSeedState();
  expect(s.customers.map((c) => [c.name, c.creditLimit, c.balance])).toEqual([
    ["Bu Sari", 500000, 120000],
    ["Pak Joko", 300000, 290000],
    ["Mbak Dewi", 500000, 0],
    ["Pak Udin", 200000, 50000],
    ["Bu Tini", 1000000, 640000],
  ]);
});

test("stok awal 20–200 per barang (curah dalam gram/ml)", () => {
  const s = createSeedState();
  for (const p of s.products) {
    const q = s.stock[p.id];
    const [lo, hi] = p.isCurah ? [20000, 200000] : [20, 200];
    expect(q).toBeGreaterThanOrEqual(lo);
    expect(q).toBeLessThanOrEqual(hi);
  }
});

test("ID unik di seluruh state", () => {
  const s = createSeedState();
  const ids = [
    s.store.id,
    ...s.users.map((u) => u.id),
    ...s.customers.map((c) => c.id),
    ...s.products.flatMap((p) => [p.id, ...p.units.map((u) => u.id)]),
  ];
  expect(new Set(ids).size).toBe(ids.length);
});

test("state versi lama di localStorage diganti default v2", () => {
  localStorage.setItem(
    "mock.db",
    JSON.stringify({ store: { id: "x", name: "y" } }),
  );
  __resetMockDbCacheForTests();
  expect(mockDb.get().version).toBe(2);
  expect(mockDb.get().products).toHaveLength(60);
});
