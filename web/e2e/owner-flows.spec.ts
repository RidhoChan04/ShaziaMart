import { expect, expectNoA11yViolations, test } from "./fixtures.ts";
import { typePin } from "./kasir-helpers.ts";
import { fillOwnerLogin, loginOwner } from "./owner-helpers.ts";

const OFFLINE_DETECT_MS = 3 * 5_000; // 3× HEALTH_POLL_MS

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
  await expect(page.getByText("OMZET HARI INI")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Omzet per jam" }),
  ).toBeVisible();
  await expect(
    page.getByRole("group", { name: /Omzet per jam hari ini dan .+ lalu/ }),
  ).toBeVisible();
  for (const tile of [
    "LABA KOTOR",
    "TRANSAKSI",
    "KASBON BARU",
    "RATA-RATA / STRUK",
  ]) {
    await expect(page.getByText(tile, { exact: true })).toBeVisible();
  }
  await expect(
    page.getByRole("heading", { name: "PERLU PERHATIAN" }),
  ).toBeVisible();
});

test("Beranda tanpa pelanggaran aksesibilitas serius", async ({ page }) => {
  await loginOwner(page);
  await expect(
    page.getByRole("group", { name: /Omzet per jam hari ini dan .+ lalu/ }),
  ).toBeVisible();
  await expectNoA11yViolations(page);
});

test("server mati setelah data dimuat: banner offline, halaman tetap", async ({
  page,
}) => {
  await loginOwner(page);
  await expect(page.getByText("OMZET HARI INI")).toBeVisible();
  await expect(page.getByText("● toko online")).toBeVisible();

  await page.evaluate(() =>
    localStorage.setItem("mock.skenario", "server-mati"),
  );

  // Pemeriksaan kesehatan berjalan tiap 5 detik; tunggu hasilnya, bukan jeda.
  await expect(
    page.getByText("Tidak terhubung ke toko — data terakhir ditampilkan"),
  ).toBeVisible({ timeout: OFFLINE_DETECT_MS });
  await expect(page.getByText("● toko offline")).toBeVisible();
  await expect(page.getByText("OMZET HARI INI")).toBeVisible();
  await expect(
    page.getByRole("group", { name: /Omzet per jam hari ini dan .+ lalu/ }),
  ).toBeVisible();
});

test("kasir login di tab lain tidak mengeluarkan pemilik", async ({
  page,
  context,
}) => {
  await loginOwner(page);
  await expect(page.getByText("OMZET HARI INI")).toBeVisible();

  // Tanpa resetMock: state mock bersama (localStorage) harus tetap utuh.
  const kasirTab = await context.newPage();
  await kasirTab.goto("/kasir");
  await kasirTab.getByRole("button", { name: "Rina" }).click();
  await typePin(kasirTab, "123456");
  await expect(
    kasirTab.getByRole("textbox", { name: "Modal awal di laci" }),
  ).toBeVisible();
  await kasirTab.close();

  await expect(page.getByText("OMZET HARI INI")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Masuk pemilik" }),
  ).toHaveCount(0);
  await page.reload();
  await expect(page.getByText("OMZET HARI INI")).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Masuk pemilik" }),
  ).toHaveCount(0);
});
