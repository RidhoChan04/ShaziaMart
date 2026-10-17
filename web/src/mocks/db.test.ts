import { expect, test } from "vitest";
import { mockDb } from "./db";
import { rng } from "./seed";

test("mockDb persist dan reset", () => {
  mockDb.update((s) => {
    s.store.name = "X";
  });
  expect(JSON.parse(localStorage.getItem("mock.db") ?? "{}").store.name).toBe(
    "X",
  );
  mockDb.reset();
  expect(mockDb.get().store.name).toBe("ShaziaMart");
});

test("JSON rusak di localStorage -> default tanpa melempar", () => {
  localStorage.setItem("mock.db", "{bukan json");
  expect(mockDb.get().store.name).toBe("ShaziaMart");
});

test("JSON bentuk valid di localStorage dimuat lazy", () => {
  localStorage.setItem(
    "mock.db",
    JSON.stringify({ store: { id: "abc", name: "Toko Lain" } }),
  );
  expect(mockDb.get().store).toEqual({ id: "abc", name: "Toko Lain" });
});

test("JSON bentuk salah -> default", () => {
  localStorage.setItem("mock.db", JSON.stringify({ store: 1 }));
  expect(mockDb.get().store.name).toBe("ShaziaMart");
});

test("rng deterministik", () => {
  const a = rng(20261017);
  const b = rng(20261017);
  expect([a(), a(), a()]).toEqual([b(), b(), b()]);
});
