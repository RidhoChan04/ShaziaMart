import { screen, within } from "@testing-library/react";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { ownerLogin } from "@/mocks/handlers/test-helpers";
import { renderApp } from "@/test/render-app";
import { DEBT_NOW, seedDebts } from "@/test/seed-debts";

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(DEBT_NOW);
  await seedDebts();
  await ownerLogin();
});

afterEach(() => vi.useRealTimers());

test("Lainnya: 'Barang masuk' menaut ke daftar nota, 'Utang supplier' dengan total belum dibayar, tombol 'Keluar'", async () => {
  renderApp("/owner/lainnya");
  const link = await screen.findByRole("link", { name: /Utang supplier/ });
  expect(link).toHaveAttribute("href", "/owner/lainnya/utang");
  expect(await within(link).findByText("Rp4.087.000")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Barang masuk" })).toHaveAttribute(
    "href",
    "/owner/lainnya/barang-masuk",
  );
  expect(screen.queryByText("Segera hadir")).toBeNull();
  expect(screen.getByRole("button", { name: "Keluar" })).toBeEnabled();
});

test("tanpa utang belum lunas: baris 'Utang supplier' tanpa total", async () => {
  const { mockDb } = await import("@/mocks/db");
  mockDb.update((s) => {
    s.receipts = [];
  });
  renderApp("/owner/lainnya");
  const link = await screen.findByRole("link", { name: /Utang supplier/ });
  expect(link).not.toHaveTextContent("Rp");
});
