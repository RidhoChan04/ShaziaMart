import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockDb } from "@/mocks/db";
import { jpegBytes, ownerLogin } from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
import { thinMarginPreview } from "@/mocks/reports/thin-margin";
import { renderApp } from "@/test/render-app";

type Sent = { method: string; url: string; body: unknown };
let sent: Sent[] = [];

beforeEach(async () => {
  sent = [];
  await ownerLogin();
  server.events.on("request:start", ({ request }) => {
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
  expect(screen.queryByRole("button", { name: "Simpan" })).toBeNull();
  await waitFor(() =>
    expect(screen.queryByLabelText("Nama toko")).not.toBeInTheDocument(),
  );
});
