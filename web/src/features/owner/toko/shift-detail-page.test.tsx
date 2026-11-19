import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { toast } from "sonner";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockDb } from "@/mocks/db";
import { server } from "@/mocks/node";
import { formatRupiah, formatSignedRupiah } from "@/shared/lib/money";
import { renderApp } from "@/test/render-app";
import { at, detail, seedDay } from "./shifts-test-setup";

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  at(7);
});

afterEach(() => {
  toast.dismiss();
  vi.useRealTimers();
});

async function openShift(id: string, title: string) {
  const user = userEvent.setup();
  const utils = renderApp(`/owner/lainnya/shift/${id}`);
  await screen.findByRole("heading", { level: 1, name: title });
  return { user, ...utils };
}
const rowText = (label: string) => {
  const row = within(screen.getByRole("main"))
    .getAllByRole("listitem")
    .find((li) => li.firstElementChild?.textContent?.startsWith(label));
  if (!row) throw new Error(`baris tidak ada: ${label}`);
  return row;
};
const region = (name: string) => within(screen.getByRole("region", { name }));

test("shift tutup: judul, eyebrow, dan semua baris laci persis dari server (nol tidak tampil)", async () => {
  const { rina } = await seedDay();
  const d = await detail(rina);
  await openShift(rina, "Shift Rina");
  expect(
    screen.getByText("Kamis, 19 Nov 2026 · 07.00–14.58"),
  ).toBeInTheDocument();
  expect(rowText("Modal awal")).toHaveTextContent(formatRupiah(d.openingCash));
  expect(rowText("Penjualan tunai")).toHaveTextContent(
    formatSignedRupiah(d.cashSales),
  );
  expect(rowText("Kas keluar")).toHaveTextContent(
    formatSignedRupiah(-d.expenses),
  );
  expect(rowText("Diambil pemilik")).toHaveTextContent(
    formatSignedRupiah(-d.ownerTakes),
  );
  expect(rowText("Uang seharusnya")).toHaveTextContent(
    formatRupiah(d.expectedCash),
  );
  expect(rowText("Uang fisik")).toHaveTextContent("Rp400.000");
  expect(rowText("Selisih")).toHaveTextContent(
    formatSignedRupiah(d.difference ?? 0),
  );
  // Baris bernilai nol tidak tampil.
  expect(d.creditPayments).toBe(0);
  expect(screen.queryByText("Pelunasan kasbon")).not.toBeInTheDocument();
  expect(screen.queryByText("Bayar supplier")).not.toBeInTheDocument();
  expect(screen.queryByText("Pengembalian transaksi")).not.toBeInTheDocument();
  expect(screen.queryByText("Sedang buka")).not.toBeInTheDocument();
  // QRIS shift ini.
  expect(d.qrisSales).toBe(20_000);
  expect(region("QRIS").getByText("Penjualan").closest("li")).toHaveTextContent(
    "Rp20.000",
  );
  expect(region("QRIS").getByText("Pelunasan").closest("li")).toHaveTextContent(
    "Rp0",
  );
});

test("kas keluar dan ambil uang: baris jam · alasan/catatan dengan −Rp; yang dibatalkan dicoret + Dibatalkan + alasan · nama · jam", async () => {
  const { rina } = await seedDay();
  await openShift(rina, "Shift Rina");
  const expenses = region("Kas keluar").getAllByRole("listitem");
  expect(expenses).toHaveLength(2);
  // Terbaru dulu (mockup final, layar 5 dan 8); urutan server tidak diubah.
  expect(expenses[0]).toHaveTextContent("11.40 · Bayar iuran sampah−Rp20.000");
  expect(expenses[1]).toHaveTextContent("09.20 · Beli es batu−Rp15.000");
  const takes = region("Diambil pemilik").getAllByRole("listitem");
  expect(takes).toHaveLength(2);
  const [activeTake, cancelledTake] = takes as [HTMLElement, HTMLElement];
  expect(cancelledTake).toHaveTextContent("12.25 · Salah nominal−Rp100.000");
  expect(cancelledTake).toHaveTextContent("Dibatalkan");
  expect(cancelledTake).toHaveTextContent("Salah nominal · Pak Ahmad · 12.28");
  expect(cancelledTake.querySelector(".line-through")).not.toBeNull();
  expect(within(cancelledTake).queryByRole("button")).not.toBeInTheDocument();
  expect(activeTake).toHaveTextContent("12.30 · Setor ke bank−Rp1.000.000");
});

test("shift buka: Sedang buka, Uang seharusnya sejauh ini, tanpa Uang fisik dan Selisih; kas keluar → Masih di shift yang buka — batalkan dari kasir", async () => {
  const { budi } = await seedDay();
  const d = await detail(budi);
  const { user } = await openShift(budi, "Shift Budi");
  expect(
    screen.getByText("Kamis, 19 Nov 2026 · sejak 15.00"),
  ).toBeInTheDocument();
  expect(screen.getByText("Sedang buka")).toBeInTheDocument();
  expect(rowText("Uang seharusnya sejauh ini")).toHaveTextContent(
    formatRupiah(d.expectedCash),
  );
  expect(screen.queryByText("Uang fisik")).not.toBeInTheDocument();
  expect(screen.queryByText("Selisih")).not.toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: /Beli es batu/ }));
  const sheet = await screen.findByRole("dialog", {
    name: "Kas keluar Rp15.000",
  });
  expect(
    within(sheet).getByText("Masih di shift yang buka — batalkan dari kasir"),
  ).toBeInTheDocument();
  expect(
    within(sheet).queryByRole("button", { name: "Batalkan kas keluar" }),
  ).not.toBeInTheDocument();
});

test("S10 shift tutup: Batalkan kas keluar → alasan wajib, keterangan laci tidak berubah, toast, baris dicoret, angka laci sama", async () => {
  const { rina } = await seedDay();
  const before = await detail(rina);
  const { user } = await openShift(rina, "Shift Rina");
  await user.click(screen.getByRole("button", { name: /Bayar iuran sampah/ }));
  const sheet = await screen.findByRole("dialog", {
    name: "Kas keluar Rp20.000",
  });
  await user.click(
    within(sheet).getByRole("button", { name: "Batalkan kas keluar" }),
  );
  const dialog = await screen.findByRole("alertdialog", {
    name: "Batalkan kas keluar Rp20.000?",
  });
  expect(
    within(dialog).getByText(
      "Hitungan laci shift Rina tidak berubah karena shift sudah tutup.",
    ),
  ).toBeInTheDocument();
  const confirm = within(dialog).getByRole("button", {
    name: "Batalkan kas keluar",
  });
  expect(confirm).toBeDisabled();
  await user.type(
    within(dialog).getByRole("textbox", { name: "Alasan" }),
    "Iuran dibayar Pak Ahmad sendiri",
  );
  await user.click(confirm);
  expect(await screen.findByText("Kas keluar dibatalkan")).toBeInTheDocument();
  await waitFor(() =>
    expect(region("Kas keluar").getAllByRole("listitem")[0]).toHaveTextContent(
      "Dibatalkan",
    ),
  );
  const row = region("Kas keluar").getAllByRole("listitem")[0] as HTMLElement;
  expect(row).toHaveTextContent(
    "Iuran dibayar Pak Ahmad sendiri · Pak Ahmad · 20.15",
  );
  expect(row.querySelector(".line-through")).not.toBeNull();
  const after = await detail(rina);
  expect(after.expenses).toBe(before.expenses);
  expect(after.expectedCash).toBe(before.expectedCash);
  expect(rowText("Uang seharusnya")).toHaveTextContent(
    formatRupiah(before.expectedCash),
  );
  expect(
    mockDb.get().drawerExpenses.find((e) => e.id === "kk-r2")?.cancelReason,
  ).toBe("Iuran dibayar Pak Ahmad sendiri");
});

test("409 IN_OPEN_SHIFT saat batal kas keluar: dialog menutup tanpa toast; lembar ikut keadaan terbaru", async () => {
  const { rina } = await seedDay();
  const { user } = await openShift(rina, "Shift Rina");
  await user.click(screen.getByRole("button", { name: /Bayar iuran sampah/ }));
  const sheet = await screen.findByRole("dialog", {
    name: "Kas keluar Rp20.000",
  });
  server.use(
    http.post("/api/owner/expenses/:id/cancel", () =>
      HttpResponse.json(
        {
          code: "IN_OPEN_SHIFT",
          type: "about:blank",
          title: "x",
          status: 409,
          detail: "x",
        },
        {
          status: 409,
          headers: { "Content-Type": "application/problem+json" },
        },
      ),
    ),
  );
  await user.click(
    within(sheet).getByRole("button", { name: "Batalkan kas keluar" }),
  );
  const dialog = await screen.findByRole("alertdialog");
  await user.type(
    within(dialog).getByRole("textbox", { name: "Alasan" }),
    "Salah",
  );
  await user.click(
    within(dialog).getByRole("button", { name: "Batalkan kas keluar" }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("alertdialog")).not.toBeInTheDocument(),
  );
  expect(screen.queryByText("Kas keluar dibatalkan")).not.toBeInTheDocument();
  expect(
    mockDb.get().drawerExpenses.find((e) => e.id === "kk-r2")?.cancelledAt,
  ).toBeNull();
});

test("ambil uang di shift tutup: tanpa tombol, keterangan Shift sudah tutup — tidak bisa dibatalkan", async () => {
  const { rina } = await seedDay();
  const { user } = await openShift(rina, "Shift Rina");
  await user.click(screen.getByRole("button", { name: /Setor ke bank/ }));
  const sheet = await screen.findByRole("dialog", {
    name: "Pengambilan Rp1.000.000",
  });
  expect(
    within(sheet).getByText("Shift sudah tutup — tidak bisa dibatalkan"),
  ).toBeInTheDocument();
  expect(
    within(sheet).queryByRole("button", { name: "Batalkan pengambilan" }),
  ).not.toBeInTheDocument();
});

test("ambil uang di shift buka: batal beralasan → uang seharusnya shift naik lagi (angka server), baris dicoret", async () => {
  const { budi } = await seedDay();
  const before = await detail(budi);
  const { user } = await openShift(budi, "Shift Budi");
  await user.click(
    screen.getByRole("button", { name: /Untuk belanja grosir/ }),
  );
  const sheet = await screen.findByRole("dialog", {
    name: "Pengambilan Rp500.000",
  });
  await user.click(
    within(sheet).getByRole("button", { name: "Batalkan pengambilan" }),
  );
  const dialog = await screen.findByRole("alertdialog", {
    name: "Batalkan pengambilan Rp500.000?",
  });
  expect(
    within(dialog).getByText(
      "Uang seharusnya shift Budi kembali bertambah Rp500.000.",
    ),
  ).toBeInTheDocument();
  await user.type(
    within(dialog).getByRole("textbox", { name: "Alasan" }),
    "Salah nominal",
  );
  await user.click(
    within(dialog).getByRole("button", { name: "Batalkan pengambilan" }),
  );
  expect(await screen.findByText("Pengambilan dibatalkan")).toBeInTheDocument();
  await waitFor(() =>
    expect(rowText("Uang seharusnya sejauh ini")).toHaveTextContent(
      formatRupiah(before.expectedCash + 500_000),
    ),
  );
  const takes = region("Diambil pemilik").getAllByRole("listitem");
  expect(takes[0]).toHaveTextContent("Dibatalkan");
  expect(takes[0]).toHaveTextContent("Salah nominal · Pak Ahmad · 20.15");
});

test("shift tidak ditemukan: pesan galat dan Coba lagi", async () => {
  await seedDay();
  renderApp("/owner/lainnya/shift/tidak-ada");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Data tidak ditemukan",
  );
  expect(screen.getByRole("button", { name: "Coba lagi" })).toBeInTheDocument();
});

test("setelah batal berhasil fokus ke judul; menutup lembar item lain dengan Tutup mengembalikan fokus ke barisnya", async () => {
  const { rina } = await seedDay();
  const { user } = await openShift(rina, "Shift Rina");
  await user.click(screen.getByRole("button", { name: /Bayar iuran sampah/ }));
  const sheet = await screen.findByRole("dialog", {
    name: "Kas keluar Rp20.000",
  });
  await user.click(
    within(sheet).getByRole("button", { name: "Batalkan kas keluar" }),
  );
  const dialog = await screen.findByRole("alertdialog");
  await user.type(
    within(dialog).getByRole("textbox", { name: "Alasan" }),
    "Salah",
  );
  await user.click(
    within(dialog).getByRole("button", { name: "Batalkan kas keluar" }),
  );
  await screen.findByText("Kas keluar dibatalkan");
  await waitFor(() =>
    expect(
      screen.getByRole("heading", { level: 1, name: "Shift Rina" }),
    ).toHaveFocus(),
  );
  const other = screen.getByRole("button", { name: /Beli es batu/ });
  await user.click(other);
  const sheet2 = await screen.findByRole("dialog", {
    name: "Kas keluar Rp15.000",
  });
  await user.click(within(sheet2).getByRole("button", { name: "Tutup" }));
  await waitFor(() => expect(other).toHaveFocus());
});

test("409 lalu muat ulang gagal: pesan galat dan tombol batal hilang (tidak diam)", async () => {
  const { rina } = await seedDay();
  const { user } = await openShift(rina, "Shift Rina");
  await user.click(screen.getByRole("button", { name: /Bayar iuran sampah/ }));
  const sheet = await screen.findByRole("dialog", {
    name: "Kas keluar Rp20.000",
  });
  server.use(
    http.post("/api/owner/expenses/:id/cancel", () =>
      HttpResponse.json(
        {
          type: "about:blank",
          title: "x",
          status: 409,
          code: "IN_OPEN_SHIFT",
          detail: "x",
        },
        {
          status: 409,
          headers: { "Content-Type": "application/problem+json" },
        },
      ),
    ),
    http.get("/api/owner/shifts/:id", () => HttpResponse.error()),
  );
  await user.click(
    within(sheet).getByRole("button", { name: "Batalkan kas keluar" }),
  );
  const dialog = await screen.findByRole("alertdialog");
  await user.type(
    within(dialog).getByRole("textbox", { name: "Alasan" }),
    "Salah",
  );
  await user.click(
    within(dialog).getByRole("button", { name: "Batalkan kas keluar" }),
  );
  const notice = "Data terbaru gagal dimuat — tutup lembar ini, lalu coba lagi";
  expect(await within(sheet).findByRole("alert")).toHaveTextContent(notice);
  expect(
    within(sheet).queryByRole("button", { name: "Batalkan kas keluar" }),
  ).not.toBeInTheDocument();
});
