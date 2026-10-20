import type { Page } from "@playwright/test";
import { expect } from "./fixtures.ts";

/**
 * Kosongkan localStorage (state mock & keranjang) sekali di awal tiap test,
 * sebelum navigasi pertama; muat ulang halaman tidak mengosongkannya lagi.
 */
export async function resetMock(page: Page) {
  await page.addInitScript(() => {
    if (sessionStorage.getItem("e2e.reset") === "1") return;
    localStorage.clear();
    sessionStorage.setItem("e2e.reset", "1");
  });
}

/** Ketik PIN dengan jeda ≥ 60 ms per digit (lebih cepat dianggap pemindai). */
export async function typePin(page: Page, pin: string) {
  await page.keyboard.type(pin, { delay: 80 });
}

export function scanBox(page: Page) {
  return page.getByLabel("Scan barcode / ketik nama atau kode");
}

/** Buka /kasir lalu buka shift: pilih kasir, PIN, modal awal. */
export async function openShift(
  page: Page,
  opts: { kasir: string; pin: string; opening: string; path?: string },
) {
  await resetMock(page);
  await page.goto(opts.path ?? "/kasir");
  await page.getByRole("button", { name: opts.kasir }).click();
  await typePin(page, opts.pin);
  await page
    .getByRole("textbox", { name: "Modal awal di laci" })
    .fill(opts.opening);
  await page.getByRole("button", { name: "Buka shift" }).click();
  await expect(scanBox(page)).toBeVisible();
}

/** Pemindai: ketikan sangat cepat lalu Enter, fokus di kotak scan. */
export async function scan(page: Page, code: string) {
  await scanBox(page).focus();
  await page.keyboard.type(code, { delay: 5 });
  await page.keyboard.press("Enter");
}

/** Barang curah lewat tombol cepat + jendela curah (berat dalam kg, mis. "1,5"). */
export async function addCurah(page: Page, opts: { name: string; kg: string }) {
  await page.getByRole("button", { name: `${opts.name} curah` }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("textbox", { name: "Berat (kg)" }).fill(opts.kg);
  await dialog.getByRole("button", { name: "Masukkan" }).click();
  await expect(dialog).toBeHidden();
}
