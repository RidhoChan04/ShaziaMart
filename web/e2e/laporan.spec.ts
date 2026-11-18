import type { Page } from "@playwright/test";
import { expect, expectNoA11yViolations, test } from "./fixtures.ts";
import { loginOwner } from "./owner-helpers.ts";
import { expectNoHorizontalScroll } from "./staff-helpers.ts";

const SUBPAGES = [
  ["paling-laku", "Paling laku"],
  ["kategori", "Per kategori"],
  ["kasir", "Per kasir"],
  ["tidak-terjual", /^Tidak terjual/],
  ["untung-tipis", "Untung tipis"],
  ["selisih-opname", "Selisih opname"],
] as const;

test.beforeEach(({ page: _page }, info) => {
  test.skip(info.project.name !== "owner-hp", "laporan diperiksa di HP 360 px");
});

/** Isi contoh opname lewat panel pengembang (data selisih untuk laporan pemilik). */
async function fillSampleOpname(page: Page) {
  await page.getByRole("button", { name: "Panel pengembang" }).click();
  await page.getByRole("button", { name: "Isi contoh opname" }).click();
  await page.getByRole("button", { name: "Panel pengembang" }).click();
}

const PILL = /▲ \d+% dari |▼ \d+% dari |Sama dengan |Belum ada data |di /;

test("Laporan Bulan: pita omzet, empat kartu dengan pembanding, periode sebelumnya", async ({
  page,
}) => {
  await loginOwner(page, "/owner/laporan");
  await page.getByRole("button", { name: "Bulan", exact: true }).click();
  await expect(page.getByRole("button", { name: "Bulan" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(
    page.getByText(/^Omzet 1(–\d{1,2})? [A-Z][a-z]{2}$/),
  ).toBeVisible();
  const content = page.getByTestId("laporan-isi");
  await expect(content.getByText(PILL).first()).toBeVisible();
  for (const tile of [
    /^Laba kotor/,
    "Transaksi",
    "Rata-rata / struk",
    "Kasbon baru",
  ]) {
    const dt = content.locator("dt").filter({ hasText: tile }).first();
    await expect(dt).toBeVisible();
    // Setiap kartu punya baris pembanding.
    await expect(dt.locator("..")).toContainText(PILL);
  }
  await expectNoHorizontalScroll(page);
  await expectNoA11yViolations(page);

  const label = page.getByText(
    /^(Januari|Februari|Maret|April|Mei|Juni|Juli|Agustus|September|Oktober|November|Desember) \d{4}$/,
  );
  const current = await label.innerText();
  await page.getByRole("button", { name: "Periode sebelumnya" }).click();
  await expect(label).not.toHaveText(current);
  await expect(
    page.getByText(/^Omzet 1–(28|29|30|31) [A-Z][a-z]{2}$/),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);
});

test("Laporan: Paling laku urut Jumlah, Per kasir, dan Tidak terjual", async ({
  page,
}) => {
  await loginOwner(page, "/owner/laporan");
  await page.getByRole("button", { name: "Bulan", exact: true }).click();
  await page.getByRole("link", { name: "Lihat semua" }).click();
  await expect(
    page.getByRole("heading", { name: "Paling laku", level: 1 }),
  ).toBeVisible();
  const rows = page.getByRole("main").getByRole("listitem");
  await expect(rows.first()).toBeVisible();
  const byOmzet = await rows.allInnerTexts();
  await page.getByRole("button", { name: "Jumlah" }).click();
  await expect(page.getByRole("button", { name: "Jumlah" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect
    .poll(async () => (await rows.allInnerTexts()).join("|"))
    .not.toBe(byOmzet.join("|"));
  await expectNoA11yViolations(page);

  await page.goBack();
  await page.getByRole("link", { name: /^Per kasir/ }).click();
  const kasirRows = page.getByRole("main").getByRole("listitem");
  await expect(kasirRows.filter({ hasText: "Rina" })).toBeVisible();
  await expect(kasirRows.filter({ hasText: "Budi" })).toBeVisible();
  await expect(kasirRows.first()).toContainText(
    /\d+ transaksi · \d+ dibatalkan/,
  );

  await page.goBack();
  await page.getByRole("link", { name: /Modal tertahan/ }).click();
  await expect(page.getByText("Modal tertahan")).toBeVisible();
  await expect(
    page.getByRole("main").getByRole("listitem").first(),
  ).toContainText(/\d+ hari · stok|belum terjual · \d+ hari/);
  await page.getByRole("button", { name: "Paling lama" }).click();
  await expect(
    page.getByRole("button", { name: "Paling lama" }),
  ).toHaveAttribute("aria-pressed", "true");
});

test("Selisih opname: barang berulang menunjukkan siapa bertugas, sebagai petunjuk", async ({
  page,
}) => {
  await loginOwner(page, "/owner/laporan");
  await fillSampleOpname(page);
  await page.getByRole("button", { name: "Bulan", exact: true }).click();
  await page.getByRole("link", { name: /^Selisih opname/ }).click();
  await expect(
    page.getByRole("heading", { name: "Selisih opname", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("Per barang")).toBeVisible();
  await expect(
    page.getByText("Selisih yang sudah diberi alasan tetap dihitung."),
  ).toBeVisible();
  await expectNoA11yViolations(page);
  await page.getByRole("link", { name: /Rokok Gudang Garam 12/ }).click();
  await expect(
    page.getByRole("heading", { name: "Rokok Gudang Garam 12", level: 1 }),
  ).toBeVisible();
  await expect(page.getByText("Bertugas saat kurang")).toBeVisible();
  await expect(
    page.getByText(
      "Petunjuk, bukan bukti — cocokkan dengan CCTV atau catatan laci.",
    ),
  ).toBeVisible();
  await expectNoHorizontalScroll(page);
  await expectNoA11yViolations(page);
});

test("Laporan dan semua sub-halaman tanpa pelanggaran aksesibilitas serius di 360 px", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await loginOwner(page, "/owner/laporan");
  await fillSampleOpname(page);
  await page.getByRole("button", { name: "Bulan", exact: true }).click();
  await expect(page.getByTestId("laporan-isi")).toBeVisible();
  await expectNoA11yViolations(page);
  const search = new URL(page.url()).search;
  for (const [path, heading] of SUBPAGES) {
    await page.goto(`/owner/laporan/${path}${search}`);
    await expect(
      page.getByRole("heading", { name: heading, level: 1 }),
    ).toBeVisible();
    await expect(page.getByRole("status", { name: "Memuat" })).toHaveCount(0);
    await expectNoHorizontalScroll(page);
    await expectNoA11yViolations(page);
  }
});

test("Beranda tetap memakai grafik omzet per jam dan tabel sr-only", async ({
  page,
}) => {
  await loginOwner(page, "/owner");
  await expect(
    page.getByRole("group", { name: /Omzet per jam hari ini dan .+ lalu/ }),
  ).toBeVisible();
  await expect(
    page.locator("table.sr-only, .sr-only table").first(),
  ).toBeAttached();
});
