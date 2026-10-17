import "@testing-library/jest-dom/vitest";
import { cleanup } from "@testing-library/react";
import { afterAll, afterEach, beforeAll } from "vitest";
import { __resetMockDbCacheForTests } from "@/mocks/db";
import { server } from "@/mocks/node";

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  cleanup();
  server.resetHandlers();
  localStorage.clear();
  history.replaceState(null, "", "/");
  __resetMockDbCacheForTests();
});

afterAll(() => {
  server.close();
});
