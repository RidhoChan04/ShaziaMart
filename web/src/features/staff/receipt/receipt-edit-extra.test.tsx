import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { toast } from "sonner";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockDb } from "@/mocks/db";
import { problem } from "@/mocks/handlers/respond";
import { post, receiptInput, staffLogin } from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
import { memoryDraftStore } from "../drafts/draft-store";
import {
  capturePuts,
  loginRina,
  NOW,
  renderForm,
  seedReceipt,
} from "./form-test-kit";

const RECEIPTS = "/api/staff/receipts";
const PAGE = "/staff/masuk/draf-1";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  toast.dismiss();
  server.events.removeAllListeners();
  vi.useRealTimers();
});

async function changeGula(user: ReturnType<typeof userEvent.setup>) {
  const row = (await screen.findByText("Gula Pasir")).closest("button");
  if (!row) throw new Error("tanpa baris Gula");
  await user.click(row);
  const sheet = await screen.findByRole("dialog", { name: "Ubah barang" });
  const qty = within(sheet).getByLabelText("Jumlah");
  await user.clear(qty);
  await user.type(qty, "48");
  await user.click(within(sheet).getByRole("button", { name: "Simpan baris" }));
}

test("Batal tanpa perubahan langsung ke daftar", async () => {
  await seedReceipt();
  const { router } = renderForm(memoryDraftStore(), PAGE);
  await userEvent
    .setup()
    .click(await screen.findByRole("button", { name: "Batal" }));
  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/staff/masuk"),
  );
});

test("Batal dengan perubahan → alertdialog 'Buang perubahan?'; 'Lanjut mengubah' mengembalikan fokus ke Batal; 'Buang perubahan' keluar", async () => {
  await seedReceipt();
  const { router } = renderForm(memoryDraftStore(), PAGE);
  const user = userEvent.setup();
  await changeGula(user);
  const batal = await screen.findByRole("button", { name: "Batal" });
  await user.click(batal);
  const dialog = await screen.findByRole("alertdialog");
  expect(within(dialog).getByText("Buang perubahan?")).toBeVisible();
  await user.click(
    within(dialog).getByRole("button", { name: "Lanjut mengubah" }),
  );
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  await waitFor(() => expect(batal).toHaveFocus());
  expect(router.state.location.pathname).toBe(PAGE);
  await user.click(batal);
  await user.click(
    within(await screen.findByRole("alertdialog")).getByRole("button", {
      name: "Buang perubahan",
    }),
  );
  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/staff/masuk"),
  );
});

test("pembayaran terkunci + 422 hanya galat pembayaran → pesan di bawah ringkasan pembayaran", async () => {
  await seedReceipt();
  server.use(
    http.put(`${RECEIPTS}/:id`, () =>
      problem(422, "VALIDATION", "Data nota tidak valid", {
        errors: [
          {
            lineId: null,
            field: "payment",
            message: "Cara bayar tidak bisa diubah — sudah dibayar",
          },
        ],
      }),
    ),
  );
  renderForm(memoryDraftStore(), PAGE);
  const user = userEvent.setup();
  await user.click(
    await screen.findByRole("button", { name: "Lanjut ke pembayaran" }),
  );
  await user.click(
    await screen.findByRole("button", { name: "Simpan perubahan" }),
  );
  expect(
    await screen.findByText("Cara bayar tidak bisa diubah — sudah dibayar"),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Simpan perubahan" }),
  ).toBeVisible();
});

test("nota milik pengguna lain → 'Data tidak ditemukan'", async () => {
  await loginRina(true);
  expect((await staffLogin("Budi", "654321")).status).toBe(200);
  expect((await post(RECEIPTS, receiptInput({ id: "nota-budi" }))).status).toBe(
    201,
  );
  await staffLogin("Rina");
  renderForm(memoryDraftStore(), "/staff/masuk/nota-budi");
  expect(await screen.findByText("Data tidak ditemukan")).toBeVisible();
});

test("R6: shift sudah tutup, nota bayar laci tetap bisa diubah dan tersimpan", async () => {
  await seedReceipt();
  mockDb.update((s) => {
    s.shift = null;
  });
  const puts = capturePuts();
  renderForm(memoryDraftStore(), PAGE);
  const user = userEvent.setup();
  await changeGula(user);
  await user.click(
    await screen.findByRole("button", { name: "Lanjut ke pembayaran" }),
  );
  await user.click(
    await screen.findByRole("button", { name: "Simpan perubahan" }),
  );
  expect(await screen.findByText("Perubahan tersimpan")).toBeVisible();
  expect(puts).toHaveLength(1);
  expect(
    mockDb.get().receipts.find((r) => r.id === "draf-1")?.lines[2]?.qty,
  ).toBe(48);
});

test("memuat nota → teks 'Memuat…' bukan halaman kosong", async () => {
  await seedReceipt();
  server.use(
    http.get(`${RECEIPTS}/:id`, async () => {
      await new Promise((r) => setTimeout(r, 300));
      return problem(404, "NOT_FOUND");
    }),
  );
  renderForm(memoryDraftStore(), PAGE);
  expect(await screen.findByText("Memuat…")).toBeVisible();
});
