/// <reference lib="dom" />
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

/**
 * Kamera palsu untuk layar scan: `BarcodeDetector` yang selalu membaca `code`, dan
 * `getUserMedia` yang mengembalikan aliran dari `canvas.captureStream()`.
 * `code` null = kamera tidak menemukan apa pun (layar scan tetap terbuka).
 * Dipasang sebelum halaman dimuat, jadi panggil sebelum `page.goto`.
 */
export async function stubBarcodeCamera(page: Page, code: string | null) {
  await page.addInitScript((value) => {
    class FakeBarcodeDetector {
      static getSupportedFormats() {
        return Promise.resolve(["ean_13", "ean_8", "upc_a", "itf"]);
      }
      detect() {
        return Promise.resolve(value === null ? [] : [{ rawValue: value }]);
      }
    }
    Object.defineProperty(window, "BarcodeDetector", {
      configurable: true,
      value: FakeBarcodeDetector,
    });
    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 48;
    canvas.getContext("2d")?.fillRect(0, 0, 64, 48);
    Object.defineProperty(navigator, "mediaDevices", {
      configurable: true,
      value: { getUserMedia: () => Promise.resolve(canvas.captureStream()) },
    });
  }, code);
}
