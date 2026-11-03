import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockDb } from "@/mocks/db";
import { ownerLogin } from "@/mocks/handlers/test-helpers";
import { renderApp } from "@/test/render-app";
import { RECEIPT_NOW, seedReceipt } from "@/test/seed-receipts";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(RECEIPT_NOW);
});

afterEach(() => vi.useRealTimers());

test("daftar barang masuk: 'CV Sumber Rejeki' / '2 Nov 2026 · 3 barang · Rina' / 'Rp1.442.000', tanpa tanda untuk nota yang sudah dibayar", async () => {
  await seedReceipt();
  await ownerLogin();
  renderApp("/owner/lainnya/barang-masuk");
  expect(
    await screen.findByRole("heading", { level: 1, name: "Barang masuk" }),
  ).toBeInTheDocument();
  const row = await screen.findByRole("link", { name: /CV Sumber Rejeki/ });
  expect(row).toHaveAttribute("href", "/owner/lainnya/barang-masuk/draf-1");
  const r = within(row);
  expect(r.getByText("2 Nov 2026 · 3 barang · Rina")).toBeInTheDocument();
  expect(r.getByText("Rp1.442.000")).toBeInTheDocument();
  expect(r.queryByText("Belum lunas")).toBeNull();
  expect(r.queryByText("Dibatalkan")).toBeNull();
  expect(
    within(screen.getByRole("main")).getByRole("link", { name: /Lainnya/ }),
  ).toHaveAttribute("href", "/owner/lainnya");
});

test("nota 'Bayar nanti' belum lunas bertanda 'Belum lunas'", async () => {
  await seedReceipt();
  mockDb.update((s) => {
    const r = s.receipts[0];
    if (r) {
      r.payment = {
        timing: "nanti",
        method: null,
        cashSource: null,
        dueDate: "2026-11-16",
      };
    }
  });
  await ownerLogin();
  renderApp("/owner/lainnya/barang-masuk");
  const row = await screen.findByRole("link", { name: /CV Sumber Rejeki/ });
  expect(within(row).getByText("Belum lunas")).toBeInTheDocument();
});

test("nota dibatalkan bertanda 'Dibatalkan'", async () => {
  await seedReceipt();
  mockDb.update((s) => {
    const r = s.receipts[0];
    if (r) r.status = "dibatalkan";
  });
  await ownerLogin();
  renderApp("/owner/lainnya/barang-masuk");
  const row = await screen.findByRole("link", { name: /CV Sumber Rejeki/ });
  expect(within(row).getByText("Dibatalkan")).toBeInTheDocument();
});

test("tanpa nota: 'Belum ada barang masuk'", async () => {
  await ownerLogin();
  renderApp("/owner/lainnya/barang-masuk");
  expect(await screen.findByText("Belum ada barang masuk")).toBeInTheDocument();
});
