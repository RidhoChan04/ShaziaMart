import type { Page } from "@playwright/test";
import { expect, expectNoA11yViolations, test } from "./fixtures.ts";
import { loginOwner, scanCode, stubBarcodeCamera } from "./owner-helpers.ts";
import {
  addLine,
  expectNoHorizontalScroll,
  fakePhotoFile,
  fillReceipt,
  goOffline,
  goOnline,
  INDOMIE_BARCODE,
  installNetworkSwitches,
  loginStaff,
  NEW_PRODUCT,
  NEW_PRODUCT_BARCODE,
  payAndSave,
} from "./staff-helpers.ts";

test.beforeEach(({ page: _page }, info) => {
  test.skip(info.project.name !== "owner-hp", "app orang toko = HP 360 px");
});

test("login staf, kerangka, dan layar tanpa gulir horizontal serta pelanggaran aksesibilitas", async ({
  page,
}) => {
  await page.goto("/staff");
  await expect(
    page.getByRole("heading", { name: "ShaziaMart · Stok" }),
  ).toBeVisible();
  await expect(
    page.getByText("Hanya bisa dipakai di Wi-Fi toko"),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectNoA11yViolations(page);

  await loginStaff(page);
  await expect(page.getByRole("heading", { name: "Stok" })).toBeVisible();
  await expect(page.getByText("Catat nota supplier")).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectNoA11yViolations(page);

  const nav = page.getByRole("navigation", { name: "Navigasi orang toko" });
  await nav.getByRole("link", { name: "Masuk" }).click();
  await expect(page.getByText("Belum ada barang masuk")).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectNoA11yViolations(page);

  await nav.getByRole("link", { name: "Lainnya" }).click();
  await expect(page.getByText("Masuk sebagai Rina")).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectNoA11yViolations(page);
});

/** Isi nota (supplier, foto, 3 baris) sampai total Rp1.442.000; baris pertama lewat kamera palsu. */
async function fillNota(page: Page) {
  await page.getByLabel("Supplier").fill("Sumber Pangan Jaya");
  await page
    .locator("input[type=file]")
    .setInputFiles(await fakePhotoFile(page));
  await expect(page.getByText("1 lembar")).toBeVisible();
  const caption = await page.getByText(/Diambil .+ KB/).textContent();
  expect(Number(/(\d+) KB/.exec(caption ?? "")?.[1])).toBeLessThanOrEqual(300);

  await page.getByRole("button", { name: "Tambah barang" }).click();
  const sheet = page.getByRole("dialog", { name: "Tambah barang" });
  await sheet
    .getByRole("button", { name: "Scan barcode dengan kamera" })
    .click();
  const scanner = page.getByRole("dialog", { name: "Scan barcode" });
  await expect(scanner).toBeVisible();
  await scanCode(page, INDOMIE_BARCODE);
  await expect(scanner).toBeHidden();
  await expect(sheet.getByText("Indomie Goreng")).toBeVisible();
  await sheet.getByLabel("Jumlah", { exact: true }).fill("10");
  await sheet.getByLabel(/^Harga beli/).fill("100000");
  await sheet.getByRole("button", { name: "Tambahkan ke nota" }).click();
  await expect(sheet).toBeHidden();

  await addLine(page, {
    search: "Bimoli",
    pick: "Minyak Goreng Bimoli 2 L",
    qty: 12,
    cost: "34000",
  });
  await addLine(page, {
    search: NEW_PRODUCT,
    qty: 2,
    cost: "17000",
    isNew: { sellUnit: "pcs", barcode: NEW_PRODUCT_BARCODE },
  });
  await expect(page.getByText("3 baris")).toBeVisible();
  await expect(page.getByText("Total berjalan").locator("..")).toContainText(
    "Rp1.442.000",
  );
}

test("nota baru: barang lama + baru, foto terkompres, tanpa shift laci nonaktif (R24), tersimpan di Terkirim", async ({
  page,
}) => {
  await stubBarcodeCamera(page);
  await loginStaff(page);
  await page.goto("/staff/masuk/baru");
  await page.getByRole("heading", { name: "Barang masuk" }).waitFor();
  await expectNoHorizontalScroll(page);
  await expectNoA11yViolations(page);
  await fillNota(page);
  await expectNoHorizontalScroll(page);
  await expectNoA11yViolations(page);

  await page.getByRole("button", { name: "Lanjut ke pembayaran" }).click();
  await expect(page.getByRole("heading", { name: "Pembayaran" })).toBeVisible();
  const laci = page.getByRole("radio", { name: "Dari laci kasir" });
  await expect(laci).toBeVisible();
  await expect(laci).toBeDisabled();
  await expect(page.getByText("Tidak ada shift buka")).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectNoA11yViolations(page);

  await page.getByRole("button", { name: "Simpan barang masuk" }).click();
  await expect(
    page.getByText(
      "Tidak ada shift kasir yang buka — pilih Uang pemilik atau Transfer",
    ),
  ).toBeVisible();
  await page
    .getByRole("radio", { name: "Uang pemilik" })
    .check({ force: true });
  await page.getByRole("button", { name: "Simpan barang masuk" }).click();

  await expect(page.getByText("Barang masuk tersimpan")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Terkirim", exact: true }),
  ).toBeVisible();
  const row = page.getByRole("button", { name: /Sumber Pangan Jaya/ });
  await expect(row).toContainText("3 barang");
  await expect(row).toContainText("Rp1.442.000");
  await expect(page.getByText("Belum terkirim")).toHaveCount(0);
  await expectNoHorizontalScroll(page);
  await expectNoA11yViolations(page);
});

test("offline: draf tersimpan di HP, bertahan lewat muat ulang (R27), terkirim otomatis saat tersambung", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await loginStaff(page, "Rina", "123456", "/staff/masuk/baru");
  await fillReceipt(page, {
    supplier: "Toko Grosir Mandiri",
    payment: "pemilik",
    lines: [
      { search: "Indomie", pick: "Indomie Goreng", qty: 1, cost: "100000" },
    ],
  });
  await page.getByRole("button", { name: "Lanjut ke pembayaran" }).click();
  await page
    .getByRole("radio", { name: "Uang pemilik" })
    .check({ force: true });

  await goOffline(page);
  await page.getByRole("button", { name: "Simpan barang masuk" }).click();
  await expect(
    page.getByText("Belum terkirim — dikirim otomatis saat tersambung"),
  ).toBeVisible();
  const draft = page.getByRole("button", { name: /Toko Grosir Mandiri/ });
  await expect(draft).toContainText("Belum terkirim");
  await expect(draft).toContainText("Rp100.000");

  // IndexedDB sungguhan: draf harus ada lagi setelah halaman dimuat ulang.
  await page.reload();
  const afterReload = page.getByRole("button", { name: /Toko Grosir Mandiri/ });
  await expect(afterReload).toContainText("Belum terkirim");
  await page
    .getByRole("navigation", { name: "Navigasi orang toko" })
    .getByRole("link", { name: "Beranda" })
    .click();
  await expect(page.getByText("Belum terkirim (1)")).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectNoA11yViolations(page);

  // Masih tertahan sebelum tersambung: tidak ada nota di sisi pemilik.
  const owner = await context.newPage();
  await loginOwner(owner, "/owner/lainnya/barang-masuk");
  await expect(owner.getByText("Toko Grosir Mandiri")).toHaveCount(0);

  // Event `online` memicu kirim saat itu juga (tanpa menunggu sync berkala 30 dtk).
  await goOnline(page);
  await page
    .getByRole("navigation", { name: "Navigasi orang toko" })
    .getByRole("link", { name: "Masuk" })
    .click();
  await expect(
    page.getByRole("heading", { name: "Terkirim", exact: true }),
  ).toBeVisible({ timeout: 10_000 });
  await expect(
    page.getByRole("button", { name: /Toko Grosir Mandiri/ }),
  ).not.toContainText("Belum terkirim");
  await expect(
    page.getByRole("heading", { name: "Belum terkirim", exact: true }),
  ).toHaveCount(0);

  // Terkirim tepat sekali.
  await owner.reload();
  await expect(owner.getByText("Toko Grosir Mandiri")).toHaveCount(1);
});

test("ubah nota: staf mengubah jumlah, pemilik melihat riwayat 'Diubah oleh Rina'", async ({
  page,
  context,
}) => {
  await loginStaff(page, "Rina", "123456", "/staff/masuk/baru");
  await fillReceipt(page, {
    supplier: "CV Berkah Abadi",
    payment: "pemilik",
    lines: [
      { search: "Indomie", pick: "Indomie Goreng", qty: 10, cost: "100000" },
      {
        search: "Bimoli",
        pick: "Minyak Goreng Bimoli 2 L",
        qty: 12,
        cost: "34000",
      },
    ],
  });
  await payAndSave(page, "pemilik");
  await expect(page.getByText("Barang masuk tersimpan")).toBeVisible();

  await page.getByRole("button", { name: /CV Berkah Abadi/ }).click();
  await expect(
    page.getByRole("heading", { name: "Barang masuk" }),
  ).toBeVisible();
  await page.getByRole("button", { name: /Indomie Goreng/ }).click();
  const sheet = page.getByRole("dialog", { name: "Ubah barang" });
  await expectNoHorizontalScroll(page);
  await expectNoA11yViolations(page);
  await sheet.getByLabel("Jumlah", { exact: true }).fill("8");
  await sheet.getByRole("button", { name: "Simpan baris" }).click();
  await expect(sheet).toBeHidden();
  await page.getByRole("button", { name: "Lanjut ke pembayaran" }).click();
  await page.getByRole("button", { name: "Simpan perubahan" }).click();
  await expect(page.getByText("Perubahan tersimpan")).toBeVisible();
  await expect(
    page.getByRole("button", { name: /CV Berkah Abadi/ }),
  ).toContainText("Rp1.208.000");

  const owner = await context.newPage();
  await loginOwner(owner, "/owner/lainnya/barang-masuk");
  await owner.getByRole("link", { name: /CV Berkah Abadi/ }).click();
  await expect(owner.getByText("Diubah oleh Rina")).toBeVisible();
  await expect(owner.getByText(/Indomie Goreng: jumlah/)).toBeVisible();
});

test("staf hanya memakai /api/staff: tanpa request owner/katalog/shift dan tanpa key terlarang di respons", async ({
  page,
}) => {
  const paths: string[] = [];
  const keys = new Set<string>();
  let inspected = 0;
  page.on("request", (r) => paths.push(new URL(r.url()).pathname));
  page.on("response", async (r) => {
    if (!new URL(r.url()).pathname.startsWith("/api/staff/")) return;
    if (!(r.headers()["content-type"] ?? "").includes("json")) return;
    try {
      const walk = (v: unknown) => {
        if (Array.isArray(v)) v.forEach(walk);
        else if (v && typeof v === "object") {
          for (const [k, x] of Object.entries(v)) {
            keys.add(k);
            walk(x);
          }
        }
      };
      walk(await r.json());
      inspected++;
    } catch {
      // respons tanpa body yang bisa dibaca (mis. dibatalkan saat pindah halaman)
    }
  });
  await loginStaff(page, "Rina", "123456", "/staff/masuk/baru");
  await fillReceipt(page, {
    supplier: "UD Maju Terus",
    payment: "pemilik",
    lines: [
      { search: "Indomie", pick: "Indomie Goreng", qty: 2, cost: "100000" },
    ],
  });
  await payAndSave(page, "pemilik");
  await expect(page.getByText("Barang masuk tersimpan")).toBeVisible();
  await page.getByRole("button", { name: /UD Maju Terus/ }).click();
  await expect(
    page.getByRole("button", { name: /Indomie Goreng/ }),
  ).toBeVisible();

  const api = paths.filter((p) => p.startsWith("/api/"));
  expect(api.length).toBeGreaterThan(0);
  expect(
    api.filter((p) => p !== "/api/health" && !p.startsWith("/api/staff/")),
  ).toEqual([]);
  for (const forbidden of ["/api/owner/", "/api/catalog", "/api/shifts"]) {
    expect(paths.filter((p) => p.startsWith(forbidden))).toEqual([]);
  }
  expect(inspected).toBeGreaterThan(3);
  for (const key of [
    "cost",
    "costAlert",
    "fromCost",
    "oldCost",
    "newCost",
    "price",
    "stock",
    "grossProfit",
  ]) {
    expect(keys.has(key), `key terlarang ${key} ada di respons staf`).toBe(
      false,
    );
  }
  expect(keys.has("unitCost")).toBe(true);
});

test("di luar Wi-Fi toko (header terowongan Cloudflare): login menolak dengan pesan Wi-Fi toko", async ({
  page,
}) => {
  await installNetworkSwitches(page, true);
  await page.goto("/staff");
  await expect(page.getByRole("alert")).toContainText(
    "Hanya bisa dipakai di Wi-Fi toko",
  );
  await expect(page.getByRole("button", { name: "Coba lagi" })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectNoA11yViolations(page);
});
