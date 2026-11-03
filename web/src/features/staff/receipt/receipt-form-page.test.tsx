import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { loginWithShift, staffLogin } from "@/mocks/handlers/test-helpers";
import { memoryDraftStore } from "../drafts/draft-store";
import { compressPhoto } from "./compress-photo";
import {
  DRAFT_ID,
  makeDraft,
  NOW,
  renderForm,
  storeWithDraft,
} from "./form-test-kit";

vi.mock("./compress-photo", () => ({ compressPhoto: vi.fn() }));

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  await loginWithShift(1_500_000);
  expect((await staffLogin()).status).toBe(200);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

const search = (r: { state: { location: { search: unknown } } }) =>
  r.state.location.search as { draf?: string; langkah?: string };

test("nota: judul, keterangan draf, tanggal hari ini, tiga baris mockup dan total berjalan", async () => {
  renderForm(await storeWithDraft());
  expect(
    await screen.findByRole("heading", { level: 1, name: "Barang masuk" }),
  ).toBeInTheDocument();
  expect(screen.getByText("Draf tersimpan di HP")).toBeInTheDocument();
  expect(screen.getByLabelText("Supplier")).toHaveValue("CV Sumber Rejeki");
  const date = screen.getByLabelText("Tanggal nota");
  expect(date).toHaveValue("2026-11-02");
  expect(date).toHaveAttribute("max", "2026-11-02");
  expect(screen.getByText("3 baris")).toBeInTheDocument();
  expect(
    screen.getByText("2 dus × Rp112.000 · ED 20 Apr 2027"),
  ).toBeInTheDocument();
  expect(screen.getByText("Rp224.000")).toBeInTheDocument();
  expect(screen.getByText("Total berjalan")).toBeInTheDocument();
  expect(screen.getByText("Rp1.442.000")).toBeInTheDocument();
});

test("tanpa ?draf= → draf baru dibuat di HP, alamat memuat draf, tanggal nota hari ini", async () => {
  const store = memoryDraftStore();
  const { router } = renderForm(store, "/staff/masuk/baru");
  await waitFor(() => expect(search(router).draf).toBeTruthy());
  const saved = await store.get(search(router).draf ?? "");
  expect(saved?.status).toBe("editing");
  expect(saved?.form.notaDate).toBe("2026-11-02");
  expect(await screen.findByLabelText("Tanggal nota")).toHaveValue(
    "2026-11-02",
  );
  expect(await store.list()).toHaveLength(1);
});

test("draf milik orang lain → dibuat draf baru, draf lain tak tersentuh", async () => {
  const store = memoryDraftStore();
  await store.put({ ...makeDraft(), userId: "orang-lain" });
  const { router } = renderForm(store);
  await waitFor(() => expect(search(router).draf).not.toBe(DRAFT_ID));
  expect((await store.get(DRAFT_ID))?.userId).toBe("orang-lain");
});

test("autosave: ketik supplier → setelah 300 ms draf di store memuat supplierName", async () => {
  const store = await storeWithDraft({ lines: [], supplierName: "" });
  renderForm(store);
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Supplier"), "CV Sumber Rejeki");
  await waitFor(async () =>
    expect((await store.get(DRAFT_ID))?.form.supplierName).toBe(
      "CV Sumber Rejeki",
    ),
  );
});

test("foto dikompres (219_136 byte) → '1 lembar', 'Diambil 12.00 · 214 KB'; sebelumnya 'Belum ada foto'", async () => {
  vi.mocked(compressPhoto).mockResolvedValue({
    blob: new Blob(["x"], { type: "image/jpeg" }),
    bytes: 219_136,
  });
  const store = await storeWithDraft();
  renderForm(store);
  const user = userEvent.setup();
  expect(await screen.findByText("Belum ada foto")).toBeInTheDocument();
  const input = screen.getByLabelText("Foto nota");
  expect(input).toHaveAttribute("capture", "environment");
  expect(input).toHaveAttribute("accept", "image/*");
  await user.upload(
    input,
    new File(["raw"], "nota.jpg", { type: "image/jpeg" }),
  );
  expect(await screen.findByText("1 lembar")).toBeInTheDocument();
  expect(screen.getByText("Diambil 12.00 · 214 KB")).toBeInTheDocument();
  await waitFor(async () => {
    const photo = (await store.get(DRAFT_ID))?.photo;
    expect(photo?.bytes).toBe(219_136);
    expect(photo?.uploaded).toBe(false);
  });
});

test("foto tak terbaca → pesan galat, tetap 'Belum ada foto'", async () => {
  vi.mocked(compressPhoto).mockRejectedValue(new Error("tidak terbaca"));
  renderForm(await storeWithDraft());
  const user = userEvent.setup();
  await user.upload(
    await screen.findByLabelText("Foto nota"),
    new File(["x"], "a.jpg", { type: "image/jpeg" }),
  );
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Foto tidak bisa dibaca",
  );
  expect(screen.getByText("Belum ada foto")).toBeInTheDocument();
});

test("Lanjut tanpa supplier & baris → 'Supplier belum diisi', 'Belum ada barang di nota'; tetap di langkah nota", async () => {
  const { router } = renderForm(
    await storeWithDraft({ lines: [], supplierName: "" }),
  );
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Lanjut ke pembayaran" }),
  );
  expect(await screen.findByText("Supplier belum diisi")).toBeInTheDocument();
  expect(screen.getByText("Belum ada barang di nota")).toBeInTheDocument();
  expect(search(router).langkah).toBeUndefined();
});

test("Lanjut dengan nota lengkap → langkah bayar", async () => {
  const { router } = renderForm(await storeWithDraft());
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Lanjut ke pembayaran" }),
  );
  await screen.findByRole("heading", { name: "Pembayaran" });
  expect(search(router).langkah).toBe("bayar");
});

test("ubah baris lewat lembar → subtotal baru, fokus kembali ke baris; Hapus baris", async () => {
  renderForm(await storeWithDraft());
  const user = userEvent.setup();
  const row = (await screen.findByText("Indomie Goreng")).closest("button");
  if (!row) throw new Error("tanpa baris");
  await user.click(row);
  const sheet = await screen.findByRole("dialog", { name: "Ubah barang" });
  const qty = within(sheet).getByLabelText("Jumlah");
  await user.clear(qty);
  await user.type(qty, "3");
  await user.click(within(sheet).getByRole("button", { name: "Simpan baris" }));
  expect(await screen.findByText("Rp336.000")).toBeInTheDocument();
  expect(screen.getByText("Rp1.554.000")).toBeInTheDocument();
  await waitFor(() => expect(row).toHaveFocus());
  await user.click(row);
  await user.click(await screen.findByRole("button", { name: "Hapus baris" }));
  await waitFor(() => expect(screen.queryByText("Indomie Goreng")).toBeNull());
  expect(screen.getByText("2 baris")).toBeInTheDocument();
});

test("Batal → 'Buang draf ini?' → Simpan draf: draf tetap 'editing', kembali ke daftar", async () => {
  const store = await storeWithDraft();
  const { router } = renderForm(store);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Batal" }));
  expect(await screen.findByText("Buang draf ini?")).toBeInTheDocument();
  expect(
    screen.getByText("Draf barang masuk ini akan dihapus dari HP."),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Simpan draf" }));
  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/staff/masuk"),
  );
  expect((await store.get(DRAFT_ID))?.status).toBe("editing");
});

test("Batal → Buang draf: draf terhapus, kembali ke daftar", async () => {
  const store = await storeWithDraft();
  const { router } = renderForm(store);
  const user = userEvent.setup();
  await user.click(await screen.findByRole("button", { name: "Batal" }));
  await user.click(await screen.findByRole("button", { name: "Buang draf" }));
  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/staff/masuk"),
  );
  expect(await store.get(DRAFT_ID)).toBeUndefined();
});

test("dialog Batal ditutup lewat Escape → fokus kembali ke tombol Batal", async () => {
  renderForm(await storeWithDraft());
  const user = userEvent.setup();
  const batal = await screen.findByRole("button", { name: "Batal" });
  await user.click(batal);
  await screen.findByText("Buang draf ini?");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(batal).toHaveFocus());
});

test("penyimpanan HP gagal → banner; Simpan draf menolak dan formulir tetap terbuka", async () => {
  const base = await storeWithDraft();
  const store = {
    ...base,
    put: vi.fn().mockRejectedValue(new Error("kuota penuh")),
  };
  const { router } = renderForm(store);
  const user = userEvent.setup();
  await user.type(await screen.findByLabelText("Supplier"), "x");
  await user.click(screen.getByRole("button", { name: "Batal" }));
  await user.click(await screen.findByRole("button", { name: "Simpan draf" }));
  expect(
    await screen.findByText(/Gagal menyimpan draf di HP/),
  ).toBeInTheDocument();
  expect(
    screen.getByText(/Draf tidak bisa disimpan di HP/),
  ).toBeInTheDocument();
  expect(router.state.location.pathname).toBe("/staff/masuk/baru");
});
