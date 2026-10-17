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

test("mockDb pulih dari JSON rusak", () => {
  localStorage.setItem("mock.db", "{bukan json");
  expect(mockDb.get().store.name).toBe("ShaziaMart");
});

test("rng deterministik", () => {
  const a = rng(20261017);
  const b = rng(20261017);
  expect([a(), a(), a()]).toEqual([b(), b(), b()]);
});
