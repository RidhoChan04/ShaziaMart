import { expect, expectNoA11yViolations, test } from "./fixtures.ts";
import { loginOwner } from "./owner-helpers.ts";

test.describe("kasir", () => {
  test.beforeEach(({ page: _page }, info) => {
    test.skip(info.project.name !== "kasir", "hanya project kasir");
  });

  test("kasir: kerangka tampil dan server tersambung", async ({ page }) => {
    await page.goto("/kasir");
    await expect(page.getByText("ShaziaMart")).toBeVisible();
    await expect(page.getByText("● Server tersambung")).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test("kasir: server mati menampilkan bar merah", async ({ page }) => {
    await page.goto("/kasir?skenario=server-mati");
    await expect(page.getByRole("alert")).toContainText(
      "transaksi belum bisa disimpan",
    );
  });
});

test.describe("owner", () => {
  test.beforeEach(({ page: _page }, info) => {
    test.skip(!info.project.name.startsWith("owner-"), "hanya project owner");
  });

  test("owner: tanpa sesi tampil Masuk pemilik", async ({ page }) => {
    await page.goto("/owner");
    await expect(
      page.getByRole("heading", { name: "Masuk pemilik" }),
    ).toBeVisible();
    await expectNoA11yViolations(page);
  });

  test("owner HP: tab bawah; laptop: sidebar", async ({ page }, info) => {
    await loginOwner(page);
    await expect(page.getByText("Toko online")).toBeVisible();
    const nav = page.getByRole("navigation", { name: "Navigasi utama" });
    await expect(nav.getByRole("link")).toHaveCount(5);
    const box = await nav.boundingBox();
    if (!box) throw new Error("nav tidak punya bounding box");
    if (info.project.name === "owner-hp") {
      // Kapsul mengambang: 12px dari tepi bawah dan sisi.
      expect(box.y).toBeGreaterThan(600);
      expect(Math.abs(box.y + box.height - (800 - 12))).toBeLessThanOrEqual(2);
      expect(box.x).toBeGreaterThanOrEqual(11);
    } else {
      expect(box.x).toBeGreaterThanOrEqual(11);
      expect(box.height).toBeGreaterThanOrEqual(600);
    }
    await expectNoA11yViolations(page);
  });

  test("owner: deep link /owner/laporan tetap SPA dan mendapat data mock", async ({
    page,
  }) => {
    await loginOwner(page, "/owner/laporan");
    await expect(page.getByRole("heading", { name: "Laporan" })).toBeVisible();
    await expect(page.getByText("Tidak bisa terhubung ke toko")).toHaveCount(0);
  });

  test("owner HP: Tab ke tautan Kasbon memberi fokus dengan outline terlihat", async ({
    page,
  }, info) => {
    test.skip(info.project.name !== "owner-hp", "tab bar hanya di HP");
    await loginOwner(page);
    const kasbon = page
      .getByRole("navigation", { name: "Navigasi utama" })
      .getByRole("link", { name: "Kasbon" });
    // Urutan DOM: nav sebelum main → Beranda, Barang, Laporan, Kasbon.
    for (let i = 0; i < 4; i++) await page.keyboard.press("Tab");
    await expect(kasbon).toBeFocused();
    await expect(kasbon).toHaveCSS("outline-style", "solid");
  });
});
