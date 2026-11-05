import { expect, test, vi } from "vitest";
import { __resetMockDbCacheForTests, type MockState, mockDb } from "./db";
import { rng } from "./seed";
import { createSeedState } from "./seed-data";

test("mockDb persist dan reset", () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(Date.UTC(2026, 9, 23, 3));
  mockDb.update((s) => {
    s.store.name = "X";
  });
  expect(JSON.parse(localStorage.getItem("mock.db") ?? "{}").store.name).toBe(
    "X",
  );
  mockDb.reset();
  expect(mockDb.get()).toEqual(createSeedState());
});

test("JSON rusak di localStorage -> default tanpa melempar", () => {
  localStorage.setItem("mock.db", "{bukan json");
  __resetMockDbCacheForTests();
  expect(mockDb.get().store.name).toBe("ShaziaMart");
});

test("JSON bentuk valid v6 di localStorage dimuat lazy", () => {
  const stored: MockState = {
    ...createSeedState(),
    store: { id: "abc", name: "Toko Lain" },
  };
  localStorage.setItem("mock.db", JSON.stringify(stored));
  __resetMockDbCacheForTests();
  expect(mockDb.get().store).toEqual({ id: "abc", name: "Toko Lain" });
});

test("JSON bentuk salah -> default", () => {
  localStorage.setItem("mock.db", JSON.stringify({ version: 6, store: 1 }));
  __resetMockDbCacheForTests();
  expect(mockDb.get().store.name).toBe("ShaziaMart");
});

test("rng deterministik", () => {
  const a = rng(20261017);
  const b = rng(20261017);
  expect([a(), a(), a()]).toEqual([b(), b(), b()]);
});

test("mockDb.get mengembalikan salinan — mutasi tidak bocor", () => {
  mockDb.reset();
  const s = mockDb.get() as MockState;
  s.store.name = "X";
  expect(mockDb.get().store.name).toBe("ShaziaMart");
});

test("state v3 di localStorage → reseed v6", () => {
  const {
    categories: _c,
    priceHistory: _h,
    costAlerts: _a,
    ...rest
  } = createSeedState();
  const lama = { id: "v3", name: "Lama" };
  // Bentuk v3 asli (dengan unitCosts), dan bentuk lengkap tetapi bertanda versi 3.
  const v3 = { ...rest, version: 3, unitCosts: { x: 1000 } };
  for (const stored of [v3, { ...createSeedState(), version: 3 }]) {
    localStorage.setItem("mock.db", JSON.stringify({ ...stored, store: lama }));
    __resetMockDbCacheForTests();
    const s = mockDb.get();
    expect(s.version).toBe(6);
    expect(s.store.name).toBe("ShaziaMart");
    expect(s.categories).toHaveLength(20);
    expect(s).not.toHaveProperty("unitCosts");
    expect(s.products[0]).toMatchObject({ status: "aktif", scarce: false });
  }
});

test("state v4 di localStorage → reseed v6 dengan staffSession null dan koleksi nota kosong", () => {
  const {
    staffSession: _s,
    staffPinFailures: _f,
    suppliers: _sp,
    receipts: _r,
    receiptAudit: _a,
    stockEntries: _e,
    ...v4
  } = createSeedState();
  const lama = { id: "v4", name: "Lama" };
  // Bentuk v4 asli, dan bentuk lengkap tetapi bertanda versi 4.
  for (const stored of [
    { ...v4, version: 4 },
    { ...createSeedState(), version: 4 },
  ]) {
    localStorage.setItem("mock.db", JSON.stringify({ ...stored, store: lama }));
    __resetMockDbCacheForTests();
    const s = mockDb.get();
    expect(s.version).toBe(6);
    expect(s.store.name).toBe("ShaziaMart");
    expect([
      s.staffSession,
      s.staffPinFailures,
      s.suppliers,
      s.receipts,
      s.receiptAudit,
      s.stockEntries,
    ]).toEqual([null, {}, [], [], [], []]);
  }
});

test("state v5 di localStorage → reseed v6 dengan koleksi opname & kedaluwarsa kosong dan batas stok tetap", () => {
  const {
    opnameSessions: _o,
    expiryLog: _x,
    stockRules: _r,
    ...v5
  } = createSeedState();
  const lama = { id: "v5", name: "Lama" };
  // Bentuk v5 asli, dan bentuk lengkap tetapi bertanda versi 5.
  for (const stored of [
    { ...v5, version: 5 },
    { ...createSeedState(), version: 5 },
  ]) {
    localStorage.setItem("mock.db", JSON.stringify({ ...stored, store: lama }));
    __resetMockDbCacheForTests();
    const s = mockDb.get();
    expect(s.version).toBe(6);
    expect(s.store.name).toBe("ShaziaMart");
    expect([s.opnameSessions, s.expiryLog, s.stockRules]).toEqual([
      [],
      [],
      {
        expirySoonDays: 30,
        opnameItemLimit: 100_000,
        opnameSessionLimit: 250_000,
      },
    ]);
  }
});

test.each([
  ["opnameSessions", {}],
  ["expiryLog", null],
  ["stockRules", []],
])("v6 dengan %s berbentuk salah → reseed", (key, bad) => {
  localStorage.setItem(
    "mock.db",
    JSON.stringify({
      ...createSeedState(),
      store: { id: "abc", name: "Toko Lain" },
      [key]: bad,
    }),
  );
  __resetMockDbCacheForTests();
  expect(mockDb.get().store.name).toBe("ShaziaMart");
});

test("staffSession objek atau null; bentuk lain → reseed", () => {
  const stored = {
    ...createSeedState(),
    store: { id: "abc", name: "Toko Lain" },
    staffSession: { userId: "u1" },
  };
  localStorage.setItem("mock.db", JSON.stringify(stored));
  __resetMockDbCacheForTests();
  expect(mockDb.get().staffSession).toEqual({ userId: "u1" });
  localStorage.setItem(
    "mock.db",
    JSON.stringify({ ...stored, staffSession: "u1" }),
  );
  __resetMockDbCacheForTests();
  expect(mockDb.get().store.name).toBe("ShaziaMart");
});

test.each([
  "categories",
  "priceHistory",
  "costAlerts",
  "minStock",
  "creditLedger",
  "ownerLoginFailures",
  "staffSession",
  "staffPinFailures",
  "suppliers",
  "receipts",
  "receiptAudit",
  "stockEntries",
  "opnameSessions",
  "expiryLog",
  "stockRules",
])("v6 tanpa %s → reseed", (key) => {
  const stored: Record<string, unknown> = {
    ...createSeedState(),
    store: { id: "abc", name: "Toko Lain" },
  };
  delete stored[key];
  localStorage.setItem("mock.db", JSON.stringify(stored));
  __resetMockDbCacheForTests();
  expect(mockDb.get().store.name).toBe("ShaziaMart");
});

// key null = localStorage.clear() di tab lain.
test.each(["mock.db", null])(
  "event storage key %s dari tab lain membuang cache",
  (key) => {
    mockDb.reset();
    expect(mockDb.get().store.name).toBe("ShaziaMart");
    const fromOtherTab: MockState = {
      ...createSeedState(),
      store: { id: "abc", name: "Tab Lain" },
    };
    localStorage.setItem("mock.db", JSON.stringify(fromOtherTab));
    window.dispatchEvent(new StorageEvent("storage", { key }));
    expect(mockDb.get().store.name).toBe("Tab Lain");
  },
);

test("event storage key lain tidak membuang cache", () => {
  mockDb.reset();
  localStorage.setItem(
    "mock.db",
    JSON.stringify({ ...createSeedState(), store: { id: "x", name: "Lain" } }),
  );
  window.dispatchEvent(new StorageEvent("storage", { key: "mock.skenario" }));
  expect(mockDb.get().store.name).toBe("ShaziaMart");
});
