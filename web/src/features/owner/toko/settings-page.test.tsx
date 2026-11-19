import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockDb } from "@/mocks/db";
import { jpegBytes, ownerLogin } from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
import { thinMarginPreview } from "@/mocks/reports/thin-margin";
import { renderApp } from "@/test/render-app";

type Sent = { method: string; url: string; body: unknown };
let sent: Sent[] = [];
let previews: string[] = [];

beforeEach(async () => {
  sent = [];
  previews = [];
  await ownerLogin();
  server.events.on("request:start", ({ request }) => {
    if (request.url.includes("/thin-margin-preview")) {
      previews.push(new URL(request.url).searchParams.get("permille") ?? "");
    }
    if (request.method === "PATCH" || request.method === "PUT") {
      void request
        .clone()
        .text()
        .then((text) => {
          let body: unknown = text;
          try {
            body = JSON.parse(text);
          } catch {
            // Bukan JSON (unggah gambar).
          }
          sent.push({ method: request.method, url: request.url, body });
        });
    }
  });
});

afterEach(() => {
  server.events.removeAllListeners();
  vi.restoreAllMocks();
});

/** jsdom tidak punya createObjectURL; pratinjau berkas memakainya. */
function stubObjectUrl(url: string) {
  URL.createObjectURL = vi.fn(() => url);
  URL.revokeObjectURL = vi.fn();
}

// Toast sonner bertahan antar-test; cukup ada satu yang tampil.
const savedToast = async () =>
  (await screen.findAllByText("Pengaturan disimpan")).length;

const patches = () =>
  sent.filter((s) => s.method === "PATCH").map((s) => s.body);

test("daftar kelompok dengan ringkasan nilai sekarang", async () => {
  renderApp("/owner/lainnya/pengaturan");
  await screen.findByText("Toko & struk");
  const links = screen
    .getAllByRole("link")
    .filter((l) => l.getAttribute("href")?.includes("/pengaturan/"));
  expect(links).toHaveLength(7);
  const byName = (name: RegExp) =>
    links.find((l) => name.test(l.textContent ?? ""));
  expect(byName(/^Kasbon/)).toHaveTextContent("Rp500.000");
  expect(byName(/^Laporan/)).toHaveTextContent("10%");
  expect(byName(/^Laporan/)).toHaveTextContent("30 hari");
  expect(byName(/^Nomor telepon/)).toHaveTextContent("0812-3456-7890");
  expect(byName(/^Perlu perhatian/)).toHaveTextContent("Rp5.000");
  expect(byName(/^Stok/)).toHaveTextContent("30 hari");
});

test("Kasbon mengirim PATCH hanya bagian credit dan menampilkan pesan", async () => {
  const user = userEvent.setup();
  renderApp("/owner/lainnya/pengaturan/kasbon");
  const field = await screen.findByLabelText("Limit kasbon pelanggan baru");
  await user.clear(field);
  await user.type(field, "750000");
  await user.click(screen.getByRole("button", { name: "Simpan" }));
  expect(await savedToast()).toBeGreaterThan(0);
  expect(patches()).toEqual([{ credit: { defaultCreditLimit: 750_000 } }]);
  expect(mockDb.get().defaultCreditLimit).toBe(750_000);
});

test("galat 422 server tampil di isian dan tidak menyimpan", async () => {
  const user = userEvent.setup();
  renderApp("/owner/lainnya/pengaturan/stok");
  const item = await screen.findByLabelText("Tahan selisih per barang di atas");
  await user.clear(item);
  await user.type(item, "300000");
  await user.click(screen.getByRole("button", { name: "Simpan" }));
  const alert = await screen.findByRole("alert");
  expect(alert).toHaveTextContent(
    "Batas selisih per barang tidak boleh melebihi batas per sesi",
  );
  expect(item).toHaveAttribute("aria-invalid", "true");
  expect(mockDb.get().stockRules.opnameItemLimit).toBe(100_000);
});

test("Laporan: persen menjadi permil dan pratinjau dari server", async () => {
  const user = userEvent.setup();
  renderApp("/owner/lainnya/pengaturan/laporan");
  const field = await screen.findByLabelText("Batas untung tipis");
  expect(field).toHaveValue("10");
  await user.clear(field);
  await user.type(field, "15");
  const expected = thinMarginPreview(mockDb.get(), 150);
  expect(
    await screen.findByText(
      `Dengan batas 15%: ${expected.flagged} dari ${expected.total} barang tertandai`,
    ),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Simpan" }));
  await savedToast();
  expect(patches()).toEqual([
    { report: { thinMarginPermille: 150, unsoldDays: 30 } },
  ]);
});

test("Perlu perhatian: sakelar Pencocokan QRIS harian menyala bawaan dan tersimpan", async () => {
  const user = userEvent.setup();
  renderApp("/owner/lainnya/pengaturan/perhatian");
  const toggle = await screen.findByRole("switch", {
    name: "Pencocokan QRIS harian",
  });
  expect(toggle).toBeChecked();
  expect(
    screen.getByText(
      "Bila dimatikan, butir QRIS belum dicocokkan tidak tampil di Perlu perhatian. Halaman QRIS harian tetap tersedia.",
    ),
  ).toBeInTheDocument();
  await user.click(toggle);
  await user.click(screen.getByRole("button", { name: "Simpan" }));
  await savedToast();
  expect(patches()).toEqual([
    {
      attention: {
        ...mockDb.get().attentionRules,
        qrisDailyReconcile: false,
      },
    },
  ]);
  expect(mockDb.get().attentionRules.qrisDailyReconcile).toBe(false);
});

test("nomor telepon pemilik boleh dikosongkan dan dikirim null", async () => {
  const user = userEvent.setup();
  renderApp("/owner/lainnya/pengaturan/telepon");
  const field = await screen.findByLabelText("Nomor telepon pemilik");
  expect(field).toHaveValue("0812-3456-7890");
  await user.clear(field);
  await user.click(screen.getByRole("button", { name: "Simpan" }));
  await savedToast();
  expect(patches()).toEqual([{ ownerPhone: null }]);
  expect(mockDb.get().settings.ownerPhone).toBeNull();
});

test("nomor telepon tidak valid: galat server tampil di isian", async () => {
  const user = userEvent.setup();
  renderApp("/owner/lainnya/pengaturan/telepon");
  const field = await screen.findByLabelText("Nomor telepon pemilik");
  await user.clear(field);
  await user.type(field, "12ab");
  await user.click(screen.getByRole("button", { name: "Simpan" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Nomor telepon 8–16 karakter",
  );
  expect(field).toHaveAttribute("aria-invalid", "true");
});

test("Toko: kirim bagian store utuh dan unggah gambar QRIS dengan pratinjau", async () => {
  const user = userEvent.setup();
  stubObjectUrl("blob:qris-pratinjau");
  renderApp("/owner/lainnya/pengaturan/toko");
  const name = await screen.findByLabelText("Nama toko");
  await user.clear(name);
  await user.type(name, "Toko Baru");
  await user.click(screen.getByRole("button", { name: "Simpan" }));
  await savedToast();
  const body = patches()[0] as { store: Record<string, string> };
  expect(Object.keys(body)).toEqual(["store"]);
  expect(body.store).toMatchObject({ name: "Toko Baru" });
  expect(Object.keys(body.store).sort()).toEqual([
    "address",
    "name",
    "receiptFooter",
  ]);

  const file = new File([jpegBytes(64) as BlobPart], "qris.jpg", {
    type: "image/jpeg",
  });
  await user.upload(screen.getByLabelText("Pilih gambar QRIS"), file);
  expect(screen.getByAltText("Pratinjau gambar QRIS baru")).toHaveAttribute(
    "src",
    "blob:qris-pratinjau",
  );
  await user.click(screen.getByRole("button", { name: "Unggah gambar QRIS" }));
  await waitFor(() =>
    expect(
      sent.some((s) => s.method === "PUT" && s.url.endsWith("/qris-image")),
    ).toBe(true),
  );
  expect(await screen.findByText("Gambar QRIS disimpan")).toBeInTheDocument();
  expect(mockDb.get().settings.qrisImageUrl).toContain("qris-");
});

test("unggah gambar QRIS yang ditolak server menampilkan galat", async () => {
  const user = userEvent.setup();
  stubObjectUrl("blob:x");
  renderApp("/owner/lainnya/pengaturan/toko");
  const file = new File(["bukan gambar"], "qris.png", { type: "image/png" });
  await user.upload(await screen.findByLabelText("Pilih gambar QRIS"), file);
  await user.click(screen.getByRole("button", { name: "Unggah gambar QRIS" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Gambar QRIS harus PNG atau JPEG",
  );
});

test("bagian yang tidak dikenal menampilkan halaman tidak ditemukan", async () => {
  renderApp("/owner/lainnya/pengaturan/lain");
  expect(
    await screen.findByText("Halaman tidak ditemukan"),
  ).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Simpan" })).toBeNull();
});

test("Laporan: pratinjau tidak menampilkan angka batas lama di bawah persen baru", async () => {
  const user = userEvent.setup();
  let release: () => void = () => undefined;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  server.use(
    http.get("/api/owner/settings/thin-margin-preview", async ({ request }) => {
      const p = new URL(request.url).searchParams.get("permille");
      if (p === "150") await gate;
      return HttpResponse.json(
        p === "150" ? { flagged: 7, total: 10 } : { flagged: 3, total: 10 },
      );
    }),
  );
  renderApp("/owner/lainnya/pengaturan/laporan");
  expect(
    await screen.findByText("Dengan batas 10%: 3 dari 10 barang tertandai"),
  ).toBeInTheDocument();
  const field = screen.getByLabelText("Batas untung tipis");
  await user.clear(field);
  await user.type(field, "15");
  await waitFor(() => expect(previews).toContain("150"));
  // Respons 15% belum tiba: tidak boleh ada kalimat 15% dengan angka 10%.
  expect(screen.queryByText(/Dengan batas 15%/)).toBeNull();
  expect(screen.queryByText(/3 dari 10/)).toBeNull();
  release();
  expect(
    await screen.findByText("Dengan batas 15%: 7 dari 10 barang tertandai"),
  ).toBeInTheDocument();
});

test("Laporan: beberapa ketikan beruntun hanya memicu satu permintaan pratinjau", async () => {
  const user = userEvent.setup();
  renderApp("/owner/lainnya/pengaturan/laporan");
  const field = await screen.findByLabelText("Batas untung tipis");
  await screen.findByText(/Dengan batas 10%/);
  previews = [];
  await user.clear(field);
  await user.type(field, "12");
  await screen.findByText(/Dengan batas 12%/);
  expect(previews).toEqual(["120"]);
});

test("Laporan: satu angka desimal dengan koma (12,5 → 125 permil)", async () => {
  const user = userEvent.setup();
  renderApp("/owner/lainnya/pengaturan/laporan");
  const field = await screen.findByLabelText("Batas untung tipis");
  await user.clear(field);
  await user.type(field, "12,5");
  await user.click(screen.getByRole("button", { name: "Simpan" }));
  await savedToast();
  expect(patches()).toEqual([
    { report: { thinMarginPermille: 125, unsoldDays: 30 } },
  ]);
});

test("Laporan: titik pada persen ditolak dengan pesan di isian dan tidak terkirim", async () => {
  const user = userEvent.setup();
  renderApp("/owner/lainnya/pengaturan/laporan");
  const field = await screen.findByLabelText("Batas untung tipis");
  await user.clear(field);
  await user.type(field, "1.5");
  expect(screen.getByText("Gunakan koma untuk desimal")).toBeInTheDocument();
  expect(field).toHaveAttribute("aria-invalid", "true");
  await user.click(screen.getByRole("button", { name: "Simpan" }));
  expect(patches()).toEqual([]);
  expect(field).toHaveFocus();
});

test("Laporan: permil tersimpan yang bukan kelipatan 10 tampil 12,5 tanpa galat", async () => {
  mockDb.update((s) => {
    s.reportRules.thinMarginPermille = 125;
  });
  renderApp("/owner/lainnya/pengaturan/laporan");
  const field = await screen.findByLabelText("Batas untung tipis");
  expect(field).toHaveValue("12,5");
  expect(field).not.toHaveAttribute("aria-invalid");
  await screen.findByText(/Dengan batas 12,5%/);
});

test("isian jam dan hari hanya menerima angka (titik dan koma ditolak)", async () => {
  const user = userEvent.setup();
  renderApp("/owner/lainnya/pengaturan/perhatian");
  const hours = await screen.findByLabelText("Shift dianggap kelamaan setelah");
  await user.clear(hours);
  await user.type(hours, "1.5");
  expect(screen.getByText("Isi dengan angka saja")).toBeInTheDocument();
  await user.clear(hours);
  await user.type(hours, "1,5");
  expect(screen.getByText("Isi dengan angka saja")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Simpan" }));
  expect(patches()).toEqual([]);
  expect(hours).toHaveFocus();
});

test("isian uang: titik hanya pemisah ribuan ('1.5' ditolak, '1.500' menjadi 1500)", async () => {
  const user = userEvent.setup();
  renderApp("/owner/lainnya/pengaturan/kasbon");
  const field = await screen.findByLabelText("Limit kasbon pelanggan baru");
  await user.clear(field);
  await user.type(field, "1.5");
  expect(
    screen.getByText("Isi dengan bilangan bulat, titik hanya untuk ribuan"),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Simpan" }));
  expect(patches()).toEqual([]);
  await user.clear(field);
  await user.type(field, "1.500");
  await user.click(screen.getByRole("button", { name: "Simpan" }));
  await savedToast();
  expect(patches()).toEqual([{ credit: { defaultCreditLimit: 1500 } }]);
});

test("galat server hilang saat isian diubah dan fokus pindah ke isian bermasalah", async () => {
  const user = userEvent.setup();
  renderApp("/owner/lainnya/pengaturan/stok");
  const days = await screen.findByLabelText("Segera kedaluwarsa dalam");
  const item = screen.getByLabelText("Tahan selisih per barang di atas");
  await user.clear(item);
  await user.type(item, "300000");
  await user.click(screen.getByRole("button", { name: "Simpan" }));
  await screen.findByRole("alert");
  expect(days).toHaveFocus();
  await user.type(days, "0");
  expect(screen.queryByRole("alert")).toBeNull();
});

test("setelah Simpan isian mengikuti nilai yang dinormalkan server", async () => {
  const user = userEvent.setup();
  renderApp("/owner/lainnya/pengaturan/toko");
  const name = await screen.findByLabelText("Nama toko");
  await user.clear(name);
  await user.type(name, "  Toko Rapi  ");
  await user.click(screen.getByRole("button", { name: "Simpan" }));
  await savedToast();
  await waitFor(() =>
    expect(screen.getByLabelText("Nama toko")).toHaveValue("Toko Rapi"),
  );
});

test("Kasir: pecahan curah diurai, galat lokal tampil dan tidak terkirim", async () => {
  const user = userEvent.setup();
  renderApp("/owner/lainnya/pengaturan/kasir");
  const fractions = await screen.findByLabelText("Pecahan curah");
  expect(fractions).toHaveValue("250, 500, 1000, 1500, 2000");
  await user.clear(fractions);
  await user.type(fractions, "250, 5x0");
  await user.click(screen.getByRole("button", { name: "Simpan" }));
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Isi pecahan dengan angka saja, dipisah koma",
  );
  expect(patches()).toEqual([]);
  expect(fractions).toHaveFocus();
  await user.clear(fractions);
  await user.type(fractions, "100, 300 ,900");
  expect(screen.queryByRole("alert")).toBeNull();
  await user.click(screen.getByRole("button", { name: "Simpan" }));
  await savedToast();
  const sentKasir = (patches()[0] as { kasir: { curahFractions: number[] } })
    .kasir;
  expect(sentKasir.curahFractions).toEqual([100, 300, 900]);
});

test("Kasir: memilih barang curah cepat dan sakelar masuk ke PATCH kasir", async () => {
  const user = userEvent.setup();
  renderApp("/owner/lainnya/pengaturan/kasir");
  const group = await screen.findByRole("group", { name: "Curah cepat" });
  const boxes = await within(group).findAllByRole("checkbox");
  expect(boxes.length).toBeGreaterThan(0);
  const first = boxes[0] as HTMLElement;
  expect(first).toBeChecked();
  await user.click(first);
  expect(first).not.toBeChecked();
  await user.click(
    screen.getByRole("switch", { name: "Cetak struk otomatis" }),
  );
  await user.click(screen.getByRole("button", { name: "Simpan" }));
  await savedToast();
  const before = mockDb.get().settings;
  const body = patches()[0] as {
    kasir: { autoPrint: boolean; quickCurahProductIds: string[] };
  };
  expect(Object.keys(body)).toEqual(["kasir"]);
  expect(body.kasir.autoPrint).toBe(false);
  expect(body.kasir.quickCurahProductIds).toHaveLength(boxes.length - 1);
  expect(before.autoPrint).toBe(false);
});

test("bagian dibuka langsung: tombol kembali menuju daftar Pengaturan", async () => {
  renderApp("/owner/lainnya/pengaturan/kasbon");
  await screen.findByLabelText("Limit kasbon pelanggan baru");
  expect(screen.getByRole("link", { name: "Pengaturan" })).toHaveAttribute(
    "href",
    "/owner/lainnya/pengaturan",
  );
});
