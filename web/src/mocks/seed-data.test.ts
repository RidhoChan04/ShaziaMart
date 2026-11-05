import { expect, test } from "vitest";
import { isValidBarcode } from "@/shared/lib/product-rules";
import { __resetMockDbCacheForTests, mockDb } from "./db";
import { balanceOf, oldestUnpaidAt } from "./ledger";
import { CATALOG_NAMES } from "./seed-catalog-names";
import { createSeedState } from "./seed-data";

const DAY = 86_400_000;
const NOW = Date.UTC(2026, 9, 23, 3);

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

test("barang buatan: barcode EAN-13 berawalan 899 dengan check digit benar, harga kelipatan 500", () => {
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
      for (const b of u.barcodes) {
        expect(b).toMatch(/^899\d{10}$/);
        expect(isValidBarcode(b)).toBe(true);
      }
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
  expect(curah.map((p) => p?.name)).toEqual([
    "Gula Pasir",
    "Beras",
    "Telur Ayam",
    "Minyak Goreng",
    "Tepung Terigu",
  ]);
  expect(s.products.filter((p) => p.isCurah).map((p) => p.id)).toEqual(
    s.settings.quickCurahProductIds,
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

test("deterministik untuk now yang sama", () => {
  expect(createSeedState(NOW)).toEqual(createSeedState(NOW));
});

test("PIN seed dan state awal", () => {
  const s = createSeedState();
  expect(s.version).toBe(6);
  expect(s.users.map((u) => [u.name, u.role, u.pin, u.password])).toEqual([
    ["Rina", "kasir", "123456", undefined],
    ["Budi", "kasir", "654321", undefined],
    ["Pak Ahmad", "pemilik", "999999", "pemilik123"],
  ]);
  expect([
    s.session,
    s.shift,
    s.pinFailures,
    s.ownerSession,
    s.ownerLoginFailures,
    s.staffSession,
    s.staffPinFailures,
  ]).toEqual([null, null, {}, null, {}, null, {}]);
  // Tidak ada nota seed.
  expect([s.suppliers, s.receipts, s.receiptAudit, s.stockEntries]).toEqual([
    [],
    [],
    [],
    [],
  ]);
  // Tanpa sesi opname & log kedaluwarsa seed; batas stok tetap (J8).
  expect([s.opnameSessions, s.expiryLog, s.stockRules]).toEqual([
    [],
    [],
    {
      expirySoonDays: 30,
      opnameItemLimit: 100_000,
      opnameSessionLimit: 250_000,
    },
  ]);
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

test("stok awal 20–200 per barang (curah dalam gram/ml), kecuali yang menipis", () => {
  const s = createSeedState();
  for (const p of s.products) {
    if ((s.stock[p.id] ?? 0) < (s.minStock[p.id] ?? 0)) continue;
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
    ...s.creditLedger.map((e) => e.id),
  ];
  expect(new Set(ids).size).toBe(ids.length);
});

test("state versi lama di localStorage diganti default v6", () => {
  localStorage.setItem(
    "mock.db",
    JSON.stringify({ store: { id: "x", name: "y" } }),
  );
  __resetMockDbCacheForTests();
  expect(mockDb.get().version).toBe(6);
  expect(mockDb.get().products).toHaveLength(60);
});

const CATEGORIES = [
  "Beras",
  "Minyak Goreng",
  "Gula & Tepung",
  "Telur",
  "Mi Instan",
  "Bumbu Dapur",
  "Kopi & Teh",
  "Susu",
  "Minuman",
  "Makanan Ringan",
  "Roti & Biskuit",
  "Makanan Kaleng",
  "Sabun & Deterjen",
  "Perawatan Diri",
  "Kebutuhan Bayi",
  "Rokok",
  "Gas & Air Galon",
  "Obat Ringan",
  "Alat Tulis",
  "Lain-lain",
];

test("seed: 20 kategori template; setiap barang berkategori dari daftar; semua barcode valid & unik", () => {
  const s = createSeedState(NOW);
  expect(s.categories).toEqual(CATEGORIES);
  for (const p of s.products) expect(CATEGORIES).toContain(p.category);
  const byCode = (code: string) =>
    s.products.find((p) => p.storeCode === code)?.category;
  expect(
    [
      "1001",
      "1002",
      "1003",
      "1004",
      "2001",
      "2002",
      "2003",
      "2004",
      "2005",
    ].map(byCode),
  ).toEqual([
    "Mi Instan",
    "Beras",
    "Minyak Goreng",
    "Kopi & Teh",
    "Gula & Tepung",
    "Beras",
    "Telur",
    "Minyak Goreng",
    "Gula & Tepung",
  ]);
  // Barang buatan memakai kategori grupnya di CATALOG_NAMES.
  for (const p of s.products.filter((x) => x.storeCode.startsWith("11"))) {
    const entry = CATALOG_NAMES.find((c) => c.name === p.name);
    expect(p.category).toBe(entry?.category);
  }
  const named = (name: string) =>
    CATALOG_NAMES.find((c) => c.name === name)?.category;
  expect(
    [
      "Beras Merah 1 kg",
      "Margarin Blue Band 200 g",
      "Madu Nusantara 150 ml",
      "Pop Mie Ayam Cup",
      "Teh Tubruk Gopek 50 g",
      "Susu Bendera Cokelat 200 ml",
      "Santan Kara 200 ml",
      "Tisu Paseo 250 Sheet",
      "Teh Gelas 350 ml",
    ].map(named),
  ).toEqual([
    "Beras",
    "Minyak Goreng",
    "Gula & Tepung",
    "Mi Instan",
    "Kopi & Teh",
    "Susu",
    "Bumbu Dapur",
    "Sabun & Deterjen",
    "Minuman",
  ]);
  const barcodes = s.products.flatMap((p) =>
    p.units.flatMap((u) => u.barcodes),
  );
  expect(barcodes.filter((b) => !isValidBarcode(b))).toEqual([]);
  expect(new Set(barcodes).size).toBe(barcodes.length);
});

test("seed: semua barang aktif, tidak langka, stok terhitung; semua satuan aktif; tanpa riwayat harga & peringatan modal", () => {
  const s = createSeedState(NOW);
  for (const p of s.products) {
    expect([p.status, p.scarce, p.stockCounted]).toEqual([
      "aktif",
      false,
      true,
    ]);
    expect(p.units.every((u) => u.active)).toBe(true);
  }
  expect(s.priceHistory).toEqual([]);
  expect(s.costAlerts).toEqual({});
  expect(s).not.toHaveProperty("unitCosts");
});

test("HPP per barang: fixture persis; lainnya 85–93% harga satuan pertama kelipatan Rp50", () => {
  const s = createSeedState(NOW);
  const cost = (code: string) =>
    s.products.find((x) => x.storeCode === code)?.cost;
  expect(cost("2001")).toEqual({ amount: 16500, qtyBase: 1000 });
  expect(cost("1002")).toEqual({ amount: 71000, qtyBase: 1 });
  expect(cost("1001")).toEqual({ amount: 104000, qtyBase: 40 });
  const fixed = ["2001", "1002", "1001"];
  for (const p of s.products) {
    if (fixed.includes(p.storeCode)) continue;
    const [first] = p.units;
    const c = p.cost;
    expect(c?.qtyBase).toBe(first?.unitSize);
    const amount = c?.amount ?? Number.NaN;
    const price = first?.price ?? Number.NaN;
    expect(Number.isSafeInteger(amount)).toBe(true);
    expect(amount % 50).toBe(0);
    expect(amount * 100).toBeGreaterThanOrEqual(price * 85 - 2500);
    expect(amount * 100).toBeLessThanOrEqual(price * 93 + 2500);
  }
});

test("seed: 7 barang di bawah stok minimum; saldo pelanggan = Σ ledger seed", () => {
  const s = createSeedState(NOW);
  for (const p of s.products) {
    expect(s.minStock[p.id]).toBe(10 * (p.units[0]?.unitSize ?? Number.NaN));
  }
  expect(
    s.minStock[s.products.find((p) => p.name === "Gula Pasir")?.id ?? ""],
  ).toBe(10000);
  const low = s.products.filter(
    (p) => (s.stock[p.id] ?? 0) < (s.minStock[p.id] ?? 0),
  );
  expect(low).toHaveLength(7);
  for (const p of low) {
    // Barang buatan saja: fixture E2E (10xx, 20xx) tidak pernah menipis.
    expect(p.storeCode).toMatch(/^11/);
    expect(s.stock[p.id]).toBeGreaterThan(0);
  }

  expect(
    s.customers.map((c) => [
      c.name,
      c.balance,
      balanceOf(s, c.id),
      oldestUnpaidAt(s, c.id),
    ]),
  ).toEqual([
    ["Bu Sari", 120000, 120000, NOW - 40 * DAY],
    ["Pak Joko", 290000, 290000, NOW - 12 * DAY],
    ["Mbak Dewi", 0, 0, null],
    ["Pak Udin", 50000, 50000, NOW - 35 * DAY],
    ["Bu Tini", 640000, 640000, NOW - 45 * DAY],
  ]);
  const sari = s.customers[0]?.id;
  expect(s.creditLedger.filter((e) => e.customerId === sari)).toHaveLength(2);
  expect(new Set(s.creditLedger.map((e) => e.id)).size).toBe(
    s.creditLedger.length,
  );
});
