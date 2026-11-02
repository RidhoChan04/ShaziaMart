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

test("JSON bentuk valid v4 di localStorage dimuat lazy", () => {
  const stored: MockState = {
    ...createSeedState(),
    store: { id: "abc", name: "Toko Lain" },
  };
  localStorage.setItem("mock.db", JSON.stringify(stored));
  __resetMockDbCacheForTests();
  expect(mockDb.get().store).toEqual({ id: "abc", name: "Toko Lain" });
});

test("JSON bentuk salah -> default", () => {
  localStorage.setItem("mock.db", JSON.stringify({ version: 4, store: 1 }));
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

test("state v3 di localStorage → reseed v4", () => {
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
    expect(s.version).toBe(4);
    expect(s.store.name).toBe("ShaziaMart");
    expect(s.categories).toHaveLength(20);
    expect(s).not.toHaveProperty("unitCosts");
    expect(s.products[0]).toMatchObject({ status: "aktif", scarce: false });
  }
});

test.each([
  "categories",
  "priceHistory",
  "costAlerts",
  "minStock",
  "creditLedger",
  "ownerLoginFailures",
])("v4 tanpa %s → reseed", (key) => {
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
