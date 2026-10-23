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

test("JSON bentuk valid v3 di localStorage dimuat lazy", () => {
  const stored: MockState = {
    ...createSeedState(),
    store: { id: "abc", name: "Toko Lain" },
  };
  localStorage.setItem("mock.db", JSON.stringify(stored));
  __resetMockDbCacheForTests();
  expect(mockDb.get().store).toEqual({ id: "abc", name: "Toko Lain" });
});

test("JSON bentuk salah -> default", () => {
  localStorage.setItem("mock.db", JSON.stringify({ version: 3, store: 1 }));
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

test("state v2 di localStorage → reseed v3", () => {
  const {
    unitCosts: _c,
    minStock: _m,
    creditLedger: _l,
    ownerSession: _s,
    ownerLoginFailures: _f,
    ...v2
  } = createSeedState();
  const lama = { id: "v2", name: "Lama" };
  // Bentuk v2 asli, dan bentuk lengkap tetapi bertanda versi 2.
  for (const stored of [v2, createSeedState()]) {
    localStorage.setItem(
      "mock.db",
      JSON.stringify({ ...stored, version: 2, store: lama }),
    );
    __resetMockDbCacheForTests();
    const s = mockDb.get();
    expect(s.version).toBe(3);
    expect(s.store.name).toBe("ShaziaMart");
    expect(Object.keys(s.unitCosts).length).toBeGreaterThan(0);
  }
});

test.each(["unitCosts", "minStock", "creditLedger", "ownerLoginFailures"])(
  "v3 tanpa %s → reseed",
  (key) => {
    const stored: Record<string, unknown> = {
      ...createSeedState(),
      store: { id: "abc", name: "Toko Lain" },
    };
    delete stored[key];
    localStorage.setItem("mock.db", JSON.stringify(stored));
    __resetMockDbCacheForTests();
    expect(mockDb.get().store.name).toBe("ShaziaMart");
  },
);
