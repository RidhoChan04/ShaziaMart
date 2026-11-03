/// <reference lib="dom" />
import type { BrowserContext, Page } from "@playwright/test";
import { expect } from "./fixtures.ts";
import { resetMock } from "./kasir-helpers.ts";

export const STAFF_VIEWPORT = { width: 360, height: 800 } as const;
export const INDOMIE_BARCODE = "089686010947";
export const NEW_PRODUCT = "Teh Pucuk Harum 350 ml";
export const NEW_PRODUCT_BARCODE = "8996001600269";

/** Buka /staff lalu masuk sebagai `name` dengan PIN; menunggu tab bar orang toko. */
export async function loginStaff(
  page: Page,
  name = "Rina",
  pin = "123456",
  path = "/staff",
  reset = true,
) {
  // Halaman kedua di konteks yang sama (reset=false) tidak boleh mengosongkan state mock bersama.
  if (reset) await resetMock(page);
  await installNetworkSwitches(page);
  await page.goto(path);
  await page.getByRole("button", { name, exact: true }).click();
  await page
    .getByRole("textbox", { name: "PIN" })
    .pressSequentially(pin, { delay: 80 });
  await expect(
    page.getByRole("navigation", { name: "Navigasi orang toko" }),
  ).toBeVisible();
}

/**
 * Saklar jaringan di sisi halaman (MSW jalan di service worker, jadi `setOffline` Playwright dan
 * `page.route` tidak menyentuhnya): bungkus `fetch` sebelum aplikasi dimuat.
 * - `e2e.offline=1` di localStorage: request tulis ke `/api/staff/` gagal seperti Wi-Fi putus
 *   (bacaan tetap jalan agar sesi tidak hilang; ini bertahan lewat muat ulang);
 * - `lan=true`: semua request `/api/staff/` membawa `Cf-Connecting-Ip` (seolah lewat terowongan).
 */
export async function installNetworkSwitches(page: Page, lan = false) {
  await page.addInitScript((viaTunnel) => {
    const original = window.fetch.bind(window);
    window.fetch = (input, init) => {
      const request = new Request(input, init);
      if (!new URL(request.url).pathname.startsWith("/api/staff/")) {
        return original(request);
      }
      const cut = localStorage.getItem("e2e.offline") === "1";
      if (cut && request.method !== "GET") {
        return Promise.reject(new TypeError("Failed to fetch"));
      }
      if (viaTunnel) request.headers.set("Cf-Connecting-Ip", "203.0.113.7");
      return original(request);
    };
  }, lan);
}

/** Wi-Fi putus: kirim nota gagal sampai `goOnline`. Bertahan lewat muat ulang. */
export async function goOffline(page: Page) {
  await page.evaluate(() => localStorage.setItem("e2e.offline", "1"));
}

/** Wi-Fi tersambung lagi; event `online` memicu kirim otomatis seperti di HP sungguhan. */
export async function goOnline(page: Page) {
  await page.evaluate(() => {
    localStorage.removeItem("e2e.offline");
    window.dispatchEvent(new Event("online"));
  });
}

/** Halaman HP orang toko baru (360×800) di konteks yang sama, tanpa mengosongkan state mock. */
export async function newStaffPage(context: BrowserContext): Promise<Page> {
  const page = await context.newPage();
  await page.setViewportSize(STAFF_VIEWPORT);
  return page;
}

/**
 * Foto nota palsu: JPEG 3000×4000 dari kanvas (blok warna acak + derau agar besar, ±beberapa MB),
 * dikembalikan sebagai payload `setInputFiles`.
 */
export async function fakePhotoFile(page: Page) {
  const base64 = await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 3000;
    canvas.height = 4000;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("kanvas tidak tersedia");
    let seed = 12345;
    const rand = () => {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 2 ** 32;
    };
    for (let y = 0; y < 4000; y += 8) {
      for (let x = 0; x < 3000; x += 8) {
        ctx.fillStyle = `rgb(${(rand() * 255) | 0},${(rand() * 255) | 0},${(rand() * 255) | 0})`;
        ctx.fillRect(x, y, 8, 8);
      }
    }
    const blob = await new Promise<Blob | null>((r) =>
      canvas.toBlob(r, "image/jpeg", 0.95),
    );
    if (!blob) throw new Error("toBlob gagal");
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let bin = "";
    for (let i = 0; i < bytes.length; i += 0x8000) {
      bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
    }
    return btoa(bin);
  });
  return {
    name: "nota.jpg",
    mimeType: "image/jpeg",
    buffer: Buffer.from(base64, "base64"),
  };
}

/** Tidak ada gulir horizontal pada dokumen. */
export async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth -
      document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

export type LineSpec = {
  /** Cari lewat nama, atau barang baru bila `isNew`. */
  search: string;
  /** Teks tombol hasil cari (nama barang). */
  pick?: string;
  unit?: string | RegExp;
  qty: number;
  cost: string;
  isNew?: { sellUnit: string; barcode?: string };
};

/** Tambah satu baris lewat lembar `Tambah barang`. */
export async function addLine(page: Page, line: LineSpec) {
  await page.getByRole("button", { name: "Tambah barang" }).click();
  const sheet = page.getByRole("dialog", { name: "Tambah barang" });
  await sheet.getByLabel("Cari nama atau barcode").fill(line.search);
  if (line.isNew) {
    await sheet
      .getByRole("button", { name: `Barang baru: ${line.search}` })
      .click();
    await sheet.getByLabel("Dijual per").fill(line.isNew.sellUnit);
    if (line.isNew.barcode) {
      await sheet
        .getByLabel("Barcode", { exact: true })
        .fill(line.isNew.barcode);
    }
  } else {
    await sheet
      .getByRole("button", { name: line.pick ?? line.search })
      .first()
      .click();
    if (line.unit) {
      await sheet
        .getByRole("radio", { name: line.unit })
        .check({ force: true });
    }
  }
  const qty = sheet.getByLabel("Jumlah", { exact: true });
  await qty.fill(String(line.qty));
  await sheet.getByLabel(/^Harga beli/).fill(line.cost);
  await sheet.getByRole("button", { name: "Tambahkan ke nota" }).click();
  await expect(sheet).toBeHidden();
}

export type PaymentSpec = "laci" | "pemilik" | "nanti";

export type ReceiptSpec = {
  supplier: string;
  lines: LineSpec[];
  payment: PaymentSpec;
  /** Lampirkan foto nota palsu. */
  photo?: boolean;
};

/** Isi supplier, foto opsional, dan baris di form `/staff/masuk/baru` (halaman sudah login). */
export async function fillReceipt(page: Page, spec: ReceiptSpec) {
  await page.getByLabel("Supplier").fill(spec.supplier);
  if (spec.photo) {
    await page
      .locator("input[type=file]")
      .setInputFiles(await fakePhotoFile(page));
    await expect(page.getByText("1 lembar")).toBeVisible();
  }
  for (const line of spec.lines) await addLine(page, line);
}

/** Pilih cara bayar di langkah pembayaran lalu tekan Simpan barang masuk. */
export async function payAndSave(
  page: Page,
  payment: PaymentSpec,
  { advance = true }: { advance?: boolean } = {},
) {
  if (advance) {
    await page.getByRole("button", { name: "Lanjut ke pembayaran" }).click();
  }
  await expect(page.getByRole("heading", { name: "Pembayaran" })).toBeVisible();
  if (payment === "nanti") {
    await page
      .getByRole("radio", { name: "Bayar nanti" })
      .check({ force: true });
    await page.getByRole("button", { name: "14 hari" }).click();
  } else {
    await page
      .getByRole("radio", {
        name: payment === "laci" ? "Dari laci kasir" : "Uang pemilik",
      })
      .check({ force: true });
  }
  await page.getByRole("button", { name: "Simpan barang masuk" }).click();
}

/**
 * Catat satu nota lewat app staf di halaman baru (360×800) pada konteks yang sama, lalu tutup
 * halamannya. Staf harus bisa masuk sebagai Rina; state mock dipakai bersama.
 */
export async function createReceiptAsStaff(
  context: BrowserContext,
  spec: ReceiptSpec,
  path = "/staff/masuk/baru",
) {
  const page = await newStaffPage(context);
  await loginStaff(page, "Rina", "123456", path, false);
  await fillReceipt(page, spec);
  await payAndSave(page, spec.payment);
  await expect(page.getByText("Barang masuk tersimpan")).toBeVisible();
  await expect(
    page.getByRole("button", { name: new RegExp(spec.supplier) }),
  ).toBeVisible();
  await page.close();
}
