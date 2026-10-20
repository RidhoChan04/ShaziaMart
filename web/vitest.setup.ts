import "@testing-library/jest-dom/vitest";
import { cleanup, configure } from "@testing-library/react";
import { afterAll, afterEach, beforeAll, vi } from "vitest";
import { __resetMockDbCacheForTests } from "@/mocks/db";
import { __resetSalesScenarioForTests } from "@/mocks/handlers/sales";
import { server } from "@/mocks/node";

// jsdom tidak mengimplementasikan scrollTo; stub agar keluaran tes bersih.
window.scrollTo = (() => {}) as typeof window.scrollTo;

// Rute lazy bisa lebih lambat dari 1 dtk default pada CI dingin.
configure({ asyncUtilTimeout: 3000 });

beforeAll(() => {
  server.listen({ onUnhandledRequest: "error" });
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  server.resetHandlers();
  localStorage.clear();
  history.replaceState(null, "", "/");
  __resetMockDbCacheForTests();
  __resetSalesScenarioForTests();
});

afterAll(() => {
  server.close();
});
