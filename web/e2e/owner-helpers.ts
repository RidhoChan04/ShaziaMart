import type { Page } from "@playwright/test";
import { expect } from "./fixtures.ts";

/** Buka `path` di aplikasi pemilik lalu login sebagai Pak Ahmad. */
export async function loginOwner(page: Page, path = "/owner") {
  await page.goto(path);
  await page.getByLabel("Nama").fill("Pak Ahmad");
  await page.getByLabel("Password").fill("pemilik123");
  await page.getByRole("button", { name: "Masuk" }).click();
  await expect(
    page.getByRole("navigation", { name: "Navigasi utama" }),
  ).toBeVisible();
}
