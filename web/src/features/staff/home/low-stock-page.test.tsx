import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test } from "vitest";
import { mockDb } from "@/mocks/db";
import { get, json, staffLogin } from "@/mocks/handlers/test-helpers";
import type { StaffLowStockItem } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { renderApp } from "@/test/render-app";

beforeEach(async () => {
  await staffLogin("Rina");
});

test("judul Stok menipis, semua baris dengan Batas dan Menipis, tanpa Sisa/Rp; Beranda kembali", async () => {
  const user = userEvent.setup();
  const items = await json<StaffLowStockItem[]>(
    await get("/api/staff/low-stock"),
  );
  expect(items.length).toBeGreaterThan(0);
  const { router } = renderApp("/staff/menipis");
  expect(
    await screen.findByRole("heading", { level: 1, name: "Stok menipis" }),
  ).toBeVisible();
  await screen.findByText(items[0]?.productName ?? "?");
  const rows = within(screen.getByRole("main")).getAllByRole("listitem");
  expect(rows).toHaveLength(items.length);
  expect(rows[0]).toHaveTextContent(items[0]?.productName ?? "?");
  expect(rows[0]).toHaveTextContent("Batas 10 pcs");
  expect(within(rows[0] as HTMLElement).getByText("Menipis")).toBeVisible();
  const text = document.body.textContent ?? "";
  expect(text).not.toMatch(/Sisa/);
  expect(text).not.toMatch(/Rp/);
  await user.click(
    within(screen.getByRole("main")).getByRole("link", { name: "Beranda" }),
  );
  expect(router.state.location.pathname).toBe("/staff");
});

test("kosong: Tidak ada barang menipis", async () => {
  mockDb.update((s) => {
    s.minStock = {};
  });
  renderApp("/staff/menipis");
  expect(await screen.findByText("Tidak ada barang menipis")).toBeVisible();
});
