import { expect, expectNoA11yViolations, test } from "./fixtures.ts";
import { loginOwner } from "./owner-helpers.ts";
import {
  expectNoHorizontalScroll,
  goOffline,
  goOnline,
  loginStaff,
} from "./staff-helpers.ts";
import {
  countProduct,
  finishCounting,
  heldCount,
  mockProduct,
  mockStockState,
  openOpnameTab,
  startMiInstan,
} from "./stock-helpers.ts";

test.beforeEach(({ page: _page }, info) => {
  test.skip(info.project.name !== "owner-hp", "app orang toko = HP 360 px");
});

const GORENG = "Indomie Goreng";
const SOTO = "Indomie Soto Mie";

test("opname offline: hitung 2 barang, antre di HP, terkirim otomatis, beri alasan, pemilik melihat riwayat stok", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await loginStaff(page);
  const goreng = await mockProduct(page, GORENG);
  const soto = await mockProduct(page, SOTO);

  await openOpnameTab(page);
  await startMiInstan(page);
  await countProduct(page, SOTO, soto.stock); // cocok
  await countProduct(page, GORENG, goreng.stock - 7); // kurang 7

  await goOffline(page);
  await finishCounting(page);
  await expect(
    page.getByText("Belum terkirim — dikirim otomatis saat tersambung"),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Stok opname" }),
  ).toBeVisible();
  const draft = page.getByRole("button", { name: /Mi Instan/ }).first();
  await expect(draft).toContainText("2 dari");
  await expect(draft).toContainText("Belum terkirim");
  await expectNoHorizontalScroll(page);

  await goOnline(page);
  const awaiting = page.getByRole("region", { name: "Perlu diberi alasan" });
  await expect(awaiting).toBeVisible({ timeout: 10_000 });
  await expect(page.getByText("Belum terkirim", { exact: true })).toHaveCount(
    0,
  );
  await expect(awaiting).toContainText("1 selisih");
  await awaiting.getByRole("button", { name: /Mi Instan/ }).click();

  await expect(
    page.getByRole("heading", { name: "Hasil opname" }),
  ).toBeVisible();
  await expect(page.getByText("1 cocok")).toBeVisible();
  await expect(page.getByText("1 selisih · wajib beri alasan")).toBeVisible();
  const card = page.getByRole("region", { name: GORENG });
  await expect(card).toContainText("Kurang 7");
  await expect(card).toContainText(
    `Sistem ${goreng.stock} → hitungan ${goreng.stock - 7}`,
  );
  const save = page.getByRole("button", { name: "Simpan hasil opname" });
  await expect(save).toBeDisabled();
  await expect(page.getByText("1 barang belum diberi alasan")).toBeVisible();
  await card
    .getByRole("radiogroup", { name: `Alasan ${GORENG}` })
    .getByText("Hilang", { exact: true })
    .click();
  await expect(save).toBeEnabled();
  await save.click();
  await expect(page.getByText("Hasil opname tersimpan")).toBeVisible();
  await expect(card.getByText("Disesuaikan")).toBeVisible();
  await expectNoHorizontalScroll(page);

  // Stok disesuaikan sekali; hitungan cocok tidak membuat entri.
  const after = await mockStockState(page, goreng.id, "opname");
  expect(after).toEqual({ stock: goreng.stock - 7, entries: 1 });
  expect((await mockStockState(page, soto.id, "opname")).entries).toBe(0);

  const owner = await context.newPage();
  await loginOwner(owner, "/owner/barang");
  await owner
    .getByRole("searchbox", { name: "Cari nama atau barcode" })
    .fill(GORENG);
  await owner.getByRole("link", { name: GORENG }).first().click();
  await owner.getByRole("button", { name: "Lihat semua" }).first().click();
  const sheet = owner.getByRole("dialog", { name: "Riwayat stok" });
  await expect(sheet.getByText(/Opname · Hilang/)).toBeVisible();
  await expect(sheet.getByText("−7", { exact: true })).toBeVisible();
});

test("selisih besar ditahan: staf menunggu, pemilik menyetujui satu barang dan menghitung ulang yang lain", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await loginStaff(page);
  const goreng = await mockProduct(page, GORENG);
  const soto = await mockProduct(page, SOTO);
  const heldGoreng = heldCount(goreng);
  const heldSoto = heldCount(soto);

  await openOpnameTab(page);
  await startMiInstan(page);
  await countProduct(page, GORENG, heldGoreng.count);
  await countProduct(page, SOTO, heldSoto.count);
  await finishCounting(page);

  await expect(page.getByRole("heading", { name: "Hasil opname" })).toBeVisible(
    {
      timeout: 10_000,
    },
  );
  for (const name of [GORENG, SOTO]) {
    await page
      .getByRole("region", { name })
      .getByRole("radiogroup", { name: `Alasan ${name}` })
      .getByText("Rusak", { exact: true })
      .click();
  }
  await page.getByRole("button", { name: "Simpan hasil opname" }).click();
  await expect(page.getByText("Hasil opname tersimpan")).toBeVisible();
  await expect(page.getByText("Menunggu persetujuan pemilik")).toHaveCount(2);
  // Ditahan: stok belum berubah.
  expect((await mockStockState(page, goreng.id, "opname")).stock).toBe(
    goreng.stock,
  );

  const owner = await context.newPage();
  await loginOwner(owner, "/owner");
  const attention = owner.getByRole("link", {
    name: /Opname menunggu persetujuan/,
  });
  await expect(attention).toContainText("2 barang");
  await attention.click();
  await expect(owner.getByText("2 menunggu persetujuan")).toBeVisible();
  await owner
    .getByRole("link", { name: /Mi Instan/ })
    .first()
    .click();
  await expect(owner.getByText("Menunggu persetujuan").first()).toBeVisible();

  await owner.getByRole("button", { name: `Setujui ${GORENG}` }).click();
  const dialog = owner.getByRole("alertdialog", {
    name: "Setujui selisih ini?",
  });
  await expect(dialog).toContainText(`Stok ${GORENG} disesuaikan`);
  await dialog.getByRole("button", { name: "Setujui", exact: true }).click();
  await expect(owner.getByText(/^Disetujui Pak Ahmad/)).toBeVisible();
  // Stok berubah tepat sekali.
  const approved = await mockStockState(owner, goreng.id, "opname");
  expect(approved).toEqual({ stock: heldGoreng.count, entries: 1 });

  await owner.getByRole("button", { name: `Hitung ulang ${SOTO}` }).click();
  const sheet = owner.getByRole("dialog", { name: "Hitung ulang" });
  // Hitungan awal terurai dus + pcs; kosongkan dus agar jumlah fisik = stok.
  await sheet.getByRole("textbox", { name: "Jumlah Dus" }).fill("0");
  await sheet
    .getByRole("textbox", { name: "Jumlah Pcs" })
    .fill(String(soto.stock));
  await sheet.getByRole("button", { name: "Simpan hitungan" }).click();
  await expect(owner.getByText(/^Dihitung ulang: /)).toBeVisible();
  expect(await mockStockState(owner, soto.id, "opname")).toEqual({
    stock: soto.stock,
    entries: 0,
  });

  // Staf melihat hasil akhirnya.
  await page.reload();
  await expect(page.getByText("Disetujui pemilik")).toBeVisible();
  await expect(page.getByText("Dihitung ulang pemilik")).toBeVisible();
});

test("hitung buta: tidak ada respons /api/staff yang memuat stok sebelum hitungan dikirim", async ({
  page,
}) => {
  test.setTimeout(120_000);
  const keys = new Set<string>();
  const seenPaths: string[] = [];
  const pending: Promise<void>[] = [];
  const walk = (v: unknown) => {
    if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === "object") {
      for (const [k, x] of Object.entries(v)) {
        keys.add(k);
        walk(x);
      }
    }
  };
  page.on("response", (r) => {
    const path = new URL(r.url()).pathname;
    if (!path.startsWith("/api/staff/")) return;
    if (!(r.headers()["content-type"] ?? "").includes("json")) return;
    pending.push(
      r
        .json()
        .then((body: unknown) => {
          seenPaths.push(path);
          walk(body);
        })
        .catch(() => undefined),
    );
  });

  await loginStaff(page);
  const goreng = await mockProduct(page, GORENG);
  await openOpnameTab(page);
  await startMiInstan(page);
  await countProduct(page, GORENG, goreng.stock - 1);
  await expect(
    page.getByText("Stok sistem disembunyikan sampai selesai"),
  ).toBeVisible();

  await Promise.all(pending);
  expect(seenPaths).toContain("/api/staff/opname/products");
  for (const key of ["stock", "systemQtyBase", "cost", "price", "value"]) {
    expect(keys.has(key), `key ${key} muncul sebelum hitungan dikirim`).toBe(
      false,
    );
  }

  await finishCounting(page);
  await expect(page.getByRole("heading", { name: "Hasil opname" })).toBeVisible(
    {
      timeout: 10_000,
    },
  );
  await Promise.all(pending);
  expect(keys.has("systemQtyBase")).toBe(true);
  expect(keys.has("stock")).toBe(false);
});

test("aksesibilitas dan tanpa gulir horizontal: tab Opname, layar menghitung, hasil, Menipis", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await loginStaff(page);
  const goreng = await mockProduct(page, GORENG);

  await openOpnameTab(page);
  await expectNoHorizontalScroll(page);
  await expectNoA11yViolations(page);

  await startMiInstan(page);
  await page.getByRole("button", { name: GORENG, exact: true }).click();
  await expectNoHorizontalScroll(page);
  await expectNoA11yViolations(page);
  await page
    .getByRole("textbox", { name: "Jumlah Pcs" })
    .fill(String(goreng.stock - 3));
  await page
    .getByRole("button", { name: "Simpan, lanjut barang berikutnya" })
    .click();
  await finishCounting(page);

  await expect(page.getByRole("heading", { name: "Hasil opname" })).toBeVisible(
    {
      timeout: 10_000,
    },
  );
  await expect(page.getByRole("region", { name: GORENG })).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectNoA11yViolations(page);

  await page.goto("/staff/menipis");
  await expect(
    page.getByRole("heading", { name: "Stok menipis" }),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectNoA11yViolations(page);
});
