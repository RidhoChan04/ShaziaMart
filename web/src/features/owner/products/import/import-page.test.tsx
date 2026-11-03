import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { mockDb } from "@/mocks/db";
import { ownerLogin } from "@/mocks/handlers/test-helpers";
import fixtureUrl from "@/test/fixtures/data-barang-contoh.xlsx?inline";
import { renderApp } from "@/test/render-app";
import { dataUrlBytes, makeXlsx } from "@/test/xlsx";

const XLSX_TYPE =
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

beforeEach(async () => {
  await ownerLogin();
});

const fixtureFile = () =>
  new File([dataUrlBytes(fixtureUrl)], "data-barang-contoh.xlsx", {
    type: XLSX_TYPE,
  });

async function openImport() {
  const user = userEvent.setup();
  const utils = renderApp("/owner/barang/impor");
  await screen.findByRole("heading", { level: 1, name: "Impor dari Excel" });
  return { user, ...utils };
}

const fileInput = () => screen.getByLabelText<HTMLInputElement>("Pilih file");

async function pick(user: ReturnType<typeof userEvent.setup>, file: File) {
  await user.upload(fileInput(), file);
}

/** Baris tabel pratinjau untuk nomor baris Excel `n`. */
function previewRow(n: number) {
  const header = within(screen.getByRole("table")).getByRole("rowheader", {
    name: String(n),
  });
  const row = header.closest("tr");
  if (!row) throw new Error(`baris ${n} tidak ada`);
  return within(row);
}

/** Teks ringkasan yang terpecah (angka besar + label) dalam satu paragraf. */
const tileText = (text: string) => (_: string, el: Element | null) =>
  el?.tagName === "P" && el.textContent === text;

const bodyRows = () =>
  within(screen.getByRole("table")).getAllByRole("row").slice(1);

const currentStep = () =>
  screen
    .getByRole("list", { name: "Langkah impor" })
    .querySelector('[aria-current="step"]')?.textContent;

test("halaman: pilih fixture → '3 baris siap', '1 akan diperbarui', '6 perlu diperbaiki'; baris 5 'Perbaiki' 'Harga jual di bawah modal (Rp34.000)'; baris 14 satuan besar 'Karung isi 25 · Rp340.000'", async () => {
  const { user } = await openImport();
  expect(currentStep()).toBe("1Pilih file");
  expect(fileInput()).toHaveAttribute("accept", `.xlsx,${XLSX_TYPE}`);

  await pick(user, fixtureFile());
  await screen.findByRole("table");
  expect(currentStep()).toBe("2Periksa");

  expect(screen.getByText("data-barang-contoh.xlsx")).toBeInTheDocument();
  expect(screen.getByText("11 baris · 27 KB")).toBeInTheDocument();
  const summary = within(screen.getByRole("region", { name: "Ringkasan" }));
  expect(summary.getByText(tileText("3 baris siap"))).toBeInTheDocument();
  expect(summary.getByText(tileText("1 akan diperbarui"))).toBeInTheDocument();
  expect(summary.getByText(tileText("6 perlu diperbaiki"))).toBeInTheDocument();
  expect(summary.getAllByText("akan diimpor")).toHaveLength(2);
  expect(summary.getByText("dilewati")).toBeInTheDocument();
  expect(screen.getByText("Urut sesuai baris di Excel")).toBeInTheDocument();
  expect(
    screen.getByText(
      "Baris bermasalah dilewati — perbaiki di Excel lalu impor ulang",
    ),
  ).toBeInTheDocument();

  const headers = within(screen.getByRole("table"))
    .getAllByRole("columnheader")
    .map((h) => h.textContent);
  expect(headers).toEqual([
    "Baris",
    "Status",
    "Nama",
    "Dijual per",
    "Harga jual",
    "Satuan besar",
    "Masalah",
  ]);

  // Baris = nomor baris Excel (data mulai baris 3, baris 9 kosong tidak tampil).
  expect(bodyRows().map((r) => r.querySelector("th")?.textContent)).toEqual([
    "3",
    "4",
    "5",
    "6",
    "7",
    "8",
    "10",
    "11",
    "12",
    "13",
    "14",
  ]);

  const row3 = previewRow(3);
  expect(row3.getByText("Siap")).toBeInTheDocument();
  expect(row3.getByText("Teh Kotak Jasmine 300 ml")).toBeInTheDocument();
  expect(row3.getByText("botol")).toBeInTheDocument();
  expect(row3.getByText("Rp4.000")).toBeInTheDocument();
  expect(row3.getByText("Dus isi 24 · Rp84.000")).toBeInTheDocument();

  const row4 = previewRow(4);
  expect(row4.getByText("Akan diperbarui")).toBeInTheDocument();
  expect(row4.getByText(/^Harga modal Rp16\.500 → Rp17\.000/)).toHaveClass(
    "text-muted",
  );

  const row5 = previewRow(5);
  expect(row5.getByText("Perbaiki")).toBeInTheDocument();
  const problem = row5.getByText("Harga jual di bawah modal (Rp34.000)");
  expect(problem).toHaveClass("text-danger-ink");
  expect(row5.getByText("Rp33.000")).toBeInTheDocument();
  expect(row5.getAllByText("—")).toHaveLength(1);

  expect(
    previewRow(6).getByText("Barcode sudah dipakai: Indomie Goreng"),
  ).toBeInTheDocument();
  expect(
    previewRow(8).getByText("Sudah ada, tidak berubah"),
  ).toBeInTheDocument();
  expect(previewRow(8).getAllByText("—")).toHaveLength(2);

  const row13 = previewRow(13);
  expect(row13.getByText("Perbaiki")).toBeInTheDocument();
  expect(row13.getByText("Nama sama dengan baris lain")).toBeInTheDocument();

  expect(
    previewRow(14).getByText("Karung isi 25 · Rp340.000"),
  ).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Impor 4 barang" })).toBeEnabled();
});

test("filter 'Perlu diperbaiki 6' → 6 baris; 'Semua 11' → 11", async () => {
  const { user } = await openImport();
  await pick(user, fixtureFile());
  const all = await screen.findByRole("button", { name: "Semua 11" });
  expect(all).toHaveAttribute("aria-pressed", "true");
  expect(bodyRows()).toHaveLength(11);

  const fix = screen.getByRole("button", { name: "Perlu diperbaiki 6" });
  await user.click(fix);
  expect(fix).toHaveAttribute("aria-pressed", "true");
  expect(all).toHaveAttribute("aria-pressed", "false");
  expect(bodyRows()).toHaveLength(6);
  expect(bodyRows().map((r) => r.querySelector("th")?.textContent)).toEqual([
    "5",
    "6",
    "7",
    "11",
    "12",
    "13",
  ]);
  for (const row of bodyRows()) {
    expect(within(row).getByText("Perbaiki")).toBeInTheDocument();
  }

  await user.click(all);
  expect(bodyRows()).toHaveLength(11);
});

test("Impor 4 barang → toast '3 barang baru, 1 diperbarui' → daftar memuat 'Teh Kotak Jasmine 300 ml' dengan 'Stok belum dihitung'", async () => {
  const { user, router } = await openImport();
  await pick(user, fixtureFile());
  await user.click(
    await screen.findByRole("button", { name: "Impor 4 barang" }),
  );

  expect(
    await screen.findByText("3 barang baru, 1 diperbarui"),
  ).toBeInTheDocument();
  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/owner/barang"),
  );
  const teh = await screen.findByRole("link", {
    name: /^Teh Kotak Jasmine 300 ml Stok belum dihitung/,
  });
  expect(within(teh).getByText("Stok belum dihitung")).toBeInTheDocument();

  const names = mockDb.get().products.map((p) => p.name);
  expect(names).toContain("Beras Cianjur");
  expect(names).toContain("Gas Elpiji 3 kg");
  expect(names).not.toContain("Beras Pandan Wangi curah");
  expect(names.filter((n) => n === "Sabun Batang Giv 72 g")).toHaveLength(0);
});

test("Ganti file → kembali ke langkah Pilih file; file 6 MB → 'File terlalu besar (maks. 5 MB)'", async () => {
  const { user } = await openImport();
  await pick(user, fixtureFile());
  await user.click(await screen.findByRole("button", { name: "Ganti file" }));

  expect(screen.queryByRole("table")).toBeNull();
  expect(currentStep()).toBe("1Pilih file");

  const big = new File([new Uint8Array(6 * 1024 * 1024)], "besar.xlsx", {
    type: XLSX_TYPE,
  });
  const read = vi.spyOn(big, "arrayBuffer");
  await pick(user, big);
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "File terlalu besar (maks. 5 MB)",
  );
  expect(read).not.toHaveBeenCalled();
  expect(screen.queryByRole("table")).toBeNull();
});

test("file bukan xlsx → 'File ini bukan file .xlsx yang bisa dibaca'; workbook tanpa baris barang → 'Tidak ada baris barang di file ini'", async () => {
  const { user } = await openImport();
  await pick(
    user,
    new File(["Nama;Harga\nIndomie;3500"], "data.xlsx", { type: XLSX_TYPE }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "File ini bukan file .xlsx yang bisa dibaca",
  );

  const empty = await makeXlsx({
    rows: `<row r="2"><c r="B2" t="inlineStr"><is><t>Nama barang *</t></is></c></row>`,
  });
  await pick(user, new File([empty], "kosong.xlsx", { type: XLSX_TYPE }));
  await waitFor(() =>
    expect(screen.getByRole("alert")).toHaveTextContent(
      "Tidak ada baris barang di file ini",
    ),
  );
  expect(screen.queryByRole("table")).toBeNull();
});

test("C6: barcode yang tersimpan sebagai angka → 'Perbaiki' dengan pesan ubah ke Teks, tidak ikut diimpor walau server menganggapnya siap", async () => {
  const { user } = await openImport();
  const data = await makeXlsx({
    rows: `<row r="3"><c r="B3" t="inlineStr"><is><t>Teh Kotak Jasmine 300 ml</t></is></c><c r="D3" t="inlineStr"><is><t>botol</t></is></c><c r="E3"><v>8996001600276</v></c><c r="G3"><v>4000</v></c></row>
<row r="4"><c r="B4" t="inlineStr"><is><t>Gas Elpiji 3 kg</t></is></c><c r="D4" t="inlineStr"><is><t>buah</t></is></c><c r="G4"><v>22000</v></c></row>`,
  });
  await pick(user, new File([data], "angka.xlsx", { type: XLSX_TYPE }));
  await screen.findByRole("table");

  const row3 = previewRow(3);
  expect(row3.getByText("Perbaiki")).toBeInTheDocument();
  expect(
    row3.getByText("Barcode tersimpan sebagai angka — ubah kolom ke Teks"),
  ).toBeInTheDocument();
  expect(previewRow(4).getByText("Siap")).toBeInTheDocument();
  const summary = within(screen.getByRole("region", { name: "Ringkasan" }));
  expect(summary.getByText(tileText("1 baris siap"))).toBeInTheDocument();
  expect(summary.getByText(tileText("1 perlu diperbaiki"))).toBeInTheDocument();

  await user.click(screen.getByRole("button", { name: "Impor 1 barang" }));
  expect(
    await screen.findByText("1 barang baru, 0 diperbarui"),
  ).toBeInTheDocument();
  const names = mockDb.get().products.map((p) => p.name);
  expect(names).toContain("Gas Elpiji 3 kg");
  expect(names).not.toContain("Teh Kotak Jasmine 300 ml");
});

test("tanpa baris yang bisa diimpor → tombol 'Impor 0 barang' nonaktif; Batal kembali ke daftar", async () => {
  const { user, router } = await openImport();
  const data = await makeXlsx({
    rows: `<row r="3"><c r="B3" t="inlineStr"><is><t>Tanpa harga</t></is></c><c r="D3" t="inlineStr"><is><t>pcs</t></is></c></row>`,
  });
  await pick(user, new File([data], "salah.xlsx", { type: XLSX_TYPE }));
  expect(
    await screen.findByRole("button", { name: "Impor 0 barang" }),
  ).toBeDisabled();
  expect(previewRow(3).getByText("Harga jual belum diisi")).toBeInTheDocument();

  await user.click(screen.getByRole("link", { name: "Batal" }));
  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/owner/barang"),
  );
});

test("jumlah baris yang tampil diumumkan; filter 'Perlu diperbaiki' tanpa hasil → keterangan kosong, bukan tabel kosong", async () => {
  const { user } = await openImport();
  const data = await makeXlsx({
    rows: `<row r="3"><c r="B3" t="inlineStr"><is><t>Kerupuk Udang</t></is></c><c r="D3" t="inlineStr"><is><t>pcs</t></is></c><c r="F3"><v>1500</v></c><c r="G3"><v>2000</v></c></row>`,
  });
  await pick(user, new File([data], "rapi.xlsx", { type: XLSX_TYPE }));
  await screen.findByRole("button", { name: "Semua 1" });
  expect(screen.getByRole("status")).toHaveTextContent("Menampilkan 1 baris");

  await user.click(screen.getByRole("button", { name: "Perlu diperbaiki 0" }));
  expect(screen.getByRole("status")).toHaveTextContent("Menampilkan 0 baris");
  expect(screen.queryByRole("table")).toBeNull();
  expect(
    screen.getByText("Tidak ada baris yang perlu diperbaiki"),
  ).toBeInTheDocument();
});
