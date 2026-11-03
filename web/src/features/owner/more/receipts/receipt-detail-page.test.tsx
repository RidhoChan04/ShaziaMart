import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { delay, HttpResponse, http } from "msw";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockDb } from "@/mocks/db";
import { ownerLogin } from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
import { renderApp } from "@/test/render-app";
import { editReceipt, RECEIPT_NOW, seedReceipt } from "@/test/seed-receipts";

const DETAIL = "/owner/lainnya/barang-masuk/draf-1";
const TITLE = "CV Sumber Rejeki · nota 2 Nov 2026";

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(RECEIPT_NOW);
  await seedReceipt();
  await ownerLogin();
});

afterEach(() => vi.useRealTimers());

const stockOf = (name: string): number => {
  const s = mockDb.get();
  const p = s.products.find((x) => x.name === name);
  if (!p) throw new Error(`seed tanpa ${name}`);
  return s.stock[p.id] ?? 0;
};

test("detail: judul, total, baris barang, 'Pembayaran', Riwayat 'Dicatat oleh Rina'; tanpa bagian 'Status' untuk bayar sekarang", async () => {
  renderApp(DETAIL);
  await screen.findByRole("heading", { level: 1, name: TITLE });
  expect(screen.getByText("Rp1.442.000")).toBeInTheDocument();
  expect(screen.getByText("Indomie Goreng")).toBeInTheDocument();
  expect(
    screen.getByText("2 dus × Rp112.000 · ED 20 Apr 2027"),
  ).toBeInTheDocument();
  expect(
    screen.getByText("Bayar sekarang · Tunai · Dari laci kasir"),
  ).toBeInTheDocument();
  expect(screen.getByText("Dicatat oleh Rina")).toBeInTheDocument();
  expect(screen.getByText("Hari ini 10.00")).toBeInTheDocument();
  expect(screen.queryByRole("heading", { name: "Status" })).toBeNull();
  expect(screen.getByRole("link", { name: /Barang masuk/ })).toHaveAttribute(
    "href",
    "/owner/lainnya/barang-masuk",
  );
});

test("bayar nanti: bagian 'Status' = 'Belum lunas'; setelah lunas 'Lunas 2 Nov 2026'", async () => {
  mockDb.update((s) => {
    const r = s.receipts[0];
    if (r) {
      r.payment = {
        timing: "nanti",
        method: null,
        cashSource: null,
        dueDate: "2026-11-16",
      };
    }
  });
  renderApp(DETAIL);
  await screen.findByRole("heading", { level: 1, name: TITLE });
  expect(
    screen.getByText("Bayar nanti · jatuh tempo 16 Nov 2026"),
  ).toBeInTheDocument();
  const status = screen.getByRole("region", { name: "Status" });
  expect(within(status).getByText("Belum lunas")).toBeInTheDocument();
});

test("setelah diubah: Riwayat 'Diubah oleh Rina' + 'Gula Pasir: jumlah 50 kg → 48 kg'", async () => {
  await editReceipt();
  renderApp(DETAIL);
  await screen.findByRole("heading", { level: 1, name: TITLE });
  expect(screen.getByText("Dicatat oleh Rina")).toBeInTheDocument();
  expect(screen.getByText("Diubah oleh Rina")).toBeInTheDocument();
  expect(
    screen.getByText("Gula Pasir: jumlah 50 kg → 48 kg"),
  ).toBeInTheDocument();
});

test("Batalkan nota → konfirmasi menyebut koreksi laci → batal: tanda 'Dibatalkan', tombol hilang, stok Indomie turun 80, fokus ke judul", async () => {
  const user = userEvent.setup();
  const before = stockOf("Indomie Goreng");
  renderApp(DETAIL);
  await screen.findByRole("heading", { level: 1, name: TITLE });
  await user.click(screen.getByRole("button", { name: "Batalkan nota" }));
  const dialog = await screen.findByRole("alertdialog", {
    name: "Batalkan nota ini?",
  });
  expect(dialog).toHaveTextContent(
    "Stok, HPP, dan utang nota ini dibalik. Tidak bisa diurungkan.",
  );
  expect(dialog).toHaveTextContent(
    "Uang Rp1.442.000 yang tadi keluar dari laci dicatat masuk lagi ke shift kasir yang sedang berjalan.",
  );
  await user.click(
    within(dialog).getByRole("button", { name: "Batalkan nota" }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
  );
  expect(await screen.findByText("Dibatalkan")).toBeInTheDocument();
  expect(screen.getByText("Dibatalkan oleh Pak Ahmad")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: "Batalkan nota" })).toBeNull();
  expect(stockOf("Indomie Goreng")).toBe(before - 80);
  expect(screen.getByRole("heading", { level: 1, name: TITLE })).toHaveFocus();
});

test("konfirmasi 'Kembali' menutup dialog tanpa membatalkan; fokus kembali ke tombol", async () => {
  const user = userEvent.setup();
  renderApp(DETAIL);
  await screen.findByRole("heading", { level: 1, name: TITLE });
  const trigger = screen.getByRole("button", { name: "Batalkan nota" });
  await user.click(trigger);
  const dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Kembali" }));
  await waitFor(() =>
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
  );
  expect(mockDb.get().receipts[0]?.status).toBe("aktif");
  await waitFor(() => expect(trigger).toHaveFocus());
});

test("Escape menutup konfirmasi tanpa membatalkan; fokus kembali ke tombol 'Batalkan nota'", async () => {
  const user = userEvent.setup();
  renderApp(DETAIL);
  await screen.findByRole("heading", { level: 1, name: TITLE });
  const trigger = screen.getByRole("button", { name: "Batalkan nota" });
  await user.click(trigger);
  await screen.findByRole("alertdialog");
  await user.keyboard("{Escape}");
  await waitFor(() =>
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
  );
  await waitFor(() => expect(trigger).toHaveFocus());
  expect(mockDb.get().receipts[0]?.status).toBe("aktif");
});

const CANCELLED_PROBLEM = {
  type: "about:blank",
  title: "Conflict",
  status: 409,
  code: "RECEIPT_CANCELLED",
  detail: "Nota ini sudah dibatalkan",
};
const PROBLEM_HEADERS = { "Content-Type": "application/problem+json" };

test("409 RECEIPT_CANCELLED: pesan 'Nota ini sudah dibatalkan' tampil sebagai alert di konfirmasi", async () => {
  const user = userEvent.setup();
  server.use(
    http.post("/api/owner/receipts/draf-1/cancel", () =>
      HttpResponse.json(CANCELLED_PROBLEM, {
        status: 409,
        headers: PROBLEM_HEADERS,
      }),
    ),
  );
  renderApp(DETAIL);
  await screen.findByRole("heading", { level: 1, name: TITLE });
  await user.click(screen.getByRole("button", { name: "Batalkan nota" }));
  const dialog = await screen.findByRole("alertdialog");
  await user.click(
    within(dialog).getByRole("button", { name: "Batalkan nota" }),
  );
  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    "Nota ini sudah dibatalkan",
  );
});

test("409 RECEIPT_CANCELLED (tab lain sudah membatalkan): detail dan daftar dimuat ulang, 'Batalkan nota' tak ditawarkan lagi", async () => {
  const user = userEvent.setup();
  renderApp(DETAIL);
  await screen.findByRole("heading", { level: 1, name: TITLE });
  await user.click(screen.getByRole("button", { name: "Batalkan nota" }));
  const dialog = await screen.findByRole("alertdialog");
  mockDb.update((s) => {
    const r = s.receipts[0];
    if (r) r.status = "dibatalkan";
  });
  server.use(
    http.post("/api/owner/receipts/draf-1/cancel", () =>
      HttpResponse.json(CANCELLED_PROBLEM, {
        status: 409,
        headers: PROBLEM_HEADERS,
      }),
    ),
  );
  await user.click(
    within(dialog).getByRole("button", { name: "Batalkan nota" }),
  );
  await waitFor(() =>
    expect(
      screen.queryByRole("button", { name: "Batalkan nota" }),
    ).not.toBeInTheDocument(),
  );
  expect(screen.getAllByText("Dibatalkan").length).toBeGreaterThan(0);
});

test("saat menunggu server: kedua tombol nonaktif, klik kedua tidak mengirim permintaan lagi", async () => {
  const user = userEvent.setup();
  let calls = 0;
  server.use(
    http.post("/api/owner/receipts/draf-1/cancel", async () => {
      calls += 1;
      await delay(300);
      return HttpResponse.json(CANCELLED_PROBLEM, {
        status: 409,
        headers: PROBLEM_HEADERS,
      });
    }),
  );
  renderApp(DETAIL);
  await screen.findByRole("heading", { level: 1, name: TITLE });
  await user.click(screen.getByRole("button", { name: "Batalkan nota" }));
  const dialog = await screen.findByRole("alertdialog");
  const confirm = within(dialog).getByRole("button", { name: "Batalkan nota" });
  await user.click(confirm);
  await waitFor(() => expect(confirm).toBeDisabled());
  expect(
    within(dialog).getByRole("button", { name: "Kembali" }),
  ).toBeDisabled();
  await user.click(confirm);
  fireEvent.click(confirm);
  await within(dialog).findByRole("alert");
  expect(calls).toBe(1);
});

test("R23: nota Bayar nanti yang dilunasi tunai dari laci → konfirmasi menyebut uang laci yang kembali", async () => {
  const user = userEvent.setup();
  mockDb.update((s) => {
    const r = s.receipts[0];
    if (r) {
      r.payment = {
        timing: "nanti",
        method: null,
        cashSource: null,
        dueDate: "2026-11-16",
      };
      r.paid = {
        at: RECEIPT_NOW,
        method: "tunai",
        cashSource: "laci",
        byName: "Pak Ahmad",
      };
    }
  });
  renderApp(DETAIL);
  await screen.findByRole("heading", { level: 1, name: TITLE });
  await user.click(screen.getByRole("button", { name: "Batalkan nota" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(dialog).toHaveTextContent(
    "Uang Rp1.442.000 yang tadi keluar dari laci",
  );
});

test("nota dibayar uang pemilik: konfirmasi tanpa kalimat koreksi laci", async () => {
  const user = userEvent.setup();
  mockDb.update((s) => {
    const r = s.receipts[0];
    if (r) {
      r.payment = {
        timing: "sekarang",
        method: "transfer",
        cashSource: null,
        dueDate: null,
      };
    }
  });
  renderApp(DETAIL);
  await screen.findByRole("heading", { level: 1, name: TITLE });
  await user.click(screen.getByRole("button", { name: "Batalkan nota" }));
  const dialog = await screen.findByRole("alertdialog");
  expect(dialog).not.toHaveTextContent("keluar dari laci");
  expect(dialog).toHaveTextContent("Tidak ada uang laci yang berubah.");
});

test("foto: ketuk 'Foto nota' → dialog dengan img alt 'Foto nota' src /api/owner/receipt-photos/{id}", async () => {
  const user = userEvent.setup();
  mockDb.update((s) => {
    const r = s.receipts[0];
    if (r) r.photoId = "foto-1";
  });
  renderApp(DETAIL);
  await screen.findByRole("heading", { level: 1, name: TITLE });
  await user.click(screen.getByRole("button", { name: /Foto nota/ }));
  const dialog = await screen.findByRole("dialog", { name: "Foto nota" });
  expect(within(dialog).getByAltText("Foto nota")).toHaveAttribute(
    "src",
    "/api/owner/receipt-photos/foto-1",
  );
});

test("nota tidak ada: 'Nota tidak ditemukan' dengan tautan kembali", async () => {
  renderApp("/owner/lainnya/barang-masuk/tidak-ada");
  expect(
    await screen.findByRole("heading", { name: "Nota tidak ditemukan" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Kembali ke barang masuk" }),
  ).toHaveAttribute("href", "/owner/lainnya/barang-masuk");
});
