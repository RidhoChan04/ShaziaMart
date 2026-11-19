import type { BrowserContext, Locator, Page } from "@playwright/test";
import { expect, expectNoA11yViolations, test } from "./fixtures.ts";
import {
  addBerasNominal,
  closeShift,
  openShift,
  payCash,
  resetMock,
  scanBox,
  startRepayment,
  typePin,
} from "./kasir-helpers.ts";
import { loginOwner } from "./owner-helpers.ts";

const RINA = { kasir: "Rina", pin: "123456", opening: "200.000" };
const BUDI = { kasir: "Budi", pin: "654321", opening: "100.000" };

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

/** Buka /kasir sampai layar modal awal: pilih kasir + PIN, belum mengisi apa pun. */
async function toOpeningScreen(
  page: Page,
  who: { kasir: string; pin: string },
  path = "/kasir",
) {
  await page.goto(path);
  await page.getByRole("button", { name: who.kasir }).click();
  await typePin(page, who.pin);
  await expect(
    page.getByRole("textbox", { name: "Modal awal di laci" }),
  ).toBeVisible();
}

/** Dialog kas keluar: nominal + alasan, lalu catat. */
async function recordExpense(page: Page, amount: string, reason: string) {
  await page.getByRole("button", { name: "Kas keluar" }).click();
  const dialog = page.getByRole("dialog", { name: "Kas keluar dari laci" });
  await dialog.getByLabel("Nominal").fill(amount);
  await dialog.getByLabel("Alasan").fill(reason);
  await dialog.getByRole("button", { name: "Catat kas keluar" }).click();
  await expect(dialog).toBeHidden();
}

/** Beranda pemilik: wilayah Perlu perhatian. */
function attentionOf(owner: Page) {
  return owner.getByRole("region", { name: "Perlu perhatian" });
}

test("kas keluar: salah ketik dibatalkan, yang benar tercatat di tutup shift; pemilik meninjau butirnya", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await resetMock(page);
  await toOpeningScreen(page, RINA);
  // Serah terima: modal terisi dari tutup shift terakhir, tanpa diubah (tanpa isian alasan).
  await expect(
    page.getByRole("textbox", { name: "Modal awal di laci" }),
  ).toHaveValue("200.000");
  await expect(
    page.getByRole("textbox", { name: "Alasan modal berbeda" }),
  ).toHaveCount(0);
  await page.getByRole("button", { name: "Buka shift" }).click();
  await expect(scanBox(page)).toBeVisible();

  // Kas keluar Rp20.000 salah ketik; keterangan + baris telepon pemilik (R11).
  await page.getByRole("button", { name: "Kas keluar" }).click();
  const dialog = page.getByRole("dialog", { name: "Kas keluar dari laci" });
  await dialog.getByLabel("Nominal").fill("20.000");
  await expect(dialog).toContainText(
    "Uang seharusnya di laci berkurang Rp20.000.",
  );
  await expect(dialog).toContainText("Ragu? Telepon pemilik: 0812-3456-7890");
  await dialog.getByLabel("Alasan").fill("Salah ketik");
  await dialog.getByRole("button", { name: "Catat kas keluar" }).click();
  await expect(dialog).toBeHidden();

  // S10: batalkan dari Riwayat dengan alasan.
  await page.getByRole("button", { name: "Riwayat" }).click();
  const sheet = page.getByRole("dialog", { name: "Riwayat shift ini" });
  await expect(sheet).toContainText("Kas keluar · Salah ketik");
  await sheet.getByRole("button", { name: /^Batalkan kas keluar / }).click();
  const cancel = page.getByRole("dialog", {
    name: "Batalkan kas keluar Rp20.000?",
  });
  await expect(cancel).toContainText(
    "Uang seharusnya di laci kembali bertambah Rp20.000.",
  );
  await cancel.getByLabel("Alasan").fill("Nominal salah ketik");
  await cancel.getByRole("button", { name: "Batalkan kas keluar" }).click();
  await expect(cancel).toBeHidden();
  await expect(sheet.getByText("Dibatalkan", { exact: true })).toBeVisible();
  await expect(async () => {
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).toHaveCount(0, { timeout: 1000 });
  }).toPass();

  // Kas keluar yang benar: Rp60.000.
  await recordExpense(page, "60.000", "Beli galon");
  const result = await closeShift(page, "140.000");
  await expect(result.getByText("Kas keluar").locator("..")).toContainText(
    "-Rp60.000",
  );
  await expect(result.getByText("Uang seharusnya").locator("..")).toContainText(
    "Rp140.000",
  );
  await expect(result.getByText("Selisih").locator("..")).toContainText("Rp0");
  await result.getByRole("button", { name: "Selesai" }).click();

  // Pemilik: Rp60.000 > Rp50.000 → butir kas keluar besar (menumpuk dengan dua kejadian seed); tinjau → hilang.
  const owner = await ownerPage(context, "/owner");
  const big = attentionOf(owner).getByRole("link", {
    name: /^3 kas keluar besar/,
  });
  await expect(big).toBeVisible();
  await big.click();
  await expect(owner.getByText("Beli galon").first()).toBeVisible();
  await owner.getByRole("button", { name: "Tandai sudah ditinjau" }).click();
  await expect(owner.getByText("Tidak ada yang perlu ditinjau")).toBeVisible();
  await owner.goto("/owner");
  await expect(attentionOf(owner).getByText(/kas keluar besar/)).toHaveCount(0);
});

test("pemilik ambil uang tanpa shift: modal Budi terisi turun, ubah wajib alasan; pengambilan terkunci", async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  await resetMock(page);
  // Shift Rina ditutup dengan uang fisik Rp200.000.
  await openShift(page, RINA);
  const closed = await closeShift(page, "200.000");
  await closed.getByRole("button", { name: "Selesai" }).click();
  await expect(page.getByRole("heading", { name: "Buka shift" })).toBeVisible();

  // Pemilik mengambil Rp100.000 tanpa shift berjalan.
  const owner = await ownerPage(context, "/owner/lainnya/shift");
  await owner.getByRole("button", { name: "Ambil uang dari laci" }).click();
  const take = owner.getByRole("dialog", { name: "Ambil uang dari laci" });
  await expect(take).toContainText("Mengurangi modal shift berikutnya.");
  await take.getByLabel("Nominal").fill("100.000");
  await take.getByLabel("Catatan").fill("Setor ke bank");
  await take.getByRole("button", { name: "Simpan" }).click();
  await expect(owner.getByText("Diambil pemilik")).toBeVisible();

  // Budi: modal terisi Rp100.000; ubah -Rp5.000 → alasan wajib.
  await page.getByRole("button", { name: "Budi" }).click();
  await typePin(page, BUDI.pin);
  const modal = page.getByRole("textbox", { name: "Modal awal di laci" });
  await expect(modal).toHaveValue("100.000");
  await expect(
    page.getByText("Diambil pemilik setelahnya: -Rp100.000"),
  ).toBeVisible();
  await modal.fill("95.000");
  await expect(
    page.getByText("Kurang Rp5.000 dari hitungan sebelumnya"),
  ).toBeVisible();
  const reason = page.getByRole("textbox", { name: "Alasan modal berbeda" });
  await expect(reason).toBeVisible();
  await expect(page.getByRole("button", { name: "Buka shift" })).toBeDisabled();
  await reason.fill("Uang kecil dipakai");
  await page.getByRole("button", { name: "Buka shift" }).click();
  await expect(scanBox(page)).toBeVisible();

  // Pemilik: butir modal awal berbeda; pengambilan sudah dipakai modal shift Budi → terkunci.
  await owner.goto("/owner");
  await expect(
    attentionOf(owner).getByRole("link", { name: /^2 modal awal berbeda/ }),
  ).toBeVisible();
  await owner.goto("/owner/lainnya/shift");
  await owner.getByRole("button", { name: /Diambil pemilik/ }).click();
  const sheet = owner.getByRole("dialog", { name: "Pengambilan Rp100.000" });
  await expect(sheet).toContainText("Sudah dipakai modal shift Budi");
  await expect(
    sheet.getByRole("button", { name: "Batalkan pengambilan" }),
  ).toHaveCount(0);
});

/** Isi isian bernama `label` di halaman Pengaturan lalu Simpan; menunggu pesan sukses. */
async function saveSetting(page: Page, label: string, value: string) {
  await page.getByLabel(label).fill(value);
  await page.getByRole("button", { name: "Simpan" }).click();
  await expect(page.getByText("Pengaturan disimpan")).toBeVisible();
}

test("Pengaturan: batas selisih kas mengubah butir, nomor pemilik tampil di dialog batal kasir", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await openShift(page, RINA);
  await addBerasNominal(page, "30.000");
  await payCash(page, "30.000");

  const owner = await ownerPage(context, "/owner");
  // Batas bawaan Rp5.000: selisih kecil seed berkumpul jadi satu butir per kasir, belum ada selisih kas.
  await expect(
    attentionOf(owner).getByRole("link", {
      name: /Selisih kecil berulang · Rina/,
    }),
  ).toBeVisible();
  await expect(
    attentionOf(owner).getByRole("link", { name: /\d+ selisih kas/ }),
  ).toHaveCount(0);

  await owner.goto("/owner/lainnya/pengaturan");
  await owner.getByRole("link", { name: /Perlu perhatian/ }).click();
  await saveSetting(owner, "Abaikan selisih kas di bawah", "1.000");
  await owner.goto("/owner");
  await expect(
    attentionOf(owner).getByRole("link", { name: /\d+ selisih kas/ }),
  ).toBeVisible();
  await expect(
    attentionOf(owner).getByRole("link", { name: /Selisih kecil berulang/ }),
  ).toHaveCount(0);

  // Nomor pemilik baru muncul di dialog batal transaksi kasir (R11).
  await owner.goto("/owner/lainnya/pengaturan");
  await owner.getByRole("link", { name: /Nomor telepon pemilik/ }).click();
  await saveSetting(owner, "Nomor telepon pemilik", "0821-5555-0000");
  await page.reload();
  await expect(scanBox(page)).toBeVisible();
  await page.getByRole("button", { name: "Riwayat" }).click();
  const sheet = page.getByRole("dialog", { name: "Riwayat shift ini" });
  await sheet.getByRole("button", { name: /^Batalkan \d{8}-\d+$/ }).click();
  const cancel = page.getByRole("dialog", { name: /^Batalkan \d{8}-\d+\?$/ });
  await expect(cancel).toContainText("Ragu? Telepon pemilik: 0821-5555-0000");
});

test("akun kasir: Budi nonaktif hilang dari pilih kasir PC dan HP toko, lalu aktif lagi", async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  const owner = await ownerPage(context, "/owner/lainnya/kasir");
  await owner.getByRole("link", { name: /Budi/ }).click();
  await owner.getByRole("button", { name: "Nonaktifkan" }).click();
  const confirm = owner.getByRole("alertdialog", { name: "Nonaktifkan Budi?" });
  await confirm.getByRole("button", { name: "Nonaktifkan" }).click();
  await expect(
    owner.getByRole("button", { name: "Aktifkan lagi" }),
  ).toBeVisible();

  await page.goto("/kasir");
  await expect(page.getByRole("button", { name: "Rina" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Budi" })).toHaveCount(0);
  await page.goto("/staff");
  await expect(
    page.getByRole("button", { name: "Rina", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Budi", exact: true }),
  ).toHaveCount(0);

  await owner.getByRole("button", { name: "Aktifkan lagi" }).click();
  await expect(
    owner.getByRole("button", { name: "Nonaktifkan" }),
  ).toBeVisible();
  await page.goto("/kasir");
  await expect(page.getByRole("button", { name: "Budi" })).toBeVisible();
  await page.goto("/staff");
  await expect(
    page.getByRole("button", { name: "Budi", exact: true }),
  ).toBeVisible();
});

/** Tabel hari QRIS: baris hari yang namanya cocok `day` (mis. /17 Nov/). */
function qrisDayRow(owner: Page, day: RegExp) {
  return owner.getByRole("button", { name: day });
}

test("QRIS harian: tandai Tidak cocok dan Cocok per hari, lalu Cocokkan dari Lihat semua", async ({
  page,
  context,
}) => {
  test.setTimeout(120_000);
  await resetMock(page);
  const owner = await ownerPage(context, "/owner");
  await expect(
    attentionOf(owner).getByRole("link", {
      name: "QRIS belum dicocokkan: 3 hari 17–19 Nov",
    }),
  ).toBeVisible();

  await owner.goto("/owner/lainnya/qris");
  // Satu hari: Tidak cocok wajib catatan; daftar transaksi hari itu terbuka.
  await qrisDayRow(owner, /17 Nov/).click();
  const sheet = owner.getByRole("dialog", { name: /^QRIS .*17 Nov$/ });
  await expect(sheet).toContainText("Total");
  await sheet.getByRole("button", { name: "Lihat transaksi" }).click();
  const list = owner.getByRole("dialog", { name: /^Transaksi QRIS/ });
  await expect(list).toContainText("Total");
  await list.getByRole("button", { name: /Tutup|Kembali/ }).click();
  await sheet.getByRole("button", { name: "Tidak cocok" }).click();
  await expect(sheet).toContainText("Isi catatan bila tidak cocok");
  await sheet.getByLabel("Catatan").fill("Mutasi bank kurang Rp5.000");
  await sheet.getByRole("button", { name: "Tidak cocok" }).click();
  await expect(owner.getByText("QRIS ditandai")).toBeVisible();
  await expect(qrisDayRow(owner, /17 Nov/)).toContainText("Tidak cocok");

  // Hari lain: Cocok tanpa catatan.
  await qrisDayRow(owner, /18 Nov/).click();
  await owner
    .getByRole("dialog", { name: /^QRIS .*18 Nov$/ })
    .getByRole("button", { name: "Cocok", exact: true })
    .click();
  await expect(qrisDayRow(owner, /18 Nov/)).toContainText("Cocok");

  // Tersisa satu hari belum dicocokkan.
  await owner.goto("/owner");
  const qris = attentionOf(owner).getByRole("link", {
    name: /^QRIS belum dicocokkan: 1 hari/,
  });
  await expect(qris).toBeVisible();

  // S11: Lihat semua → Cocokkan → lembar tanpa pindah halaman; butirnya hilang.
  await attentionOf(owner)
    .getByRole("link", { name: /^Lihat semua/ })
    .click();
  await owner.getByRole("button", { name: "Cocokkan" }).click();
  const reconcile = owner.getByRole("dialog", { name: "Cocokkan QRIS" });
  await expect(reconcile).toContainText("1 hari belum dicocokkan");
  await reconcile.getByRole("button", { name: /^Cocok \w+, 19 Nov$/ }).click();
  // Hari terakhir ditandai: lembar menutup sendiri (daftar kosong).
  await expect(reconcile).toBeHidden();
  await expect(owner.getByRole("button", { name: "Cocokkan" })).toHaveCount(0);
  await expect(
    owner.getByRole("link", { name: /QRIS belum dicocokkan/ }),
  ).toHaveCount(0);
});

test("pelunasan dobel: peringatan, Kembali tidak menyimpan dua kali", async ({
  page,
}) => {
  test.setTimeout(90_000);
  await openShift(page, RINA);
  const first = await startRepayment(page, {
    customer: "Bu Sari",
    amount: "50.000",
  });
  await first.getByLabel("UANG DITERIMA").fill("50.000");
  await first.getByRole("button", { name: "Simpan pelunasan" }).click();
  await page
    .getByRole("dialog", { name: "Pelunasan tersimpan", exact: true })
    .getByRole("button", { name: "Tutup" })
    .click();

  const second = await startRepayment(page, {
    customer: "Bu Sari",
    amount: "50.000",
  });
  await second.getByLabel("UANG DITERIMA").fill("50.000");
  await second.getByRole("button", { name: "Simpan pelunasan" }).click();
  const warn = page.getByRole("dialog", { name: "Pelunasan mungkin dobel" });
  await expect(warn).toContainText(
    /Pelunasan Rp50\.000 untuk Bu Sari sudah tercatat pukul \d\d\.\d\d/,
  );
  await expect(warn).toHaveCSS("opacity", "1");
  await expectNoA11yViolations(page);
  await warn.getByRole("button", { name: "Kembali" }).click();
  await expect(warn).toBeHidden();
  await second.getByRole("button", { name: "Tutup" }).first().click();

  await page.getByRole("button", { name: "Riwayat" }).click();
  const sheet = page.getByRole("dialog", { name: "Riwayat shift ini" });
  await expect(sheet.getByText("Pelunasan · Bu Sari")).toHaveCount(1);
});

test("Beranda memuat enam butir dan Lihat semua; tinjau langsung menaikkan butir berikutnya", async ({
  page,
  context,
}) => {
  test.setTimeout(90_000);
  await resetMock(page);
  const owner = await ownerPage(context, "/owner");
  const region = attentionOf(owner);
  const heading = region.getByRole("heading", { level: 2 });
  await expect(heading).toHaveText(/^Perlu perhatian · \d+$/);
  const total = Number(/(\d+)$/.exec((await heading.textContent()) ?? "")?.[1]);
  expect(total).toBeGreaterThan(6);
  // Enam baris butir + satu baris Lihat semua.
  await expect(region.getByRole("listitem")).toHaveCount(7);
  await region.getByRole("link", { name: `Lihat semua (${total})` }).click();

  await expect(
    owner.getByRole("heading", { name: "Perlu perhatian", level: 1 }),
  ).toBeVisible();
  await expect(owner.getByText(`${total} butir`)).toBeVisible();
  const rows = owner.getByRole("main").getByRole("listitem");
  await expect(rows).toHaveCount(total);
  const titleOf = async (i: number) =>
    (
      (await rows.nth(i).getByRole("link").innerText()).split("\n")[0] ?? ""
    ).trim();
  const seventh = await titleOf(6);

  // Tinjau satu butir kejadian langsung dari daftar.
  const review = owner
    .getByRole("button", { name: /^Tandai sudah ditinjau: / })
    .first();
  const reviewed = (await review.getAttribute("aria-label"))?.replace(
    "Tandai sudah ditinjau: ",
    "",
  );
  await review.click();
  await expect(owner.getByText("Ditandai sudah ditinjau")).toBeVisible();
  await expect(owner.getByText(`${total - 1} butir`)).toBeVisible();

  // Beranda: jumlah turun satu dan butir ke-7 naik ke enam teratas.
  await owner.goto("/owner");
  await expect(
    attentionOf(owner).getByRole("heading", { level: 2 }),
  ).toHaveText(`Perlu perhatian · ${total - 1}`);
  const rowsAfter = attentionOf(owner).getByRole("link");
  await expect(rowsAfter.filter({ hasText: reviewed ?? "—" })).toHaveCount(0);
  await expect(rowsAfter.filter({ hasText: seventh }).first()).toBeVisible();
});

/** axe setelah lembar/dialog selesai animasi (sudah tidak transparan). */
async function axeDialog(page: Page, dialog: Locator) {
  await expect(dialog).toBeVisible();
  await expect(dialog).toHaveCSS("opacity", "1");
  await expectNoA11yViolations(page);
}

test("axe: semua layar pemilik baru tanpa pelanggaran serius di 360 px", async ({
  page,
  context,
}) => {
  test.setTimeout(150_000);
  await resetMock(page);
  const owner = await ownerPage(context, "/owner");
  const check = async (path: string, ready: RegExp | string) => {
    await owner.goto(path);
    await expect(owner.getByText(ready).first()).toBeVisible();
    await expectNoA11yViolations(owner);
  };

  await check("/owner", /Perlu perhatian · \d+/);
  await check("/owner/perhatian", /\d+ butir/);
  await check("/owner/lainnya", "Pengaturan");
  for (const kind of [
    "batal_kas_keluar",
    "kas_keluar",
    "selisih_kas",
    "serah_terima",
    "shift_lama",
  ]) {
    await owner.goto(`/owner/pengecualian/${kind}`);
    await expect(owner.getByRole("heading", { level: 1 })).toBeVisible();
    await expectNoA11yViolations(owner);
  }

  // Shift & kas: daftar, lembar Ambil uang, rincian shift.
  await check("/owner/lainnya/shift", "Ambil uang dari laci");
  await owner.getByRole("button", { name: "Ambil uang dari laci" }).click();
  await axeDialog(
    owner,
    owner.getByRole("dialog", { name: "Ambil uang dari laci" }),
  );
  await owner.keyboard.press("Escape");
  await owner.getByRole("link", { name: "Hari sebelumnya" }).click();
  await owner
    .getByRole("main")
    .getByRole("list")
    .getByRole("link")
    .first()
    .click();
  await expect(owner.getByText("Uang seharusnya").first()).toBeVisible();
  await expectNoA11yViolations(owner);

  // QRIS harian: daftar, lembar hari, lembar Cocokkan.
  await check("/owner/lainnya/qris", "QRIS harian");
  await qrisDayRow(owner, /19 Nov/).click();
  await axeDialog(owner, owner.getByRole("dialog", { name: /^QRIS / }));
  await owner.keyboard.press("Escape");
  await owner.goto("/owner/perhatian");
  await owner.getByRole("button", { name: "Cocokkan" }).click();
  await axeDialog(owner, owner.getByRole("dialog", { name: "Cocokkan QRIS" }));

  // Akun kasir: daftar, detail, dialog nonaktif, Tambah kasir.
  await check("/owner/lainnya/kasir", "Tambah kasir");
  await owner.getByRole("button", { name: "Tambah kasir" }).click();
  await axeDialog(owner, owner.getByRole("dialog", { name: "Tambah kasir" }));
  await owner.keyboard.press("Escape");
  await owner.getByRole("link", { name: /Budi/ }).click();
  await expect(
    owner.getByRole("button", { name: "Nonaktifkan" }),
  ).toBeVisible();
  await expectNoA11yViolations(owner);
  await owner.getByRole("button", { name: "Nonaktifkan" }).click();
  await axeDialog(
    owner,
    owner.getByRole("alertdialog", { name: "Nonaktifkan Budi?" }),
  );

  // Pengaturan: daftar kelompok dan semua kelompok.
  await check("/owner/lainnya/pengaturan", "Nomor telepon pemilik");
  for (const bagian of [
    "toko",
    "kasir",
    "kasbon",
    "stok",
    "laporan",
    "perhatian",
    "telepon",
  ]) {
    await owner.goto(`/owner/lainnya/pengaturan/${bagian}`);
    await expect(owner.getByRole("button", { name: "Simpan" })).toBeVisible();
    await expectNoA11yViolations(owner);
  }
});

test("axe: dialog kasir baru di 1366x768 (kas keluar, batal kas keluar, serah terima, dobel)", async ({
  page,
}) => {
  test.setTimeout(120_000);
  await resetMock(page);
  await toOpeningScreen(page, RINA);
  // Layar buka shift: modal terisi + keterangan, lalu diubah → alasan wajib.
  await expect(page.getByText(/^Hitungan tutup shift /)).toBeVisible();
  await expectNoA11yViolations(page);
  await page
    .getByRole("textbox", { name: "Modal awal di laci" })
    .fill("195.000");
  await expect(
    page.getByRole("textbox", { name: "Alasan modal berbeda" }),
  ).toBeVisible();
  await expectNoA11yViolations(page);
  await page.getByRole("textbox", { name: "Alasan modal berbeda" }).fill("Tes");
  await page.getByRole("button", { name: "Buka shift" }).click();
  await expect(scanBox(page)).toBeVisible();

  await page.getByRole("button", { name: "Kas keluar" }).click();
  const expense = page.getByRole("dialog", { name: "Kas keluar dari laci" });
  await expense.getByLabel("Nominal").fill("20.000");
  await axeDialog(page, expense);
  await expense.getByLabel("Alasan").fill("Beli es batu");
  await expense.getByRole("button", { name: "Catat kas keluar" }).click();
  await expect(expense).toBeHidden();

  await page.getByRole("button", { name: "Riwayat" }).click();
  await expectNoA11yViolations(page);
  await page
    .getByRole("dialog", { name: "Riwayat shift ini" })
    .getByRole("button", { name: /^Batalkan kas keluar / })
    .click();
  await axeDialog(
    page,
    page.getByRole("dialog", { name: "Batalkan kas keluar Rp20.000?" }),
  );
});
