import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockDb } from "@/mocks/db";
import {
  cashSale,
  customerBalance,
  customerId,
  loginWithShift,
  ownerLogin,
  post,
  unitOf,
} from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
import { renderApp } from "@/test/render-app";
import {
  EXC_NOW,
  gulaBody,
  kasirVoid,
  mixedBody,
  nextShift,
  sell,
} from "@/test/seed-exceptions";

const detail = (id: string) => `/owner/lainnya/transaksi/${id}`;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(EXC_NOW);
  await loginWithShift();
});

afterEach(() => vi.useRealTimers());

const stockOf = (name: string): number =>
  mockDb.get().stock[unitOf(name).productId] ?? Number.NaN;

const closedShiftOf = (shiftId: string) =>
  mockDb.get().closedShifts.find((c) => c.shiftId === shiftId);

test("shift tutup: judul nomor, eyebrow '{waktu} · Rina', barang, pembayaran; batal → dialog → alasan wajib → kartu 'Dibatalkan', stok kembali, cashSales shift tidak berubah, toast, fokus ke judul", async () => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const stockBefore = stockOf("Minyak Goreng Bimoli 2 L");
  const sale = await sell(cashSale(2));
  expect(stockOf("Minyak Goreng Bimoli 2 L")).toBe(stockBefore - 2);
  await nextShift();
  const closedBefore = JSON.stringify(closedShiftOf(sale.shiftId));
  vi.setSystemTime(EXC_NOW + 1_800_000);
  await ownerLogin();
  renderApp(detail(sale.id));
  const title = await screen.findByRole("heading", {
    level: 1,
    name: sale.number,
  });
  expect(screen.getByText("Hari ini 14.00 · Rina")).toBeInTheDocument();
  const items = screen.getByRole("region", { name: "Barang" });
  expect(within(items).getByText("Minyak Goreng Bimoli 2 L")).toBeVisible();
  expect(within(items).getByText("2 pcs")).toBeVisible();
  expect(within(items).getByText("Rp72.000")).toBeVisible();
  const pay = screen.getByRole("region", { name: "Pembayaran" });
  expect(within(pay).getByText("Tunai")).toBeVisible();
  expect(screen.getByRole("link", { name: /Transaksi/ })).toHaveAttribute(
    "href",
    "/owner/lainnya/transaksi",
  );

  await user.click(screen.getByRole("button", { name: "Batalkan transaksi" }));
  const dialog = await screen.findByRole("dialog", {
    name: `Batalkan ${sale.number}?`,
  });
  expect(dialog).toHaveTextContent(
    "Stok dikembalikan dan kasbon dibatalkan. Uang dikembalikan pemilik; laci kasir tidak berubah.",
  );
  const confirm = within(dialog).getByRole("button", {
    name: "Batalkan transaksi",
  });
  expect(confirm).toBeDisabled();
  await user.type(within(dialog).getByLabelText("Alasan"), "   ");
  expect(confirm).toBeDisabled();
  await user.type(
    within(dialog).getByLabelText("Alasan"),
    "Barang salah dimasukkan",
  );
  expect(confirm).toBeEnabled();
  vi.setSystemTime(EXC_NOW + 3_600_000);
  await user.click(confirm);

  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(await screen.findByText("Transaksi dibatalkan")).toBeInTheDocument();
  const card = await screen.findByRole("region", { name: "Dibatalkan" });
  expect(
    within(card).getByText(
      "Barang salah dimasukkan · Pak Ahmad · Hari ini 15.00",
    ),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Batalkan transaksi" }),
  ).toBeNull();
  expect(stockOf("Minyak Goreng Bimoli 2 L")).toBe(stockBefore);
  expect(JSON.stringify(closedShiftOf(sale.shiftId))).toBe(closedBefore);
  expect(mockDb.get().shift?.saleRefunds).toEqual([]);
  expect(title).toHaveFocus();
});

test("shift masih buka: tanpa tombol batal, dengan 'Masih di shift yang buka — batalkan dari kasir'", async () => {
  const sale = await sell(cashSale());
  await ownerLogin();
  renderApp(detail(sale.id));
  await screen.findByRole("heading", { level: 1, name: sale.number });
  expect(
    screen.getByText("Masih di shift yang buka — batalkan dari kasir"),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Batalkan transaksi" }),
  ).toBeNull();
});

test("server menolak 409 IN_OPEN_SHIFT: pesan di dialog, dialog tetap terbuka", async () => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const sale = await sell(cashSale());
  await nextShift();
  await ownerLogin();
  server.use(
    http.post(
      `/api/owner/sales/${sale.id}/void`,
      () =>
        HttpResponse.json(
          {
            type: "about:blank",
            title: "Konflik",
            status: 409,
            code: "IN_OPEN_SHIFT",
          },
          {
            status: 409,
            headers: { "Content-Type": "application/problem+json" },
          },
        ),
      { once: true },
    ),
  );
  renderApp(detail(sale.id));
  await user.click(
    await screen.findByRole("button", { name: "Batalkan transaksi" }),
  );
  const dialog = await screen.findByRole("dialog");
  await user.type(within(dialog).getByLabelText("Alasan"), "Salah");
  await user.click(
    within(dialog).getByRole("button", { name: "Batalkan transaksi" }),
  );
  expect(
    await within(dialog).findByText(
      "Masih di shift yang buka — batalkan dari kasir",
    ),
  ).toBeInTheDocument();
  expect(screen.getByRole("dialog")).toBeInTheDocument();
});

test("(R4) detail penjualan yang dibatalkan kasir: kartu 'Dibatalkan' dengan alasan + 'Rina'; QRIS ke pemilik nanti → 'QRIS Rp20.000 perlu ditransfer pemilik'", async () => {
  const sale = await sell(mixedBody(null));
  await nextShift();
  await kasirVoid(sale, "Salah harga", "pemilik");
  await ownerLogin();
  renderApp(detail(sale.id));
  const card = await screen.findByRole("region", { name: "Dibatalkan" });
  expect(
    within(card).getByText("Salah harga · Rina · Hari ini 14.00"),
  ).toBeInTheDocument();
  expect(
    within(card).getByText("QRIS Rp20.000 perlu ditransfer pemilik"),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Batalkan transaksi" }),
  ).toBeNull();
});

test("QRIS dikembalikan dari laci → tanpa tanda transfer; batal oleh pemilik sendiri → tanpa tanda juga", async () => {
  const laci = await sell(gulaBody([{ method: "qris", amount: 20_000 }]));
  await kasirVoid(laci, "Batal", "laci");
  const old = await sell(gulaBody([{ method: "qris", amount: 20_000 }]));
  await nextShift();
  await ownerLogin();
  const first = renderApp(detail(laci.id));
  const card = await screen.findByRole("region", { name: "Dibatalkan" });
  expect(within(card).queryByText(/perlu ditransfer pemilik/)).toBeNull();
  first.unmount();

  const res = await post(`/api/owner/sales/${old.id}/void`, {
    reason: "Pemilik batal",
  });
  expect(res.status).toBe(200);
  renderApp(detail(old.id));
  const card2 = await screen.findByRole("region", { name: "Dibatalkan" });
  expect(
    within(card2).getByText("Pemilik batal · Pak Ahmad · Hari ini 14.00"),
  ).toBeInTheDocument();
  expect(within(card2).queryByText(/perlu ditransfer pemilik/)).toBeNull();
});

test("(Q8) kasbon yang sudah dicicil: dialog menambah 'Saldo Bu Sari menjadi lebih bayar Rp80.000.' dan tetap bisa disimpan; saldo minus", async () => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const sari = customerId("Bu Sari");
  const before = customerBalance("Bu Sari") ?? 0;
  const sale = await sell(
    gulaBody([{ method: "credit", amount: 100_000 }], { customerId: sari }),
  );
  const pay = await post("/api/credit-payments", {
    id: "pel-1",
    customerId: sari,
    amount: before + 80_000,
    method: "tunai",
    cashReceived: before + 80_000,
    print: false,
  });
  expect(pay.status).toBe(201);
  await nextShift();
  await ownerLogin();
  renderApp(detail(sale.id));
  const pays = await screen.findByRole("region", { name: "Pembayaran" });
  expect(within(pays).getByText("Kasbon Bu Sari")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Batalkan transaksi" }));
  const dialog = await screen.findByRole("dialog");
  expect(
    await within(dialog).findByText(
      "Saldo Bu Sari menjadi lebih bayar Rp80.000.",
    ),
  ).toBeInTheDocument();
  await user.type(within(dialog).getByLabelText("Alasan"), "Salah pelanggan");
  await user.click(
    within(dialog).getByRole("button", { name: "Batalkan transaksi" }),
  );
  await screen.findByRole("region", { name: "Dibatalkan" });
  expect(customerBalance("Bu Sari")).toBe(-80_000);
});

test("(Q8) saldo pelanggan masih dimuat: konfirmasi tetap nonaktif sampai kalimatnya siap", async () => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const sale = await sell(mixedBody("Bu Sari"));
  await nextShift();
  await ownerLogin();
  server.use(
    http.get("/api/owner/customers/:id", () => new Promise<never>(() => {})),
  );
  renderApp(detail(sale.id));
  await user.click(
    await screen.findByRole("button", { name: "Batalkan transaksi" }),
  );
  const dialog = await screen.findByRole("dialog");
  await user.type(within(dialog).getByLabelText("Alasan"), "Salah pelanggan");
  expect(
    within(dialog).getByRole("button", { name: "Batalkan transaksi" }),
  ).toBeDisabled();
});

test("(Q8) saldo pelanggan gagal dimuat: baris galat + Coba lagi, konfirmasi tetap nonaktif", async () => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const sale = await sell(mixedBody("Bu Sari"));
  await nextShift();
  await ownerLogin();
  server.use(
    http.get("/api/owner/customers/:id", () =>
      HttpResponse.json({ message: "Gagal" }, { status: 500 }),
    ),
  );
  renderApp(detail(sale.id));
  await user.click(
    await screen.findByRole("button", { name: "Batalkan transaksi" }),
  );
  const dialog = await screen.findByRole("dialog");
  expect(
    await within(dialog).findByText(/Saldo pelanggan belum bisa dimuat/),
  ).toBeInTheDocument();
  expect(
    within(dialog).getByRole("button", { name: "Coba lagi" }),
  ).toBeInTheDocument();
  await user.type(within(dialog).getByLabelText("Alasan"), "Salah pelanggan");
  expect(
    within(dialog).getByRole("button", { name: "Batalkan transaksi" }),
  ).toBeDisabled();
});

test("kasbon tanpa cicilan: dialog tanpa kalimat 'lebih bayar'", async () => {
  const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
  const sale = await sell(mixedBody("Bu Sari"));
  await nextShift();
  await ownerLogin();
  renderApp(detail(sale.id));
  await user.click(
    await screen.findByRole("button", { name: "Batalkan transaksi" }),
  );
  const dialog = await screen.findByRole("dialog");
  expect(within(dialog).queryByText(/lebih bayar/)).toBeNull();
});

test("transaksi tidak ada: 'Transaksi tidak ditemukan' dengan tautan ke daftar", async () => {
  await ownerLogin();
  renderApp(detail("tidak-ada"));
  expect(
    await screen.findByText("Transaksi tidak ditemukan"),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("link", { name: "Kembali ke transaksi" }),
  ).toHaveAttribute("href", "/owner/lainnya/transaksi");
});
