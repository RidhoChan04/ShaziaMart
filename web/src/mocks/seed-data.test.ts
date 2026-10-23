import { expect, test } from "vitest";
import { __resetMockDbCacheForTests, mockDb } from "./db";
import { balanceOf, oldestUnpaidAt } from "./ledger";
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
  expect(s.version).toBe(3);
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
  ]).toEqual([null, null, {}, null, {}]);
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

test("state versi lama di localStorage diganti default v3", () => {
  localStorage.setItem(
    "mock.db",
    JSON.stringify({ store: { id: "x", name: "y" } }),
  );
  __resetMockDbCacheForTests();
  expect(mockDb.get().version).toBe(3);
  expect(mockDb.get().products).toHaveLength(60);
});

test("HPP: setiap satuan punya HPP; fixture persis; lainnya 85–93% harga kelipatan Rp50", () => {
  const s = createSeedState(NOW);
  const cost = (code: string, unit: string) => {
    const p = s.products.find((x) => x.storeCode === code);
    const u = p?.units.find((x) => x.name === unit);
    return s.unitCosts[u?.id ?? ""];
  };
  expect([
    cost("2001", "kg"),
    cost("1002", "pcs"),
    cost("1001", "pcs"),
    cost("1001", "dus"),
  ]).toEqual([16500, 71000, 2650, 104000]);
  const fixed = ["2001/kg", "1002/pcs", "1001/pcs", "1001/dus"];
  const units = s.products.flatMap((p) => p.units.map((u) => ({ p, u })));
  expect(Object.keys(s.unitCosts).sort()).toEqual(
    units.map(({ u }) => u.id).sort(),
  );
  for (const { p, u } of units) {
    const c = s.unitCosts[u.id] ?? Number.NaN;
    expect(Number.isSafeInteger(c)).toBe(true);
    if (fixed.includes(`${p.storeCode}/${u.name}`)) continue;
    expect(c % 50).toBe(0);
    expect(c * 100).toBeGreaterThanOrEqual(u.price * 85 - 2500);
    expect(c * 100).toBeLessThanOrEqual(u.price * 93 + 2500);
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
