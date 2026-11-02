import type { Page } from "@playwright/test";
import { expect, expectNoA11yViolations, test } from "./fixtures.ts";
import { typePin } from "./kasir-helpers.ts";
import { fillOwnerLogin, loginOwner } from "./owner-helpers.ts";

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
