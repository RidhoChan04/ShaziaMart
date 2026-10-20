import { expect, expectNoA11yViolations, test } from "./fixtures.ts";
import {
  addCurah,
  openShift,
  scan,
  scanBox,
  typePin,
} from "./kasir-helpers.ts";

const RINA = { kasir: "Rina", pin: "123456", opening: "200.000" };
const BERAS = "8991002101012";
const BIMOLI = "8992696404441";
const KAPAL_API = "8991002105126";
const INDOMIE_DUS = "189686010944";

test.beforeEach(({ page: _page }, info) => {
  test.skip(info.project.name !== "kasir", "hanya project kasir");
});

test("jual tunai contoh spec dengan kembalian Rp38.500", async ({ page }) => {
  await openShift(page, RINA);
  await scan(page, BERAS);
  await scan(page, BIMOLI);
  await scan(page, BIMOLI);
  await addCurah(page, { name: "Gula Pasir", kg: "1,5" });
  await addCurah(page, { name: "Telur Ayam", kg: "1" });
  await scan(page, INDOMIE_DUS);
  await scan(page, KAPAL_API);
  await scan(page, KAPAL_API);
  await scan(page, KAPAL_API);

  const total = page.getByRole("complementary", { name: "Total" });
  await expect(total).toContainText("Rp361.500");

  await total.getByRole("button", { name: "Bayar" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("UANG DITERIMA").fill("400.000");
  await expect(dialog).toContainText("Rp38.500");
  await dialog.getByRole("button", { name: "Selesai" }).click();

  await expect(dialog).toBeHidden();
  await expect(total.getByRole("status")).toContainText("KEMBALIAN");
  await expect(total.getByRole("status")).toContainText("Rp38.500");

  await page.getByRole("button", { name: "Riwayat" }).click();
  const sheet = page.getByRole("dialog");
  await expect(sheet.getByText("Riwayat hari ini")).toBeVisible();
  await expect(sheet.getByRole("button", { name: "Cetak ulang" })).toHaveCount(
    1,
  );
  await expect(sheet).toContainText("Rp361.500");
});

test("beras Rp20.000 per nominal", async ({ page }) => {
  await openShift(page, RINA);
  await page.getByRole("button", { name: "Beras curah" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Nominal (Rp)" }).click();
  await dialog.getByRole("textbox", { name: "Nominal (Rp)" }).fill("20.000");
  await dialog.getByRole("button", { name: "Masukkan" }).click();
  await expect(dialog).toBeHidden();
  const total = page.getByRole("complementary", { name: "Total" });
  await expect(total).toContainText("1 BARANG");
  await expect(total).toContainText("Rp20.000");
});

test("kasbon melebihi limit butuh PIN pemilik", async ({ page }) => {
  await openShift(page, RINA);
  await scan(page, BERAS); // 78.000 > sisa limit Pak Joko (10.000)
  await page.getByRole("button", { name: "Bayar" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("tab", { name: "Kasbon" }).click();
  await dialog.getByPlaceholder("Nama atau no. HP").fill("Joko");
  await dialog.getByRole("button", { name: /Pak Joko/ }).click();
  await dialog.getByRole("button", { name: "Selesai" }).click();

  const pinDialog = page.getByRole("dialog", { name: "PIN pemilik" });
  await expect(pinDialog).toBeVisible();
  await pinDialog.getByLabel("PIN").fill("999999");
  await pinDialog.getByRole("button", { name: "Konfirmasi" }).click();

  await expect(pinDialog).toBeHidden();
  await expect(
    page.getByRole("complementary", { name: "Total" }),
  ).toContainText("0 BARANG");
});

test("harga-berubah: konfirmasi lalu tersimpan", async ({ page }) => {
  await openShift(page, { ...RINA, path: "/kasir?skenario=harga-berubah" });
  await scan(page, KAPAL_API);
  await page.getByRole("button", { name: "Bayar" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("UANG DITERIMA").fill("50.000");
  await dialog.getByRole("button", { name: "Selesai" }).click();

  const changed = page.getByRole("dialog", { name: "Harga berubah" });
  await expect(changed).toBeVisible();
  await changed.getByRole("button", { name: "Konfirmasi & simpan" }).click();

  await expect(changed).toBeHidden();
  const total = page.getByRole("complementary", { name: "Total" });
  await expect(total).toContainText("0 BARANG");
  await expect(total.getByRole("status")).toContainText("KEMBALIAN");
});

test("server-mati: Bayar nonaktif", async ({ page }) => {
  await openShift(page, RINA);
  await scan(page, BERAS);
  await expect(page.getByRole("button", { name: "Bayar" })).toBeEnabled();
  await page.getByRole("button", { name: "Panel pengembang" }).click();
  await page.getByLabel("Skenario").selectOption("server-mati");
  await expect(page.getByText("● Server tidak tersambung")).toBeVisible();
  await expect(page.getByRole("alert")).toContainText(
    "transaksi belum bisa disimpan",
  );
  await expect(page.getByRole("button", { name: "Bayar" })).toBeDisabled();
});

test("kunci layar lalu buka kembali; keranjang utuh", async ({ page }) => {
  await openShift(page, RINA);
  await scan(page, BERAS);
  await page.getByRole("button", { name: "Kunci" }).click();
  await expect(page.getByText("Layar terkunci")).toBeVisible();
  await typePin(page, "123456");
  await expect(scanBox(page)).toBeVisible();
  const total = page.getByRole("complementary", { name: "Total" });
  await expect(total).toContainText("1 BARANG");
  await expect(total).toContainText("Rp78.000");
});

test("tutup shift hitung buta menampilkan selisih", async ({ page }) => {
  await openShift(page, RINA);
  await page.getByRole("button", { name: "Tutup shift" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Uang fisik di laci").fill("195.000");
  await dialog.getByRole("button", { name: "Tutup shift" }).click();
  await expect(dialog).toContainText("Uang seharusnya");
  await expect(dialog).toContainText("Uang fisik");
  await expect(dialog).toContainText("Selisih");
  await expect(dialog).toContainText("Rp5.000");
  await dialog.getByRole("button", { name: "Selesai" }).click();
  await expect(page.getByRole("heading", { name: "Buka shift" })).toBeVisible();
});

test("refresh di tengah transaksi memulihkan keranjang", async ({ page }) => {
  await openShift(page, RINA);
  await scan(page, BERAS);
  await scan(page, KAPAL_API);
  await page.reload();
  const total = page.getByRole("complementary", { name: "Total" });
  await expect(total).toContainText("2 BARANG");
  await expect(total).toContainText("Rp92.500");
});

test("aksesibilitas layar kasir, jendela bayar, dan jendela curah tanpa pelanggaran serius", async ({
  page,
}) => {
  await openShift(page, RINA);
  await scan(page, BERAS);
  await expectNoA11yViolations(page);

  await page.getByRole("button", { name: "Gula Pasir curah" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCSS("opacity", "1");
  await expectNoA11yViolations(page);
  await page.keyboard.press("Escape");
  await expect(page.getByRole("dialog")).toBeHidden();

  await page.getByRole("button", { name: "Bayar" }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  await expect(page.getByRole("dialog")).toHaveCSS("opacity", "1");
  await expectNoA11yViolations(page);
});

test("panel pengembang (tertutup maupun terbuka) tidak menutupi Bayar", async ({
  page,
}) => {
  await openShift(page, RINA);
  await scan(page, BERAS);
  const bayar = page.getByRole("button", { name: "Bayar" });
  const toggle = page.getByRole("button", { name: "Panel pengembang" });
  await expect(toggle).toHaveAttribute("aria-expanded", "false");
  await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
  const panel = page.getByRole("complementary", {
    name: "Isi panel pengembang",
  });
  await expect(panel).toBeVisible();
  const [b, p, t] = await Promise.all([
    bayar.boundingBox(),
    panel.boundingBox(),
    toggle.boundingBox(),
  ]);
  const overlaps = (x: NonNullable<typeof b>, y: NonNullable<typeof b>) =>
    x.x < y.x + y.width &&
    y.x < x.x + x.width &&
    x.y < y.y + y.height &&
    y.y < x.y + x.height;
  if (!(b && p && t)) throw new Error("kotak tidak ditemukan");
  expect(overlaps(b, p)).toBe(false);
  expect(overlaps(b, t)).toBe(false);
  await bayar.click();
  await expect(page.getByRole("dialog")).toBeVisible();
});
