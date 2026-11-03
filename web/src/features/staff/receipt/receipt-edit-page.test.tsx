import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { toast } from "sonner";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockDb } from "@/mocks/db";
import { problem } from "@/mocks/handlers/respond";
import { server } from "@/mocks/node";
import { setScenario } from "@/mocks/scenarios";
import { getGetHealthQueryKey } from "@/shared/api/gen/system/system";
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
const OVERFLOW = "Angka terlalu besar — periksa jumlah dan harga beli";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  toast.dismiss();
  server.events.removeAllListeners();
  vi.useRealTimers();
});

const toPayment = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(
    await screen.findByRole("button", { name: "Lanjut ke pembayaran" }),
  );

async function editGulaTo48(user: ReturnType<typeof userEvent.setup>) {
  const row = (await screen.findByText("Gula Pasir")).closest("button");
  if (!row) throw new Error("tanpa baris Gula");
  await user.click(row);
  const sheet = await screen.findByRole("dialog", { name: "Ubah barang" });
  expect(
    within(sheet).queryByRole("button", { name: "Ganti barang" }),
  ).toBeNull();
  expect(
    within(sheet).queryByRole("button", { name: "Hapus baris" }),
  ).toBeNull();
  const qty = within(sheet).getByLabelText("Jumlah");
  await user.clear(qty);
  await user.type(qty, "48");
  await user.click(within(sheet).getByRole("button", { name: "Simpan baris" }));
  return row;
}

test("ubah: tanpa Tambah barang dan foto; Gula 50 jadi 48 → total berjalan Rp1.409.600, fokus kembali ke baris", async () => {
  await seedReceipt();
  renderForm(memoryDraftStore(), PAGE);
  const user = userEvent.setup();
  expect(await screen.findByText("Gula Pasir")).toBeVisible();
  expect(screen.queryByRole("button", { name: "Tambah barang" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Foto nota" })).toBeNull();
  expect(screen.getByText("Rp1.442.000")).toBeVisible();
  const row = await editGulaTo48(user);
  expect(await screen.findByText("Rp1.409.600")).toBeVisible();
  await waitFor(() => expect(row).toHaveFocus());
});

test("Simpan perubahan → PUT dengan 3 baris (Gula 48) dan pembayaran sama; toast; kembali ke daftar", async () => {
  await seedReceipt();
  const puts = capturePuts();
  const { router } = renderForm(memoryDraftStore(), PAGE);
  const user = userEvent.setup();
  await editGulaTo48(user);
  await toPayment(user);
  await user.click(
    await screen.findByRole("button", { name: "Simpan perubahan" }),
  );
  expect(await screen.findByText("Perubahan tersimpan")).toBeVisible();
  await waitFor(() =>
    expect(router.state.location.pathname).toBe("/staff/masuk"),
  );
  expect(puts).toEqual([
    {
      supplierName: "CV Sumber Rejeki",
      notaDate: "2026-11-02",
      lines: [
        { lineId: "l1", qty: 2, unitCost: 112_000, expiryDate: "2027-04-20" },
        { lineId: "l2", qty: 12, unitCost: 34_000, expiryDate: null },
        { lineId: "l3", qty: 48, unitCost: 16_200, expiryDate: null },
      ],
      payment: {
        timing: "sekarang",
        method: "tunai",
        cashSource: "laci",
        dueDate: null,
      },
    },
  ]);
  const saved = mockDb.get().receipts.find((r) => r.id === "draf-1");
  expect(saved?.lines.find((l) => l.lineId === "l3")?.qty).toBe(48);
});

test("nota sekarang: pembayaran hanya-baca, tanpa isian", async () => {
  await seedReceipt();
  renderForm(memoryDraftStore(), PAGE);
  await toPayment(userEvent.setup());
  expect(
    await screen.findByText("Bayar sekarang · Tunai · Dari laci kasir"),
  ).toBeVisible();
  expect(screen.queryByRole("radiogroup")).toBeNull();
  expect(screen.queryByRole("button", { name: "30 hari" })).toBeNull();
});

test("nota nanti belum lunas: chip jatuh tempo bisa diubah dan terkirim di PUT", async () => {
  await seedReceipt({
    id: "draf-2",
    payment: {
      timing: "nanti",
      method: null,
      cashSource: null,
      dueDate: "2026-11-16",
    },
  });
  const puts = capturePuts();
  renderForm(memoryDraftStore(), "/staff/masuk/draf-2");
  const user = userEvent.setup();
  await toPayment(user);
  await user.click(await screen.findByRole("button", { name: "30 hari" }));
  await user.click(screen.getByRole("button", { name: "Simpan perubahan" }));
  expect(await screen.findByText("Perubahan tersimpan")).toBeVisible();
  expect(puts[0]).toMatchObject({
    payment: {
      timing: "nanti",
      method: null,
      cashSource: null,
      dueDate: "2026-12-02",
    },
  });
});

test("offline → Simpan perubahan nonaktif + catatan", async () => {
  await seedReceipt();
  const { queryClient } = renderForm(memoryDraftStore(), PAGE);
  await toPayment(userEvent.setup());
  expect(
    await screen.findByRole("button", { name: "Simpan perubahan" }),
  ).toBeEnabled();
  setScenario("server-mati");
  await act(() =>
    queryClient.refetchQueries({ queryKey: getGetHealthQueryKey() }),
  );
  expect(
    await screen.findByText(
      "Perlu tersambung ke toko untuk menyimpan perubahan",
    ),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Simpan perubahan" }),
  ).toBeDisabled();
});

test("nota dibatalkan → tanda Dibatalkan, isi hanya-baca, tanpa tombol simpan", async () => {
  await seedReceipt();
  mockDb.update((s) => {
    for (const r of s.receipts) r.status = "dibatalkan";
  });
  renderForm(memoryDraftStore(), PAGE);
  expect(await screen.findByText("Dibatalkan")).toBeVisible();
  expect(screen.getByText("Gula Pasir")).toBeVisible();
  expect(
    screen.getByText("Bayar sekarang · Tunai · Dari laci kasir"),
  ).toBeVisible();
  expect(screen.queryByRole("button", { name: /Simpan|Lanjut/ })).toBeNull();
});

test("PUT 409 RECEIPT_CANCELLED → 'Nota ini sudah dibatalkan', simpan dikunci", async () => {
  await seedReceipt();
  renderForm(memoryDraftStore(), PAGE);
  const user = userEvent.setup();
  await toPayment(user);
  const save = await screen.findByRole("button", { name: "Simpan perubahan" });
  mockDb.update((s) => {
    for (const r of s.receipts) r.status = "dibatalkan";
  });
  await user.click(save);
  expect(await screen.findByText("Nota ini sudah dibatalkan")).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Simpan perubahan" }),
  ).toBeDisabled();
});

test("422 per baris → pesan di bawah baris Gula, kembali ke langkah nota", async () => {
  await seedReceipt();
  server.use(
    http.put(`${RECEIPTS}/:id`, () =>
      problem(422, "VALIDATION", "Data nota tidak valid", {
        errors: [{ lineId: "l3", field: "qty", message: OVERFLOW }],
      }),
    ),
  );
  renderForm(memoryDraftStore(), PAGE);
  const user = userEvent.setup();
  await toPayment(user);
  await user.click(
    await screen.findByRole("button", { name: "Simpan perubahan" }),
  );
  const message = await screen.findByText(OVERFLOW);
  const row = screen.getByText("Gula Pasir").closest("div");
  expect(row?.contains(message)).toBe(true);
  expect(
    screen.getByRole("button", { name: "Lanjut ke pembayaran" }),
  ).toBeVisible();
});

test("nota orang lain atau tidak ada → 'Data tidak ditemukan' dan tombol Kembali", async () => {
  await loginRina(true);
  renderForm(memoryDraftStore(), "/staff/masuk/tidak-ada");
  expect(await screen.findByText("Data tidak ditemukan")).toBeVisible();
  expect(screen.getByRole("button", { name: "Kembali" })).toBeVisible();
});
