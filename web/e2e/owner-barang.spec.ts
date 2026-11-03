/// <reference lib="dom" />
import type { Page } from "@playwright/test";
import { expect, expectNoA11yViolations, test } from "./fixtures.ts";
import { openShift } from "./kasir-helpers.ts";
import { loginOwner, scanCode, stubBarcodeCamera } from "./owner-helpers.ts";

const TEMPLATE_FIXTURE = "src/test/fixtures/data-barang-contoh.xlsx";
const BIMOLI_BARCODE = "8992696404441";
const SCANNED_BARCODE = "8996001600269";

test.beforeEach(({ page: _page }, info) => {
  test.skip(!info.project.name.startsWith("owner-"), "hanya project owner");
});

/** Tidak ada gulir horizontal pada dokumen. */
async function expectNoHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - window.innerWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

/** Daftar Barang, dicari dengan `query`, lalu buka barang pertama yang cocok. */
async function openProduct(page: Page, name: string) {
  await loginOwner(page, "/owner/barang");
  await page
    .getByRole("searchbox", { name: "Cari nama atau barcode" })
    .fill(name);
  await page.getByRole("link", { name }).first().click();
  await expect(page.getByRole("heading", { name, level: 1 })).toBeVisible();
}

/** Elemen angka/teks tidak terpotong: isinya muat tanpa "…" (ditunggu sampai ukuran huruf selesai menyesuaikan). */
async function expectNotClipped(locator: ReturnType<Page["locator"]>) {
  await expect(locator).toBeVisible();
  await expect
    .poll(() =>
      locator.evaluate((el) => ({
        overflowPx: el.scrollWidth - el.clientWidth,
        ellipsis:
          (el.textContent ?? "").includes("…") ||
          getComputedStyle(el).textOverflow === "ellipsis",
      })),
    )
    .toEqual({ overflowPx: 0, ellipsis: false });
}

/** Isian form 360px tidak menciut jadi garis: tiap `form input` minimal 64px. */
async function expectUsableInputs(page: Page) {
  const narrow = await page.locator("form input").evaluateAll((els) =>
    els
      .map((el) => ({
        id: el.id,
        width: Math.round(el.getBoundingClientRect().width),
      }))
      .filter((x) => x.width < 64),
  );
  expect(narrow).toEqual([]);
}

test("tambah barang dengan scan kamera: detail menghitung untung, daftar menandai stok belum dihitung", async ({
  page,
}) => {
  await stubBarcodeCamera(page);
  await loginOwner(page, "/owner/barang");
  await page.getByRole("link", { name: "Tambah barang" }).click();
  await expect(
    page.getByRole("heading", { name: "Barang baru" }),
  ).toBeVisible();

  await page.getByLabel("Nama", { exact: true }).fill("Teh Kotak Jasmine");
  await page.getByLabel("Kategori").fill("Minuman");
  await page.getByLabel("Dijual per").fill("pcs");

  await page
    .getByRole("button", { name: "Scan dengan kamera" })
    .first()
    .click();
  const scanner = page.getByRole("dialog", { name: "Scan barcode" });
  await expect(scanner).toBeVisible();
  await expect(scanner).toContainText("Barcode eceran");
  await scanCode(page, SCANNED_BARCODE);
  await expect(scanner).toBeHidden();
  await expect(page.getByLabel("Barcode").first()).toHaveValue(SCANNED_BARCODE);

  const eceran = page.getByRole("region", { name: "Eceran" });
  await eceran.getByLabel("Harga jual").fill("4000");
  const besar = page.getByRole("region", { name: /^Satuan besar/ });
  await besar.getByLabel("Satuan", { exact: true }).fill("dus");
  await besar.getByLabel("Isi").fill("24");
  await besar.getByLabel("Harga modal").fill("70000");
  await besar.getByLabel("Harga jual").fill("96000");
  await page.getByRole("button", { name: "Simpan" }).click();

  await expect(
    page.getByRole("heading", { name: "Teh Kotak Jasmine", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByText("Modal Rp2.917 · untung Rp1.083 (37% dari modal)"),
  ).toBeVisible();

  await page.getByRole("link", { name: "Barang", exact: true }).click();
  const row = page.getByRole("link", { name: /Teh Kotak Jasmine/ });
  await expect(row).toBeVisible();
  await expect(row).toContainText("Stok belum dihitung");
});

test("ubah modal dus Indomie: Beranda memberi tahu, harga saran dipakai, riwayat tercatat", async ({
  page,
}) => {
  await openProduct(page, "Indomie Goreng");
  await page.getByRole("link", { name: "Ubah" }).click();
  await expect(
    page.getByRole("heading", { name: "Ubah barang" }),
  ).toBeVisible();
  await page
    .getByRole("region", { name: /^Satuan besar/ })
    .getByLabel("Harga modal")
    .fill("108000");
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(
    page.getByRole("heading", { name: "Indomie Goreng", level: 1 }),
  ).toBeVisible();

  await page.goto("/owner");
  const item = page.getByRole("link", {
    name: /Harga modal Indomie Goreng naik Rp100/,
  });
  await expect(item).toBeVisible();
  await item.click();

  const sheet = page.getByRole("dialog", { name: "Harga modal naik" });
  await expect(sheet).toBeVisible();
  await expect(sheet).toContainText("Indomie Goreng");
  await sheet.getByRole("button", { name: "Pakai harga ini" }).click();
  await expect(sheet).toBeHidden();

  await expect(
    page.getByRole("heading", { name: "Indomie Goreng", level: 1 }),
  ).toBeVisible();
  await expect(
    page.getByText("Rp3.500", { exact: true }).first(),
  ).toBeVisible();
  await expect(page.getByText("Rp3.100 → Rp3.500")).toBeVisible();

  await page.goto("/owner");
  await expect(page.getByText("Omzet hari ini")).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Harga modal Indomie Goreng/ }),
  ).toHaveCount(0);
});

test("impor Excel dari file contoh lalu unduh template", async ({ page }) => {
  const readerRequests: string[] = [];
  page.on("request", (request) => {
    if (/\/read-xlsx-[^/]+\.js$/.test(request.url())) {
      readerRequests.push(request.url());
    }
  });
  await loginOwner(page, "/owner/barang");
  await page.getByRole("button", { name: "Menu lainnya" }).click();
  await page.getByRole("link", { name: "Impor dari Excel" }).click();
  await expect(
    page.getByRole("heading", { name: "Impor dari Excel" }),
  ).toBeVisible();

  // Pembaca xlsx adalah chunk malas: baru diminta setelah file dipilih.
  expect(readerRequests).toEqual([]);
  await page.locator("input[type=file]").setInputFiles(TEMPLATE_FIXTURE);
  await expect(page.getByText("data-barang-contoh.xlsx")).toBeVisible();
  await expect(page.getByText("3 baris siap")).toBeVisible();
  await expect(page.getByText("1 akan diperbarui")).toBeVisible();
  await expect(page.getByText("6 perlu diperbaiki")).toBeVisible();
  expect(readerRequests).toHaveLength(1);
  await page.getByRole("button", { name: "Impor 4 barang" }).click();

  await expect(page.getByText("3 barang baru, 1 diperbarui")).toBeVisible();
  await page
    .getByRole("searchbox", { name: "Cari nama atau barcode" })
    .fill("Gas Elpiji");
  await expect(
    page.getByRole("link", { name: /Gas Elpiji 3 kg/ }),
  ).toBeVisible();
});

test("unduh template Excel dari menu Barang", async ({ page }) => {
  await loginOwner(page, "/owner/barang");
  await page.getByRole("button", { name: "Menu lainnya" }).click();
  const download = page.waitForEvent("download");
  await page.getByRole("link", { name: "Unduh template Excel" }).click();
  expect((await download).suggestedFilename()).toBe("data-barang.xlsx");
});

test("barang nonaktif hilang dari pencarian dan scan kasir (tab kasir, state sama)", async ({
  page,
  context,
}) => {
  await openProduct(page, "Bimoli");
  await page.getByRole("button", { name: /Status barang/ }).click();
  const sheet = page.getByRole("dialog", { name: "Status barang" });
  await sheet.getByRole("radio", { name: /Nonaktif/ }).check();
  await sheet.getByRole("button", { name: "Simpan status" }).click();
  await expect(sheet).toBeHidden();

  // Tab kasir memakai localStorage yang sama: jangan panggil resetMock.
  const kasir = await context.newPage();
  await kasir.goto("/kasir");
  await kasir.getByRole("button", { name: "Rina" }).click();
  await kasir.keyboard.type("123456", { delay: 80 });
  await kasir
    .getByRole("textbox", { name: "Modal awal di laci" })
    .fill("200.000");
  await kasir.getByRole("button", { name: "Buka shift" }).click();
  const box = kasir.getByLabel("Scan barcode / ketik nama atau kode");
  await expect(box).toBeVisible();

  await box.focus();
  await kasir.keyboard.type(BIMOLI_BARCODE, { delay: 5 });
  await kasir.keyboard.press("Enter");
  await expect(kasir.getByText("Barang ini tidak dijual lagi")).toBeVisible();

  await box.fill("bimoli");
  await expect(kasir.getByText("Tidak ada hasil")).toBeVisible();
});

test("360px: tile laba kotor besar dan kartu harga tidak terpotong atau meluber", async ({
  page,
  context,
}, info) => {
  test.skip(info.project.name !== "owner-hp", "pemeriksaan lebar 360px");
  expect(page.viewportSize()?.width).toBe(360);

  // Penjualan besar lewat API mock di tab kasir (state localStorage dipakai bersama).
  const kasir = await context.newPage();
  await openShift(kasir, { kasir: "Rina", pin: "123456", opening: "200.000" });
  const status = await kasir.evaluate(async () => {
    const found = await fetch("/api/catalog/lookup?code=189686010944");
    const match = (await found.json()) as { unitId: string };
    const sale = await fetch("/api/sales", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        saleId: "e2e-penjualan-besar",
        items: [
          {
            unitId: match.unitId,
            qtyBase: 2000 * 40,
            expectedUnitPrice: 112000,
          },
        ],
        payments: [{ method: "cash", amount: 224000000 }],
        cashReceived: 224000000,
        print: false,
      }),
    });
    return sale.status;
  });
  expect(status).toBe(201);
  await kasir.close();

  await loginOwner(page);
  const laba = page.getByText("Laba kotor", { exact: true }).locator("..");
  await expect(laba).toContainText("Rp16");
  await expectNotClipped(laba.getByText(/^Rp[\d.]+$/));
  await expectNoHorizontalScroll(page);

  await page.goto("/owner/barang");
  await expect(
    page.getByRole("link", { name: /Indomie Goreng/ }),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);

  await page
    .getByRole("searchbox", { name: "Cari nama atau barcode" })
    .fill("Indomie Goreng");
  await page
    .getByRole("link", { name: /Indomie Goreng/ })
    .first()
    .click();
  const prices = page.getByRole("region", { name: "Harga", exact: true });
  await expect(prices).toBeVisible();
  for (const amount of await prices.getByText(/^Rp[\d.]+$/).all()) {
    await expectNotClipped(amount);
  }
  await expectNoHorizontalScroll(page);

  await page.getByRole("link", { name: "Ubah" }).click();
  await expect(
    page.getByRole("heading", { name: "Ubah barang" }),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectUsableInputs(page);

  await page.goto("/owner/barang/impor");
  await expect(
    page.getByRole("heading", { name: "Impor dari Excel" }),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.locator("input[type=file]").setInputFiles(TEMPLATE_FIXTURE);
  await expect(
    page.getByRole("button", { name: "Impor 4 barang" }),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("aksesibilitas daftar Barang dan menu lainnya", async ({ page }) => {
  await loginOwner(page, "/owner/barang");
  await expect(
    page.getByRole("link", { name: /Indomie Goreng/ }).first(),
  ).toBeVisible();
  await expectNoA11yViolations(page);

  await page.getByRole("button", { name: "Menu lainnya" }).click();
  await expect(page.getByRole("dialog")).toHaveCSS("opacity", "1");
  await expectNoA11yViolations(page);
});

test("aksesibilitas detail barang", async ({ page }) => {
  await openProduct(page, "Indomie Goreng");
  await expectNoA11yViolations(page);
});

test("aksesibilitas form ubah barang dan layar scan", async ({ page }) => {
  await stubBarcodeCamera(page);
  await openProduct(page, "Indomie Goreng");
  await page.getByRole("link", { name: "Ubah" }).click();
  await expect(
    page.getByRole("heading", { name: "Ubah barang" }),
  ).toBeVisible();
  await expectNoA11yViolations(page);

  await page
    .getByRole("button", { name: "Scan dengan kamera" })
    .first()
    .click();
  const scanner = page.getByRole("dialog", { name: "Scan barcode" });
  await expect(scanner).toBeVisible();
  await expect(scanner).toContainText("Arahkan kamera ke barcode");
  await expectNoA11yViolations(page);
});

test("aksesibilitas lembar harga modal", async ({ page }) => {
  await openProduct(page, "Indomie Goreng");
  await page.getByRole("link", { name: "Ubah" }).click();
  await page
    .getByRole("region", { name: /^Satuan besar/ })
    .getByLabel("Harga modal")
    .fill("108000");
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(
    page.getByRole("heading", { name: "Indomie Goreng", level: 1 }),
  ).toBeVisible();
  await page.goto("/owner");
  await page
    .getByRole("link", { name: /Harga modal Indomie Goreng naik/ })
    .click();
  const sheet = page.getByRole("dialog", { name: "Harga modal naik" });
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveCSS("opacity", "1");
  await expectNoA11yViolations(page);
});

test("aksesibilitas impor Excel: pilih file dan pratinjau", async ({
  page,
}) => {
  await loginOwner(page, "/owner/barang/impor");
  await expect(
    page.getByRole("heading", { name: "Impor dari Excel" }),
  ).toBeVisible();
  await expectNoA11yViolations(page);
  await page.locator("input[type=file]").setInputFiles(TEMPLATE_FIXTURE);
  await expect(
    page.getByRole("button", { name: "Impor 4 barang" }),
  ).toBeVisible();
  await expectNoA11yViolations(page);
});
