import type { Page } from "@playwright/test";
import { expect, expectNoA11yViolations, test } from "./fixtures.ts";
import { loginOwner } from "./owner-helpers.ts";
import { expectNoHorizontalScroll, loginStaff } from "./staff-helpers.ts";

test.beforeEach(({ page: _page }, info) => {
  test.skip(info.project.name !== "owner-hp", "app orang toko = HP 360 px");
});

const ROTI = "Sari Roti Tawar";

async function fillSampleStock(page: Page) {
  await page.getByRole("button", { name: "Panel pengembang" }).click();
  await page.getByRole("button", { name: "Isi contoh stok" }).click();
  await page.getByRole("button", { name: "Panel pengembang" }).click();
}

async function openStaffExpiry(page: Page) {
  await page
    .getByRole("navigation", { name: "Navigasi orang toko" })
    .getByRole("link", { name: "Kedaluwarsa" })
    .click();
  await expect(
    page.getByText(
      "Jumlah adalah perkiraan: barang lama dianggap terjual lebih dulu.",
    ),
  ).toBeVisible();
}

test("kedaluwarsa: staf mengeluarkan 2 dari baris yang lewat, pemilik melihat log, nilai Rp, dan butir perhatian", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await loginStaff(page);
  await fillSampleStock(page);
  await openStaffExpiry(page);

  await expect(
    page.getByRole("heading", { name: /Sudah lewat/ }),
  ).toBeVisible();
  const row = page.getByRole("listitem").filter({ hasText: ROTI });
  await expect(row).toContainText("±3 bungkus");
  await expect(row).toContainText("Lewat 2 hari");
  await expectNoHorizontalScroll(page);
  await expectNoA11yViolations(page);

  await row.getByRole("button", { name: "Pilihan" }).click();
  const menu = page.getByRole("dialog", { name: ROTI });
  await expect(menu).toBeVisible();
  await expectNoA11yViolations(page);
  await menu.getByRole("button", { name: /Keluarkan dari stok/ }).click();

  const sheet = page.getByRole("dialog", { name: "Keluarkan dari stok" });
  await expect(
    sheet.getByText("Alasan: kedaluwarsa · tercatat atas nama Rina"),
  ).toBeVisible();
  await sheet.getByRole("textbox", { name: "Jumlah Bungkus" }).fill("2");
  await expectNoA11yViolations(page);
  await sheet.getByRole("button", { name: /^Keluarkan 2/ }).click();

  await expect(page.getByText(`2 ${ROTI} dikeluarkan`)).toBeVisible();
  await expect(page.getByText(`Rina mengeluarkan 2 ${ROTI}`)).toBeVisible();
  await expect(
    page
      .getByRole("listitem")
      .filter({ hasText: ROTI })
      .filter({ hasText: "±1 bungkus" }),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);

  const owner = await context.newPage();
  await loginOwner(owner, "/owner");
  const alert = owner.getByRole("link", { name: /Barang sudah kedaluwarsa/ });
  await expect(alert).toBeVisible();
  await expect(alert).toContainText("barang");

  await owner.goto("/owner/lainnya/kedaluwarsa");
  await expect(owner.getByText("Perkiraan kerugian")).toBeVisible();
  const log = owner.getByRole("listitem").filter({
    hasText: `Rina mengeluarkan 2 ${ROTI}`,
  });
  await expect(log).toBeVisible();
  await expect(log).toContainText(/Rp[\d.]+/);
  await expectNoHorizontalScroll(owner);
  await expectNoA11yViolations(owner);
});

test("aksesibilitas pemilik: Hasil opname, detailnya, dan Kedaluwarsa pada 360 px", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  // Satu sesi opname lewat app staf supaya daftar dan detail berisi.
  await loginStaff(page);
  await fillSampleStock(page);
  await page
    .getByRole("navigation", { name: "Navigasi orang toko" })
    .getByRole("link", { name: "Opname" })
    .click();
  await page.getByRole("button", { name: /^Roti & Biskuit/ }).click();
  await page.getByRole("button", { name: ROTI, exact: true }).click();
  await page.getByRole("textbox", { name: "Jumlah Bungkus" }).fill("1");
  await page
    .getByRole("button", { name: "Simpan, lanjut barang berikutnya" })
    .click();
  await page.getByRole("button", { name: "Selesai menghitung" }).click();
  await page
    .getByRole("alertdialog", { name: "Selesai sekarang?" })
    .getByRole("button", { name: "Selesai menghitung" })
    .click();
  await expect(page.getByRole("heading", { name: "Hasil opname" })).toBeVisible(
    {
      timeout: 10_000,
    },
  );

  const owner = await context.newPage();
  await loginOwner(owner, "/owner/lainnya/opname");
  await expect(
    owner.getByRole("heading", { name: "Hasil opname" }),
  ).toBeVisible();
  const link = owner.getByRole("link", { name: /Roti & Biskuit/ });
  await expect(link).toBeVisible();
  await expectNoHorizontalScroll(owner);
  await expectNoA11yViolations(owner);

  await link.click();
  await expect(
    owner.getByRole("region", { name: "Ringkasan selisih" }),
  ).toBeVisible();
  await expect(owner.getByText(ROTI)).toBeVisible();
  await expectNoHorizontalScroll(owner);
  await expectNoA11yViolations(owner);

  await owner.goto("/owner/lainnya/kedaluwarsa");
  await expect(owner.getByText("Perkiraan kerugian")).toBeVisible();
  await expectNoHorizontalScroll(owner);
  await expectNoA11yViolations(owner);
});
