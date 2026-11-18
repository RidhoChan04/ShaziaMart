import type { BrowserContext, Page } from "@playwright/test";
import { expect, expectNoA11yViolations, test } from "./fixtures.ts";
import {
  addBerasNominal,
  closeShift,
  firstSaleNumber,
  openShift,
  payCash,
  payQris,
  scan,
  scanBox,
  startRepayment,
  typePin,
} from "./kasir-helpers.ts";
import { loginOwner } from "./owner-helpers.ts";

const RINA = { kasir: "Rina", pin: "123456", opening: "200.000" };
const BUDI = { kasir: "Budi", pin: "654321", opening: "100.000" };
const BERAS = "8991002101012";
const TOTAL = { name: "Total" } as const;

test.beforeEach(({ page: _page }, info) => {
  test.skip(info.project.name !== "kasir", "hanya project kasir");
});

/** Halaman pemilik 360 px di konteks yang sama (state mock bersama lewat localStorage). */
async function ownerPage(context: BrowserContext, path: string) {
  const page = await context.newPage();
  await page.setViewportSize({ width: 360, height: 800 });
  await loginOwner(page, path);
  return page;
}

/** Shift ditutup lalu kasir lain membuka shift baru (sesi kasir sebelumnya diganti). */
async function switchShift(
  page: Page,
  closed: { counted: string },
  next: { kasir: string; pin: string; opening: string },
) {
  const dialog = await closeShift(page, closed.counted);
  await dialog.getByRole("button", { name: "Selesai" }).click();
  await expect(page.getByRole("heading", { name: "Buka shift" })).toBeVisible();
  await page.getByRole("button", { name: next.kasir }).click();
  await typePin(page, next.pin);
  await page
    .getByRole("textbox", { name: "Modal awal di laci" })
    .fill(next.opening);
  await page.getByRole("button", { name: "Buka shift" }).click();
  await expect(scanBox(page)).toBeVisible();
}

test("pelunasan tunai Bu Sari: kembalian, tersimpan, dan baris tutup shift", async ({
  page,
}) => {
  await openShift(page, RINA);
  const dialog = await startRepayment(page, {
    customer: "Bu Sari",
    amount: "50.000",
  });
  await expect(dialog).toContainText("Sisa kasbon setelah ini Rp70.000");
  await dialog.getByLabel("UANG DITERIMA").fill("100.000");
  await expect(dialog).toContainText("KEMBALIAN");
  await expect(dialog).toContainText("Rp50.000");
  await expectNoA11yViolations(page);
  await dialog.getByRole("button", { name: "Simpan pelunasan" }).click();

  const saved = page.getByRole("dialog", {
    name: "Pelunasan tersimpan",
    exact: true,
  });
  await expect(saved).toBeVisible();
  await expect(saved).toContainText("KEMBALIAN");
  await expect(saved).toContainText("Rp50.000");
  await expect(saved).toContainText("Sisa kasbon Rp70.000");
  await saved.getByRole("button", { name: "Tutup" }).click();
  await expect(saved).toBeHidden();

  const result = await closeShift(page, "250.000");
  await expect(
    result.getByText("Pelunasan kasbon").locator(".."),
  ).toContainText("+Rp50.000");
  await expect(result.getByText("Uang seharusnya").locator("..")).toContainText(
    "Rp250.000",
  );
  await expect(result.getByText("Selisih").locator("..")).toContainText("Rp0");
});

test("pelunasan QRIS saat keranjang berisi tidak mengosongkan keranjang", async ({
  page,
}) => {
  await openShift(page, RINA);
  await scan(page, BERAS);
  const total = page.getByRole("complementary", TOTAL);
  await expect(total).toContainText("1 BARANG");

  const dialog = await startRepayment(page, {
    customer: "Bu Sari",
    amount: "20.000",
  });
  await dialog.getByRole("tab", { name: "QRIS" }).click();
  await dialog.getByRole("button", { name: "Sudah masuk" }).click();
  const saved = page.getByRole("dialog", {
    name: "Pelunasan tersimpan",
    exact: true,
  });
  await expect(saved).toBeVisible();
  await expect(saved).toContainText("Sisa kasbon Rp100.000");
  await saved.getByRole("button", { name: "Tutup" }).click();
  await expect(saved).toBeHidden();
  await expect(total).toContainText("1 BARANG");
  await expect(page.getByRole("button", { name: "Bayar" })).toBeEnabled();
});

test("kasir membatalkan pelunasan QRIS; pemilik melihatnya dan meninjau butir Beranda", async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await openShift(page, RINA);
  const dialog = await startRepayment(page, {
    customer: "Bu Sari",
    amount: "20.000",
  });
  await dialog.getByRole("tab", { name: "QRIS" }).click();
  await dialog.getByRole("button", { name: "Sudah masuk" }).click();
  await page
    .getByRole("dialog", { name: "Pelunasan tersimpan", exact: true })
    .getByRole("button", { name: "Tutup" })
    .click();

  await page.getByRole("button", { name: "Riwayat" }).click();
  const sheet = page.getByRole("dialog", { name: "Riwayat shift ini" });
  await expect(sheet).toContainText("Pelunasan · Bu Sari");
  await sheet
    .getByRole("button", { name: /^Batalkan pelunasan Bu Sari \d\d\.\d\d$/ })
    .click();
  const cancel = page.getByRole("dialog", {
    name: "Batalkan pelunasan Rp20.000?",
  });
  await expect(cancel).toContainText("Kasbon Bu Sari bertambah lagi Rp20.000.");
  await expect(cancel).toHaveCSS("opacity", "1");
  await expectNoA11yViolations(page);
  await cancel.getByLabel("Alasan").fill("Salah pelanggan");
  await cancel.getByRole("button", { name: "Batalkan pelunasan" }).click();
  await expect(cancel).toBeHidden();
  await expect(sheet.getByText("Dibatalkan")).toBeVisible();
  await closeHistory(page);

  const owner = await ownerPage(context, "/owner/kasbon");
  await owner.getByRole("link", { name: /Bu Sari/ }).click();
  await expect(
    owner.getByRole("heading", { name: "Bu Sari", level: 1 }),
  ).toBeVisible();
  await expect(owner.getByText("Dibatalkan", { exact: true })).toBeVisible();
  await expect(owner.getByText(/Salah pelanggan · Rina/)).toBeVisible();
  await expectNoA11yViolations(owner);

  await owner.goto("/owner");
  const attention = owner.getByRole("region", { name: "Perlu perhatian" });
  await attention
    .getByRole("link", { name: /1 pelunasan dibatalkan kasir/ })
    .click();
  await expect(owner.getByText("Salah pelanggan").first()).toBeVisible();
  await expectNoA11yViolations(owner);
  await owner.getByRole("button", { name: "Tandai sudah ditinjau" }).click();
  await expect(owner.getByText("Tidak ada yang perlu ditinjau")).toBeVisible();
  await owner.goto("/owner");
  await expect(
    owner
      .getByRole("region", { name: "Perlu perhatian" })
      .getByText(/pelunasan dibatalkan kasir/),
  ).toHaveCount(0);
});

/** Tutup lembar Riwayat dengan Esc; diulang karena Esc yang datang saat dialog alasan menutup bisa hilang. */
async function closeHistory(page: Page) {
  await expect(async () => {
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 1000 });
  }).toPass();
  await expect(scanBox(page)).toBeFocused();
}

/** Riwayat shift ini: batalkan satu nomor struk dengan alasan; sheet ditutup lagi. */
async function voidFromHistory(page: Page, number: string, reason: string) {
  await page.getByRole("button", { name: "Riwayat" }).click();
  const sheet = page.getByRole("dialog", { name: "Riwayat shift ini" });
  await sheet.getByRole("button", { name: `Batalkan ${number}` }).click();
  const dialog = page.getByRole("dialog", { name: `Batalkan ${number}?` });
  await dialog.getByLabel("Alasan").fill(reason);
  await dialog.getByRole("button", { name: "Batalkan transaksi" }).click();
  await expect(dialog).toBeHidden();
  await expect(sheet.getByText("Dibatalkan", { exact: true })).toBeVisible();
  await closeHistory(page);
}

/** Cari struk lama di Riwayat: batalkan dengan alasan; `source` memilih pengembalian QRIS. */
async function voidOldSale(
  page: Page,
  number: string,
  reason: string,
  source?: "Transfer oleh pemilik nanti",
) {
  await page.getByRole("button", { name: "Riwayat" }).click();
  const sheet = page.getByRole("dialog", { name: "Riwayat shift ini" });
  await expect(sheet).toContainText("Belum ada transaksi di shift ini");
  await expect(sheet).not.toContainText(number);
  await sheet.getByLabel("Cari nomor struk").fill(number);
  await sheet.getByRole("button", { name: `Batalkan ${number}` }).click();
  const dialog = page.getByRole("dialog", { name: `Batalkan ${number}?` });
  if (source) {
    await expect(
      dialog.getByRole("radio", { name: "Tunai dari laci" }),
    ).toBeChecked();
    await dialog.getByText(source).click();
  }
  await dialog.getByLabel("Alasan").fill(reason);
  await dialog.getByRole("button", { name: "Batalkan transaksi" }).click();
  await expect(dialog).toBeHidden();
  await expect(sheet.getByText("Dibatalkan", { exact: true })).toBeVisible();
  await closeHistory(page);
}

test("batal transaksi dan kasbon lewat limit di kasir; pemilik membatalkan transaksi shift tutup dan melihat tiga butir", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await openShift(page, RINA);

  // R4: batal transaksi tunai di shift sendiri.
  await addBerasNominal(page, "30.000");
  await payCash(page, "30.000");
  const cashNumber = await firstSaleNumber(page);
  await closeHistory(page);
  await voidFromHistory(page, cashNumber, "Salah input barang");

  // R2: pelunasan QRIS lalu batal beralasan (butir ketiga).
  const repay = await startRepayment(page, {
    customer: "Bu Sari",
    amount: "20.000",
  });
  await repay.getByRole("tab", { name: "QRIS" }).click();
  await repay.getByRole("button", { name: "Sudah masuk" }).click();
  await page
    .getByRole("dialog", { name: "Pelunasan tersimpan", exact: true })
    .getByRole("button", { name: "Tutup" })
    .click();
  await page.getByRole("button", { name: "Riwayat" }).click();
  await page
    .getByRole("dialog", { name: "Riwayat shift ini" })
    .getByRole("button", { name: /^Batalkan pelunasan Bu Sari/ })
    .click();
  const cancel = page.getByRole("dialog", { name: /^Batalkan pelunasan/ });
  await cancel.getByLabel("Alasan").fill("Salah catat");
  await cancel.getByRole("button", { name: "Batalkan pelunasan" }).click();
  await expect(cancel).toBeHidden();
  await closeHistory(page);

  // R3: kasbon Pak Joko melewati limit dengan alasan.
  await scan(page, BERAS);
  await page.getByRole("button", { name: "Bayar" }).click();
  const pay = page.getByRole("dialog");
  await pay.getByRole("tab", { name: "Kasbon" }).click();
  await pay.getByPlaceholder("Nama atau no. HP").fill("Joko");
  await pay.getByRole("button", { name: /Pak Joko/ }).click();
  await pay.getByRole("button", { name: "Selesai" }).click();
  const limit = page.getByRole("dialog", { name: "Kasbon melewati limit" });
  await limit.getByLabel("Alasan").fill("Beli beras untuk hajatan");
  await limit.getByRole("button", { name: "Simpan dengan alasan" }).click();
  await expect(limit).toBeHidden();
  const creditNumber = await firstSaleNumber(page, [cashNumber]);
  await closeHistory(page);

  const closed = await closeShift(page, "200.000");
  await closed.getByRole("button", { name: "Selesai" }).click();

  const owner = await ownerPage(context, "/owner");
  // Beranda: tiga butir pengecualian paling atas, dengan rentang tanggal.
  const attention = owner.getByRole("region", { name: "Perlu perhatian" });
  const items = attention.getByRole("listitem");
  const voided = items.filter({ hasText: "1 transaksi dibatalkan kasir" });
  await expect(voided).toContainText(/\d{1,2} [A-Z][a-z]{2} · Rp30\.000/);
  await expect(
    items.filter({ hasText: "1 pelunasan dibatalkan kasir" }),
  ).toContainText(/\d{1,2} [A-Z][a-z]{2} · Rp20\.000/);
  await expect(items.filter({ hasText: "1 kasbon lewat limit" })).toContainText(
    /\d{1,2} [A-Z][a-z]{2} · lewat Rp68\.000/,
  );
  const texts = await items.allInnerTexts();
  const lastException = Math.max(
    ...texts.flatMap((t, i) =>
      /dibatalkan kasir|kasbon lewat limit/.test(t) ? [i] : [],
    ),
  );
  // Tiga butir pengecualian = tiga butir teratas (di atas butir stok mana pun).
  expect(lastException).toBe(2);

  await owner.goto("/owner/lainnya");
  await expectNoA11yViolations(owner);
  await owner.getByRole("link", { name: "Transaksi" }).click();
  await expect(
    owner.getByRole("heading", { name: "Transaksi", level: 1 }),
  ).toBeVisible();
  await expect(owner.getByRole("link", { name: /Dibatalkan/ })).toHaveCount(1);
  await expectNoA11yViolations(owner);
  await owner.getByRole("link", { name: new RegExp(creditNumber) }).click();
  await expect(
    owner.getByRole("heading", { name: creditNumber, level: 1 }),
  ).toBeVisible();
  await expectNoA11yViolations(owner);
  await owner.getByRole("button", { name: "Batalkan transaksi" }).click();
  const dialog = owner.getByRole("dialog", {
    name: `Batalkan ${creditNumber}?`,
  });
  await dialog.getByLabel("Alasan").fill("Pelanggan menolak barang");
  await expect(dialog).toHaveCSS("opacity", "1");
  await expectNoA11yViolations(owner);
  await dialog.getByRole("button", { name: "Batalkan transaksi" }).click();
  await expect(owner.getByText("Pelanggan menolak barang")).toBeVisible();
  await expect(owner.getByText("Dibatalkan").first()).toBeVisible();
});

test("pengembalian keesokan hari: transaksi shift lalu dibatalkan kasir shift berikutnya", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openShift(page, RINA);
  await addBerasNominal(page, "50.000");
  await payCash(page, "50.000");
  const number = await firstSaleNumber(page);
  await closeHistory(page);
  await switchShift(page, { counted: "250.000" }, BUDI);

  // J0: Riwayat hanya shift yang sedang buka; struk lama dicari lewat nomor.
  await page.getByRole("button", { name: "Riwayat" }).click();
  const sheet = page.getByRole("dialog", { name: "Riwayat shift ini" });
  await expect(sheet).toContainText("Belum ada transaksi di shift ini");
  await expect(sheet).not.toContainText(number);
  await sheet.getByLabel("Cari nomor struk").fill(number);
  await sheet.getByRole("button", { name: `Batalkan ${number}` }).click();
  const dialog = page.getByRole("dialog", { name: `Batalkan ${number}?` });
  await expect(dialog).toContainText(
    "Tunai Rp50.000 dikembalikan dari laci shift ini.",
  );
  await expect(dialog).toHaveCSS("opacity", "1");
  await expectNoA11yViolations(page);
  await dialog.getByLabel("Alasan").fill("Barang dikembalikan pembeli");
  await dialog.getByRole("button", { name: "Batalkan transaksi" }).click();
  await expect(dialog).toBeHidden();
  await expect(sheet.getByText("Dibatalkan", { exact: true })).toBeVisible();
  await closeHistory(page);

  const result = await closeShift(page, "50.000");
  await expect(
    result.getByText("Pengembalian transaksi").locator(".."),
  ).toContainText("-Rp50.000");
  await expect(result.getByText("Uang seharusnya").locator("..")).toContainText(
    "Rp50.000",
  );
  await expect(result.getByText("Selisih").locator("..")).toContainText("Rp0");
});

test("QRIS dikembalikan tunai dari laci, struk lama tunai, dan QRIS yang ditransfer pemilik nanti", async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  // Shift A (Rina): satu transaksi tunai Rp30.000 dan satu QRIS Rp20.000.
  await openShift(page, RINA);
  await addBerasNominal(page, "30.000");
  await payCash(page, "30.000");
  const cashNumber = await firstSaleNumber(page);
  await closeHistory(page);
  await addBerasNominal(page, "20.000");
  await payQris(page);
  const qrisOld = await firstSaleNumber(page, [cashNumber]);
  await closeHistory(page);

  // Shift B (Budi): jual QRIS Rp20.000 lalu batalkan; radio bawaan `Tunai dari laci`.
  await switchShift(page, { counted: "230.000" }, BUDI);
  await addBerasNominal(page, "20.000");
  await payQris(page);
  const qrisNew = await firstSaleNumber(page);
  const sheet = page.getByRole("dialog", { name: "Riwayat shift ini" });
  await sheet.getByRole("button", { name: `Batalkan ${qrisNew}` }).click();
  const dialog = page.getByRole("dialog", { name: `Batalkan ${qrisNew}?` });
  await expect(dialog).toContainText("QRIS · Rp20.000");
  await expect(
    dialog.getByRole("radio", { name: "Tunai dari laci" }),
  ).toBeChecked();
  await expect(dialog).toHaveCSS("opacity", "1");
  await expectNoA11yViolations(page);
  await dialog.getByLabel("Alasan").fill("Pembeli salah scan");
  await dialog.getByRole("button", { name: "Batalkan transaksi" }).click();
  await expect(dialog).toBeHidden();
  await closeHistory(page);
  const closedB = await closeShift(page, "80.000");
  await expect(
    closedB.getByText("Pengembalian transaksi").locator(".."),
  ).toContainText("-Rp20.000");
  await expect(
    closedB.getByText("Uang seharusnya").locator(".."),
  ).toContainText("Rp80.000");

  // Shift C (Rina): batalkan struk lama tunai (-Rp30.000) dan QRIS lama (Transfer oleh pemilik nanti).
  await closedB.getByRole("button", { name: "Selesai" }).click();
  await page.getByRole("button", { name: "Rina" }).click();
  await typePin(page, RINA.pin);
  await page
    .getByRole("textbox", { name: "Modal awal di laci" })
    .fill("100.000");
  await page.getByRole("button", { name: "Buka shift" }).click();
  await expect(scanBox(page)).toBeVisible();
  await voidOldSale(page, cashNumber, "Pembeli batal beli");
  await voidOldSale(
    page,
    qrisOld,
    "Pembeli minta uang kembali",
    "Transfer oleh pemilik nanti",
  );
  const closedC = await closeShift(page, "70.000");
  await expect(
    closedC.getByText("Pengembalian transaksi").locator(".."),
  ).toContainText("-Rp30.000");
  await expect(
    closedC.getByText("Uang seharusnya").locator(".."),
  ).toContainText("Rp70.000");
  await closedC.getByRole("button", { name: "Selesai" }).click();

  // Pemilik: tugas transfer QRIS di halaman tinjau (3 transaksi dibatalkan kasir).
  const owner = await ownerPage(context, "/owner");
  await owner
    .getByRole("region", { name: "Perlu perhatian" })
    .getByRole("link", { name: /3 transaksi dibatalkan kasir/ })
    .click();
  await expect(
    owner.getByText(
      `Transfer Rp20.000 ke pembeli (pengembalian QRIS struk ${qrisOld})`,
    ),
  ).toBeVisible();
  await expect(
    owner.getByText("Shift sebelumnya · tunai dari laci Rp30.000"),
  ).toBeVisible();
  await expect(
    owner.getByText("QRIS dikembalikan tunai dari laci Rp20.000"),
  ).toBeVisible();
  await expectNoA11yViolations(owner);
});

test("toast Ditandai sudah ditinjau di HP pemilik berada di atas tab bar dan tidak menutupi pil kembali", async ({
  page,
  context,
}) => {
  await openShift(page, RINA);
  const dialog = await startRepayment(page, {
    customer: "Bu Sari",
    amount: "20.000",
  });
  await dialog.getByRole("tab", { name: "QRIS" }).click();
  await dialog.getByRole("button", { name: "Sudah masuk" }).click();
  await page
    .getByRole("dialog", { name: "Pelunasan tersimpan", exact: true })
    .getByRole("button", { name: "Tutup" })
    .click();
  await page.getByRole("button", { name: "Riwayat" }).click();
  await page
    .getByRole("dialog", { name: "Riwayat shift ini" })
    .getByRole("button", { name: /^Batalkan pelunasan Bu Sari/ })
    .click();
  const cancel = page.getByRole("dialog", { name: /^Batalkan pelunasan/ });
  await cancel.getByLabel("Alasan").fill("Salah catat");
  await cancel.getByRole("button", { name: "Batalkan pelunasan" }).click();
  // Toast kasir tidak ikut aturan pemilik: jaraknya ke tepi bawah layar = offset bawaan sonner
  // (variabel --offset-bottom toaster), bukan celah tab bar pemilik.
  const kasirToast = page.locator("[data-sonner-toast]", {
    hasText: "Pelunasan dibatalkan",
  });
  await expect(kasirToast).toBeVisible();
  const offset = await page
    .locator("[data-sonner-toaster]")
    .first()
    .evaluate((el) =>
      Number.parseFloat(
        getComputedStyle(el).getPropertyValue("--offset-bottom"),
      ),
    );
  expect(offset).toBeGreaterThan(0);
  const viewportHeight = page.viewportSize()?.height ?? 0;
  await expect
    .poll(async () => {
      const box = await kasirToast.boundingBox();
      return box ? Math.round(viewportHeight - (box.y + box.height)) : null;
    })
    .toBe(Math.round(offset));
  await closeHistory(page);

  const owner = await ownerPage(context, "/owner/pengecualian/batal_pelunasan");
  await owner.getByRole("button", { name: "Tandai sudah ditinjau" }).click();
  const toast = owner.locator("[data-sonner-toast]", {
    hasText: "Ditandai sudah ditinjau",
  });
  await expect(toast).toBeVisible();
  // Sonner menggeser toast masuk dari bawah; tunggu posisinya diam sebelum membandingkan.
  let previous = Number.NaN;
  await expect
    .poll(async () => {
      const top = (await toast.boundingBox())?.y ?? Number.NaN;
      const settled = top === previous;
      previous = top;
      return settled;
    })
    .toBe(true);
  const toastBox = await toast.boundingBox();
  const navBox = await owner
    .getByRole("navigation", { name: "Navigasi utama" })
    .boundingBox();
  const backBox = await owner
    .getByRole("main")
    .getByRole("link", { name: "Beranda" })
    .or(owner.getByRole("main").getByRole("button", { name: "Beranda" }))
    .first()
    .boundingBox();
  if (!(toastBox && navBox && backBox)) throw new Error("tanpa bounding box");
  expect(toastBox.y + toastBox.height).toBeLessThanOrEqual(navBox.y);
  const overlapsBack =
    toastBox.x < backBox.x + backBox.width &&
    backBox.x < toastBox.x + toastBox.width &&
    toastBox.y < backBox.y + backBox.height &&
    backBox.y < toastBox.y + toastBox.height;
  expect(overlapsBack).toBe(false);
});

test("pelunasan langsung pemilik tidak muncul di tutup shift kasir", async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await openShift(page, RINA);
  const owner = await ownerPage(context, "/owner/kasbon");
  await expect(owner.getByText("Total kasbon")).toBeVisible();
  await expectNoA11yViolations(owner);
  await owner.getByRole("link", { name: /Bu Tini/ }).click();
  await expect(
    owner.getByRole("heading", { name: "Bu Tini", level: 1 }),
  ).toBeVisible();
  const before = await owner.getByLabel("Ringkasan pelanggan").innerText();
  expect(before).toContain("Sisa kasbon");
  await owner.getByRole("button", { name: "Catat pelunasan" }).click();
  const sheet = owner.getByRole("dialog", { name: "Catat pelunasan" });
  await expect(sheet).toHaveCSS("opacity", "1");
  await expectNoA11yViolations(owner);
  await sheet.getByLabel("Nominal").fill("100.000");
  await sheet.getByLabel("Transfer").check();
  await expect(sheet).toContainText("Sisa setelah ini Rp540.000");
  await sheet.getByRole("button", { name: "Simpan pelunasan" }).click();
  await expect(owner.getByLabel("Ringkasan pelanggan")).toContainText(
    "Rp540.000",
  );
  await expect(
    owner.getByText("Pelunasan · Transfer ke pemilik"),
  ).toBeVisible();

  const result = await closeShift(page, "200.000");
  await expect(result).not.toContainText("Pelunasan kasbon");
  await expect(result.getByText("Uang seharusnya").locator("..")).toContainText(
    "Rp200.000",
  );
});
