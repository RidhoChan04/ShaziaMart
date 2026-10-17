import { expect, expectNoA11yViolations, test } from "./fixtures.ts";

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

  test("owner HP: tab bawah; laptop: sidebar", async ({ page }, info) => {
    await page.goto("/owner");
    const nav = page.getByRole("navigation", { name: "Navigasi utama" });
    await expect(nav.getByRole("link")).toHaveCount(5);
    const box = await nav.boundingBox();
    if (!box) throw new Error("nav tidak punya bounding box");
    if (info.project.name === "owner-hp") {
      expect(box.y).toBeGreaterThan(600);
      expect(Math.abs(box.y + box.height - 800)).toBeLessThanOrEqual(2);
    } else {
      expect(box.x).toBe(0);
      expect(box.height).toBeGreaterThanOrEqual(600);
    }
    await expectNoA11yViolations(page);
  });

  test("owner: deep link /owner/laporan tetap SPA dan mendapat data mock", async ({
    page,
  }) => {
    await page.goto("/owner/laporan");
    await expect(page.getByRole("heading", { name: "Laporan" })).toBeVisible();
    await expect(page.getByText("Tidak bisa terhubung ke toko")).toHaveCount(0);
  });
});
