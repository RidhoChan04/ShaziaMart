/// <reference lib="dom" />
import type { Page } from "@playwright/test";
import { expect } from "./fixtures.ts";

export type MockProductInfo = {
  id: string;
  name: string;
  stock: number;
  cost: { amount: number; qtyBase: number } | null;
};

/** Barang dari state mock di localStorage (`mock.db`): stok sistem dan HPP, hanya untuk menyiapkan skenario. */
export async function mockProduct(
  page: Page,
  name: string,
): Promise<MockProductInfo> {
  const found = await page.evaluate((n) => {
    const state = JSON.parse(localStorage.getItem("mock.db") ?? "null") as {
      products: {
        id: string;
        name: string;
        cost: { amount: number; qtyBase: number } | null;
      }[];
      stock: Record<string, number>;
    } | null;
    const p = state?.products.find((x) => x.name === n);
    if (!state || !p) return null;
    return {
      id: p.id,
      name: p.name,
      stock: state.stock[p.id] ?? 0,
      cost: p.cost,
    };
  }, name);
  if (!found) throw new Error(`Barang ${name} tidak ada di state mock`);
  return found;
}

/** Stok sistem sekarang (satuan dasar) dan jumlah entri ledger `kind` untuk satu barang. */
export async function mockStockState(
  page: Page,
  productId: string,
  kind: string,
): Promise<{ stock: number; entries: number }> {
  return page.evaluate(
    ([id, k]) => {
      const state = JSON.parse(localStorage.getItem("mock.db") ?? "{}") as {
        stock: Record<string, number>;
        stockEntries: { productId: string; kind: string }[];
      };
      return {
        stock: state.stock[id ?? ""] ?? 0,
        entries: state.stockEntries.filter(
          (e) => e.productId === id && e.kind === k,
        ).length,
      };
    },
    [productId, kind] as const,
  );
}

/**
 * Jumlah hitungan yang membuat selisih bernilai > Rp100.000 (ditahan): kurangi stok bila cukup,
 * kalau tidak lebihkan. Mengembalikan jumlah hitungan dan selisih bertanda.
 */
export function heldCount(p: MockProductInfo): { count: number; diff: number } {
  const cost = p.cost;
  if (!cost) throw new Error(`${p.name} tanpa HPP`);
  const need = Math.floor((100_000 * cost.qtyBase) / cost.amount) + 3;
  return p.stock >= need
    ? { count: p.stock - need, diff: -need }
    : { count: p.stock + need, diff: need };
}

/** Buka tab Opname staf. */
export async function openOpnameTab(page: Page) {
  await page
    .getByRole("navigation", { name: "Navigasi orang toko" })
    .getByRole("link", { name: "Opname" })
    .click();
  await expect(page.getByText("Satu rak, 15–30 menit.")).toBeVisible();
}

/** Mulai hitung kategori `Mi Instan` dari tab Opname; menunggu layar menghitung. */
export async function startMiInstan(page: Page) {
  await page.getByRole("button", { name: /^Mi Instan/ }).click();
  await expect(
    page.getByRole("heading", { name: "Mi Instan", level: 1 }),
  ).toBeVisible();
}

/** Buka barang dari daftar `Belum dihitung`, isi pcs, simpan. */
export async function countProduct(page: Page, name: string, qty: number) {
  const card = page.getByRole("region", { name: "Sedang dihitung" });
  // Barang berikutnya terbuka otomatis setelah simpan; hanya ketuk bila yang terbuka barang lain.
  if (!(await card.getByRole("heading", { name }).isVisible())) {
    await page.getByRole("button", { name, exact: true }).click();
  }
  await expect(card.getByRole("heading", { name })).toBeVisible();
  await card.getByRole("textbox", { name: "Jumlah Pcs" }).fill(String(qty));
  await page
    .getByRole("button", { name: "Simpan, lanjut barang berikutnya" })
    .click();
  await expect(
    page.getByRole("region", { name: /^Sudah dihitung/ }),
  ).toContainText(name);
}

/** `Selesai menghitung` lalu konfirmasi `Selesai sekarang?` (barang lain belum dihitung). */
export async function finishCounting(page: Page) {
  await page.getByRole("button", { name: "Selesai menghitung" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Selesai sekarang?" });
  await dialog.getByRole("button", { name: "Selesai menghitung" }).click();
}
