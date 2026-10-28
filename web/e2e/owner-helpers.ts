import type { Page } from "@playwright/test";
import { expect } from "./fixtures.ts";

/** Isi layar Masuk pemilik sebagai Pak Ahmad lalu tekan Masuk. */
export async function fillOwnerLogin(page: Page, password: string) {
  await page.getByLabel("Nama").fill("Pak Ahmad");
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Masuk" }).click();
}

/** Buka `path` di aplikasi pemilik lalu login sebagai Pak Ahmad. */
export async function loginOwner(page: Page, path = "/owner") {
  await page.goto(path);
  await fillOwnerLogin(page, "pemilik123");
  await expect(
    page.getByRole("navigation", { name: "Navigasi utama" }),
  ).toBeVisible();
}
