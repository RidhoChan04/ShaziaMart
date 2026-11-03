import type { Page } from "@playwright/test";
import { expect, expectNoA11yViolations, test } from "./fixtures.ts";
import { openShift, scan, typePin } from "./kasir-helpers.ts";
import { fillOwnerLogin, loginOwner } from "./owner-helpers.ts";
import {
  createReceiptAsStaff,
  expectNoHorizontalScroll,
  NEW_PRODUCT,
  NEW_PRODUCT_BARCODE,
} from "./staff-helpers.ts";

const OFFLINE_DETECT_MS = 3 * 5_000; // 3× HEALTH_POLL_MS
const CHART_GROUP = { name: /Omzet per jam hari ini dan .+ lalu/ };

/** Gulir dokumen sampai paling bawah. */
async function scrollToBottom(page: Page) {
  await page.locator("html").evaluate((html) => {
    html.scrollTop = html.scrollHeight;
  });
}

test.beforeEach(({ page: _page }, info) => {
  test.skip(!info.project.name.startsWith("owner-"), "hanya project owner");
});

test("login salah menampilkan pesan dan tetap di halaman masuk", async ({
  page,
}) => {
  await page.goto("/owner");
  await fillOwnerLogin(page, "salah-total");
  await expect(page.getByText("Nama atau password salah")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Masuk pemilik" }),
  ).toBeVisible();
});

test("Beranda menampilkan omzet, grafik, empat tile, dan perlu perhatian", async ({
  page,
}) => {
  await loginOwner(page);
  await expect(page.getByText("Omzet hari ini")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Omzet per jam" }),
  ).toBeVisible();
  await expect(page.getByRole("group", CHART_GROUP)).toBeVisible();
  for (const tile of [
    "Laba kotor",
    "Transaksi",
    "Kasbon baru",
    "Rata-rata / struk",
  ]) {
    await expect(page.getByText(tile, { exact: true })).toBeVisible();
  }
  await expect(
    page.getByRole("heading", { name: "Perlu perhatian" }),
  ).toBeVisible();
  // Tanpa gulir horizontal (pita omzet, sumbu kanan, keterangan panjang).
  const scrollWidth = await page
    .locator("html")
    .evaluate((html) => html.scrollWidth);
  expect(scrollWidth).toBeLessThanOrEqual(page.viewportSize()?.width ?? 0);
});

test("ikon Perlu perhatian berglif putih di atas kotak berwarna", async ({
  page,
}) => {
  await loginOwner(page);
  const box = page
    .getByRole("region", { name: "Perlu perhatian" })
    .getByRole("listitem")
    .first()
    .locator("span[aria-hidden='true']")
    .first();
  await expect(box).toBeVisible();
  await expect(box).toHaveCSS("color", "rgb(255, 255, 255)");
});

test("butir terakhir Perlu perhatian bisa digulir penuh di atas tab bar", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "owner-hp", "tab bar bawah hanya di HP");
  await loginOwner(page);
  const items = page
    .getByRole("region", { name: "Perlu perhatian" })
    .getByRole("listitem");
  await expect(items.first()).toBeVisible();
  await scrollToBottom(page);
  const last = await items.last().boundingBox();
  const nav = await page
    .getByRole("navigation", { name: "Navigasi utama" })
    .boundingBox();
  if (!last || !nav) throw new Error("tanpa bounding box");
  expect(last.y + last.height).toBeLessThanOrEqual(nav.y);
});

test("HP: bar judul kecil muncul setelah judul besar tergulir lewat", async ({
  page,
}, info) => {
  test.skip(info.project.name !== "owner-hp", "bar judul kecil hanya di HP");
  await loginOwner(page);
  await expect(page.getByText("Omzet hari ini")).toBeVisible();
  const compact = page.getByTestId("compact-title");
  await expect(compact).toHaveCSS("opacity", "0");
  await scrollToBottom(page);
  await expect(compact).toHaveCSS("opacity", "1");
  await expect(compact).toHaveText("Beranda");
});

test("Tab sampai ke grup grafik: fokus terlihat", async ({ page }) => {
  await loginOwner(page);
  const group = page.getByRole("group", CHART_GROUP);
  await expect(group).toBeVisible();
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    if (await group.evaluate((el) => el === el.ownerDocument.activeElement))
      break;
  }
  await expect(group).toBeFocused();
  await expect(group).toHaveCSS("outline-style", "solid");
  // Panah memunculkan angka jam aktif.
  await page.keyboard.press("ArrowRight");
  await expect(page.getByTestId("chart-tooltip")).toBeVisible();
});

test("Beranda tanpa pelanggaran aksesibilitas serius", async ({ page }) => {
  await loginOwner(page);
  await expect(page.getByRole("group", CHART_GROUP)).toBeVisible();
  await expectNoA11yViolations(page);
});

test("server mati setelah data dimuat: banner offline, halaman tetap", async ({
  page,
}) => {
  await loginOwner(page);
  await expect(page.getByText("Omzet hari ini")).toBeVisible();
  await expect(page.getByText("Toko online")).toBeVisible();

  await page.evaluate(() =>
    localStorage.setItem("mock.skenario", "server-mati"),
  );

  // Pemeriksaan kesehatan berjalan tiap 5 detik; tunggu hasilnya, bukan jeda.
  await expect(
    page.getByText("Tidak terhubung ke toko — data terakhir ditampilkan"),
  ).toBeVisible({ timeout: OFFLINE_DETECT_MS });
  await expect(page.getByText("Toko offline")).toBeVisible();
  await expect(page.getByText("Omzet hari ini")).toBeVisible();
  await expect(page.getByRole("group", CHART_GROUP)).toBeVisible();
});

test("kasir login di tab lain tidak mengeluarkan pemilik", async ({
  page,
  context,
}) => {
  await loginOwner(page);
  await expect(page.getByText("Omzet hari ini")).toBeVisible();

  // Tanpa resetMock: state mock bersama (localStorage) harus tetap utuh.
  const kasirTab = await context.newPage();
  await kasirTab.goto("/kasir");
  await kasirTab.getByRole("button", { name: "Rina" }).click();
  await typePin(kasirTab, "123456");
  await expect(
    kasirTab.getByRole("textbox", { name: "Modal awal di laci" }),
  ).toBeVisible();
  await kasirTab.close();

  await expect(page.getByText("Omzet hari ini")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Masuk pemilik" }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("Omzet hari ini")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Masuk pemilik" }),
  ).toHaveCount(0);
});

const INDOMIE_LINE = {
  search: "Indomie",
  pick: "Indomie Goreng",
  qty: 1,
  cost: "100000",
} as const;

test("utang supplier: bayar nanti 14 hari, pemilik menandai lunas dari uang pemilik", async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await createReceiptAsStaff(context, {
    supplier: "PT Sinar Pangan",
    payment: "nanti",
    lines: [INDOMIE_LINE],
  });

  await loginOwner(page, "/owner/lainnya");
  await expect(page.getByText("Rp100.000").first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectNoA11yViolations(page);
  await page.getByRole("link", { name: /Utang supplier/ }).click();
  await expect(
    page.getByRole("heading", { name: "Utang supplier", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("Belum dibayar")).toBeVisible();
  await expect(page.getByText(/1 nota · 1 supplier/)).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectNoA11yViolations(page);

  await page.getByRole("link", { name: /Nota .*Rp100\.000/ }).click();
  await expect(
    page.getByRole("button", { name: "Tandai lunas" }),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectNoA11yViolations(page);
  await page.getByRole("button", { name: "Tandai lunas" }).click();
  const sheet = page.getByRole("dialog", { name: "Tandai lunas" });
  await expect(sheet).toBeVisible();
  await expect(sheet).toHaveCSS("opacity", "1");
  await expectNoHorizontalScroll(page);
  await expectNoA11yViolations(page);
  // Tanpa shift buka, "Uang dari" tidak tampil dan tunai tercatat sebagai uang pemilik.
  await expect(sheet.getByText("Uang dari")).toHaveCount(0);
  await sheet.getByRole("button", { name: "Tandai lunas" }).click();

  // R31: baris lunas = "Lunas {d Mmm yyyy}" (tanggal Jakarta saat dilunasi) / cara bayar.
  const settled = page.getByRole("region", { name: "Sudah lunas" });
  const paidRow = settled.getByRole("link", {
    name: /Lunas \d{1,2} [A-Z][a-z]{2} \d{4}/,
  });
  await expect(paidRow).toBeVisible();
  await expect(paidRow).toContainText("Tunai · Uang pemilik");
  await expectNoHorizontalScroll(page);
  await expectNoA11yViolations(page);
});

test("batalkan nota yang dibayar dari laci: teks uang laci (R28) lalu nota Dibatalkan", async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  const kasir = await context.newPage();
  await kasir.setViewportSize({ width: 1366, height: 768 });
  await openShift(kasir, { kasir: "Rina", pin: "123456", opening: "500.000" });

  await createReceiptAsStaff(context, {
    supplier: "Toko Grosir Mandiri",
    payment: "laci",
    lines: [INDOMIE_LINE],
  });

  await loginOwner(page, "/owner/lainnya/barang-masuk");
  await expectNoHorizontalScroll(page);
  await expectNoA11yViolations(page);
  await page.getByRole("link", { name: /Toko Grosir Mandiri/ }).click();
  await expect(page.getByText("Dicatat oleh Rina")).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectNoA11yViolations(page);

  await page.getByRole("button", { name: "Batalkan nota" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Batalkan nota ini?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS("opacity", "1");
  await expect(dialog).toContainText(
    "Uang Rp100.000 yang tadi keluar dari laci dicatat masuk lagi ke shift kasir yang sedang berjalan. Kalau tidak ada shift berjalan, uang ini tidak dicatat ulang — sesuaikan uang laci sendiri.",
  );
  await expectNoHorizontalScroll(page);
  await expectNoA11yViolations(page);
  await dialog.getByRole("button", { name: "Batalkan nota" }).click();

  await expect(page.getByText("Dibatalkan").first()).toBeVisible();
  await expect(page.getByText("Dibatalkan oleh Rina")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Batalkan nota" })).toHaveCount(
    0,
  );
  await page.goBack();
  await expect(
    page.getByRole("link", { name: /Toko Grosir Mandiri/ }),
  ).toContainText("Dibatalkan");
});

test("barang baru dari nota: butir Beranda, isi harga jual, lalu laku di kasir; harga modal naik lewat Barang masuk", async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  const kasir = await context.newPage();
  await kasir.setViewportSize({ width: 1366, height: 768 });
  await openShift(kasir, { kasir: "Rina", pin: "123456", opening: "200.000" });

  await createReceiptAsStaff(context, {
    supplier: "Sumber Pangan Jaya",
    payment: "pemilik",
    lines: [
      { ...INDOMIE_LINE, cost: "120000" },
      {
        search: NEW_PRODUCT,
        qty: 24,
        cost: "3000",
        isNew: { sellUnit: "pcs", barcode: NEW_PRODUCT_BARCODE },
      },
    ],
  });

  // Sebelum ada harga jual, kasir menolak barangnya.
  await scan(kasir, NEW_PRODUCT_BARCODE);
  await expect(kasir.getByText("Barang belum punya harga jual")).toBeVisible();

  await loginOwner(page, "/owner");
  const attention = page.getByRole("region", { name: "Perlu perhatian" });
  await expect(attention).toContainText("1 barang baru dari barang masuk");
  await expect(attention).toContainText("Lengkapi harga jual");
  await expect(attention).toContainText(
    /Harga modal Indomie Goreng naik Rp\d+/,
  );
  await expectNoHorizontalScroll(page);
  await expectNoA11yViolations(page);

  await attention
    .getByRole("link", { name: /Harga modal Indomie Goreng/ })
    .click();
  await expect(page.getByText(/lewat Barang masuk/).first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectNoA11yViolations(page);
  await page.goto("/owner");
  await page
    .getByRole("region", { name: "Perlu perhatian" })
    .getByRole("link", { name: /barang baru dari barang masuk/ })
    .click();
  await expect(page.getByText("Menunggu harga jual").first()).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectNoA11yViolations(page);

  await page.getByRole("link", { name: NEW_PRODUCT }).first().click();
  await expect(
    page.getByRole("heading", { name: NEW_PRODUCT, level: 1 }),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);
  await page.getByRole("link", { name: "Ubah" }).click();
  await expect(
    page.getByRole("heading", { name: "Ubah barang" }),
  ).toBeVisible();
  await expect(page.getByText("Mengikuti barang masuk").first()).toBeVisible();
  await page.getByLabel("Harga jual").first().fill("4500");
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(
    page.getByRole("heading", { name: NEW_PRODUCT, level: 1 }),
  ).toBeVisible();

  await scan(kasir, NEW_PRODUCT_BARCODE);
  await expect(
    kasir.getByRole("complementary", { name: "Total" }),
  ).toContainText("1 BARANG");
});
