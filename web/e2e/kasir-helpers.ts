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

/**
 * Isi `Modal awal di laci` (terisi dari saran server; `fill` menimpanya). Bila angkanya berbeda
 * dari saran, isian `Alasan modal berbeda` muncul dan wajib diisi.
 */
export async function fillOpeningCash(page: Page, opening: string) {
  await page.getByRole("textbox", { name: "Modal awal di laci" }).fill(opening);
  const reason = page.getByRole("textbox", { name: "Alasan modal berbeda" });
  if (await reason.isVisible()) await reason.fill("Tes");
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
  await fillOpeningCash(page, opts.opening);
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

/** Buka lembar Pelunasan kasbon, pilih pelanggan, isi nominal; kembalikan dialognya. */
export async function startRepayment(
  page: Page,
  opts: { customer: string; amount: string },
) {
  await page.getByRole("button", { name: "Pelunasan kasbon" }).click();
  const dialog = page.getByRole("dialog", { name: "Pelunasan kasbon" });
  await expect(dialog).toBeVisible();
  await dialog.getByPlaceholder("Nama atau no. HP").fill(opts.customer);
  await dialog.getByRole("button", { name: new RegExp(opts.customer) }).click();
  await dialog.getByLabel("NOMINAL PELUNASAN").fill(opts.amount);
  return dialog;
}

/** Tutup shift dengan uang fisik `counted`; kembalikan dialog hasil (belum ditutup). */
export async function closeShift(page: Page, counted: string) {
  await page.getByRole("button", { name: "Tutup shift" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Uang fisik di laci").fill(counted);
  await dialog.getByRole("button", { name: "Tutup shift" }).click();
  await expect(dialog).toContainText("Uang seharusnya");
  return dialog;
}

/** Bayar tunai keranjang saat ini dengan uang pas `received`; menunggu dialog bayar tertutup. */
export async function payCash(page: Page, received: string) {
  await page
    .getByRole("complementary", { name: "Total" })
    .getByRole("button", { name: "Bayar" })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("UANG DITERIMA").fill(received);
  await dialog.getByRole("button", { name: "Selesai" }).click();
  await expect(dialog).toBeHidden();
}

/** Beras curah per nominal (Rp) lewat tombol cepat. */
export async function addBerasNominal(page: Page, nominal: string) {
  await page.getByRole("button", { name: "Beras curah" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Nominal (Rp)" }).click();
  await dialog.getByRole("textbox", { name: "Nominal (Rp)" }).fill(nominal);
  await dialog.getByRole("button", { name: "Masukkan" }).click();
  await expect(dialog).toBeHidden();
}

/**
 * Nomor struk terbaru di Riwayat shift ini; sheet dibiarkan terbuka. `exclude` = nomor yang sudah
 * diketahui: menunggu daftar dimuat ulang sampai nomor lain muncul di baris pertama.
 */
export async function firstSaleNumber(
  page: Page,
  exclude: string[] = [],
): Promise<string> {
  await page.getByRole("button", { name: "Riwayat" }).click();
  const first = page
    .getByRole("dialog", { name: "Riwayat shift ini" })
    .getByRole("button", { name: /^Cetak ulang \d{8}-\d+$/ })
    .first();
  await expect(first).toBeVisible();
  let number = "";
  await expect
    .poll(async () => {
      const label = (await first.getAttribute("aria-label")) ?? "";
      number = /(\d{8}-\d+)$/.exec(label)?.[1] ?? "";
      return number !== "" && !exclude.includes(number);
    })
    .toBe(true);
  return number;
}

/** Bayar QRIS keranjang saat ini (satu langkah `Sudah masuk`). */
export async function payQris(page: Page) {
  await page
    .getByRole("complementary", { name: "Total" })
    .getByRole("button", { name: "Bayar" })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "QRIS" }).click();
  await dialog.getByRole("button", { name: "Sudah masuk" }).click();
  await expect(dialog).toBeHidden();
}
