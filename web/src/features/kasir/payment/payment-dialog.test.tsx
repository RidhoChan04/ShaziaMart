import {
  act,
  fireEvent,
  screen,
  waitFor,
  within,
} from "@testing-library/react";
import { delay, HttpResponse, http } from "msw";
import { beforeEach, expect, test, vi } from "vitest";
import { mockDb } from "@/mocks/db";
import { loginWithShift } from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
import { setScenario } from "@/mocks/scenarios";
import { getListTodaySalesQueryKey } from "@/shared/api/gen/sales/sales";
import { openPay, panelChange, payDialog, trackSales } from "@/test/payment";
import { fillSpecCart } from "@/test/spec-cart";
import { useCart } from "../cart/cart-store";

vi.mock("@/shared/lib/beep", () => ({ beep: vi.fn() }));

beforeEach(async () => {
  useCart.setState(useCart.getInitialState(), true);
  await loginWithShift();
});

test("tunai: ketik 400.000 → KEMBALIAN Rp38.500; Selesai → keranjang kosong, kembalian di panel", async () => {
  const bodies = trackSales();
  const { user, ui, scan, selesai, received } = await openPay(fillSpecCart);
  expect(ui.getByText("TOTAL BELANJA · 6 barang")).toBeInTheDocument();
  expect(ui.getByText("Rp361.500")).toBeInTheDocument();
  expect(received()).toHaveFocus();
  expect(selesai()).toBeDisabled();
  await user.type(received(), "400.000");
  expect(ui.getByText("KEMBALIAN")).toBeInTheDocument();
  expect(ui.getByText("Rp38.500")).toBeInTheDocument();
  await user.click(selesai());

  await waitFor(() => expect(payDialog()).toBeNull());
  expect(bodies).toHaveLength(1);
  expect(bodies[0]?.cashReceived).toBe(400000);
  expect(useCart.getState().lines).toHaveLength(0);
  expect(screen.getByText("0 BARANG · TOTAL")).toBeInTheDocument();
  expect(panelChange()).toHaveTextContent("KEMBALIAN");
  expect(panelChange()).toHaveTextContent("Rp38.500");
  await waitFor(() => expect(scan).toHaveFocus());
});

test("tombol nominal cepat untuk Rp361.500: Uang pas, 370.000, 400.000, 500.000", async () => {
  const { user, ui, received } = await openPay(fillSpecCart);
  const group = ui.getByRole("group", { name: "Nominal cepat" });
  const buttons = within(group).getAllByRole("button");
  expect(buttons.map((b) => b.textContent)).toEqual([
    "Uang pas",
    "370.000",
    "400.000",
    "500.000",
  ]);
  await user.click(within(group).getByRole("button", { name: "400.000" }));
  expect(received()).toHaveValue("400.000");
  expect(
    within(group).getByRole("button", { name: "400.000" }),
  ).toHaveAttribute("aria-pressed", "true");
  expect(ui.getByText("Rp38.500")).toBeInTheDocument();
  await user.click(within(group).getByRole("button", { name: "Uang pas" }));
  expect(received()).toHaveValue("361.500");
  expect(ui.getByText("KEMBALIAN").parentElement).toHaveTextContent("Rp0");
});

test("uang kurang → 'KURANG Rp11.500' dan Selesai nonaktif", async () => {
  const { user, ui, selesai, received } = await openPay(fillSpecCart);
  await user.type(received(), "350000");
  expect(ui.getByRole("alert")).toHaveTextContent("KURANG Rp11.500");
  expect(ui.queryByText("KEMBALIAN")).toBeNull();
  expect(selesai()).toBeDisabled();
  await user.keyboard("{Enter}");
  await user.clear(received());
  await user.type(received(), "abc");
  expect(ui.queryByRole("alert")).toBeNull();
  expect(selesai()).toBeDisabled();
  expect(payDialog()).not.toBeNull();
});

test("Selesai diklik dua kali → hanya satu POST /api/sales", async () => {
  const bodies = trackSales(100);
  const { user, selesai, received } = await openPay();
  await user.type(received(), "50000");
  await user.dblClick(selesai());
  expect(selesai()).toBeDisabled();
  expect(selesai()).toHaveAttribute("aria-busy", "true");
  await user.keyboard("{Enter}");
  await waitFor(() => expect(payDialog()).toBeNull());
  expect(bodies).toHaveLength(1);
  expect(mockDb.get().sales).toHaveLength(1);
});

test("dua submit sebelum render ulang → tetap satu POST", async () => {
  const bodies = trackSales(100);
  const { selesai, received, user } = await openPay();
  await user.type(received(), "50000");
  const form = selesai().closest("form") as HTMLFormElement;
  act(() => {
    fireEvent.submit(form);
    fireEvent.submit(form);
  });
  await waitFor(() => expect(payDialog()).toBeNull());
  expect(bodies).toHaveLength(1);
});

test("server-mati saat Selesai → pesan, keranjang tetap; coba lagi memakai saleId sama", async () => {
  const bodies = trackSales();
  const { user, ui, selesai, received } = await openPay();
  const saleId = useCart.getState().saleId;
  await user.type(received(), "50000");
  setScenario("server-mati");
  await user.click(selesai());

  expect(await ui.findByRole("alert")).toHaveTextContent(
    "Server tidak tersambung — coba lagi",
  );
  expect(payDialog()).not.toBeNull();
  expect(useCart.getState().lines).toHaveLength(1);
  expect(useCart.getState().saleId).toBe(saleId);
  expect(received()).toHaveValue("50000");

  setScenario("normal");
  await user.click(selesai());
  await waitFor(() => expect(payDialog()).toBeNull());
  expect(bodies.map((b) => b.saleId)).toEqual([saleId, saleId]);
  expect(mockDb.get().sales.map((s) => s.id)).toEqual([saleId]);
  expect(panelChange()).toHaveTextContent("Rp14.000");
});

test("harga-berubah → dialog Harga berubah; Konfirmasi & simpan → tersimpan", async () => {
  setScenario("harga-berubah");
  const bodies = trackSales();
  const { user, selesai, received } = await openPay();
  await user.type(received(), "50.000");
  await user.click(selesai());

  const changed = await screen.findByRole("dialog", { name: "Harga berubah" });
  expect(
    within(changed).getByText("Minyak Goreng Bimoli 2 L: Rp36.000 → Rp36.500"),
  ).toBeInTheDocument();
  await user.click(
    within(changed).getByRole("button", { name: "Konfirmasi & simpan" }),
  );

  await waitFor(() => expect(payDialog()).toBeNull());
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(bodies).toHaveLength(2);
  expect(bodies[1]?.saleId).toBe(bodies[0]?.saleId);
  expect(bodies[1]?.items[0]?.expectedUnitPrice).toBe(36500);
  expect(bodies[1]?.payments).toEqual([{ method: "cash", amount: 36500 }]);
  expect(panelChange()).toHaveTextContent("Rp13.500");
});

test("harga-berubah dengan Uang pas → setelah konfirmasi tampil KURANG, tidak dikirim ulang", async () => {
  setScenario("harga-berubah");
  const bodies = trackSales();
  const { user, ui, selesai } = await openPay();
  await user.click(ui.getByRole("button", { name: "Uang pas" }));
  await user.click(selesai());
  const changed = await screen.findByRole("dialog", { name: "Harga berubah" });
  await user.click(
    within(changed).getByRole("button", { name: "Konfirmasi & simpan" }),
  );
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Harga berubah" })).toBeNull(),
  );
  expect(ui.getByRole("alert")).toHaveTextContent("KURANG Rp500");
  expect(ui.getByText("Rp36.500")).toBeInTheDocument();
  expect(selesai()).toBeDisabled();
  expect(bodies).toHaveLength(1);
  expect(useCart.getState().lines).toHaveLength(1);
});

test("kasbon Pak Joko 36.000 → CREDIT_LIMIT → PIN pemilik 999999 → tersimpan", async () => {
  const bodies = trackSales();
  const { user, ui, selesai } = await openPay();
  await user.click(ui.getByRole("tab", { name: "Kasbon" }));
  expect(selesai()).toBeDisabled();
  await user.type(
    ui.getByRole("searchbox", { name: "Cari pelanggan" }),
    "Joko",
  );
  await user.click(
    await ui.findByRole("button", { name: /Pak Joko · 081234500002/ }),
  );
  expect(ui.getByText("Saldo Rp290.000 · Limit Rp300.000")).toBeInTheDocument();
  await user.click(selesai());

  const pin = await screen.findByRole("dialog", { name: "PIN pemilik" });
  const pinInput = within(pin).getByLabelText("PIN");
  expect(pinInput).toHaveAttribute("type", "password");
  expect(pinInput).toHaveAttribute("inputmode", "numeric");
  const confirm = within(pin).getByRole("button", { name: "Konfirmasi" });
  await user.type(pinInput, "11111");
  expect(confirm).toBeDisabled();
  await user.type(pinInput, "1");
  await user.click(confirm);
  expect(await within(pin).findByRole("alert")).toHaveTextContent("PIN salah");

  await user.clear(pinInput);
  await user.type(pinInput, "999999{Enter}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());

  const joko = mockDb.get().customers.find((c) => c.name === "Pak Joko");
  expect(joko?.balance).toBe(326000);
  expect(bodies.map((b) => b.ownerPin)).toEqual([
    undefined,
    "111111",
    "999999",
  ]);
  expect(bodies[2]).toMatchObject({
    customerId: joko?.id,
    payments: [{ method: "credit", amount: 36000 }],
  });
  expect(new Set(bodies.map((b) => b.saleId)).size).toBe(1);
  expect(useCart.getState().lines).toHaveLength(0);
});

test("QRIS: Sudah masuk menyimpan dengan method qris", async () => {
  const bodies = trackSales();
  const { user, ui } = await openPay();
  await user.click(ui.getByRole("tab", { name: "QRIS" }));
  expect(await ui.findByRole("img", { name: "QRIS toko" })).toHaveAttribute(
    "src",
    "/qris-contoh.svg",
  );
  expect(ui.getAllByText("Rp36.000").length).toBeGreaterThan(0);
  await user.click(ui.getByRole("button", { name: "Sudah masuk" }));
  await waitFor(() => expect(payDialog()).toBeNull());
  expect(bodies[0]?.payments).toEqual([{ method: "qris", amount: 36000 }]);
  expect(bodies[0]).not.toHaveProperty("cashReceived");
  expect(useCart.getState().lines).toHaveLength(0);
});

test("campuran tunai 200.000 + sisa kasbon Bu Sari", async () => {
  const bodies = trackSales();
  const { user, ui, selesai } = await openPay(fillSpecCart);
  await user.click(ui.getByRole("tab", { name: "Campuran" }));
  const first = ui.getByRole("group", { name: "BAGIAN PERTAMA" });
  expect(within(first).getByRole("button", { name: "Tunai" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await user.type(
    ui.getByRole("textbox", { name: "NOMINAL DIBAYAR" }),
    "200.000",
  );
  expect(ui.getByText("Sisa kasbon Rp161.500")).toBeInTheDocument();
  await user.type(
    ui.getByRole("textbox", { name: "UANG DITERIMA" }),
    "250.000",
  );
  expect(ui.getByText("KEMBALIAN").parentElement).toHaveTextContent("Rp50.000");
  expect(selesai()).toBeDisabled();
  await user.type(
    ui.getByRole("searchbox", { name: "Cari pelanggan" }),
    "Sari",
  );
  await user.click(await ui.findByRole("button", { name: /Bu Sari/ }));
  await user.click(selesai());

  await waitFor(() => expect(payDialog()).toBeNull());
  const sari = mockDb.get().customers.find((c) => c.name === "Bu Sari");
  expect(bodies[0]).toMatchObject({
    payments: [
      { method: "cash", amount: 200000 },
      { method: "credit", amount: 161500 },
    ],
    cashReceived: 250000,
    customerId: sari?.id,
  });
  expect(sari?.balance).toBe(281500);
  expect(panelChange()).toHaveTextContent("Rp50.000");
});

test("penjualan berhasil → riwayat hari ini ditandai basi", async () => {
  const { user, ui, selesai, queryClient } = await openPay();
  const key = getListTodaySalesQueryKey();
  queryClient.setQueryData(key, []);
  expect(queryClient.getQueryState(key)?.isInvalidated).toBe(false);
  await user.click(ui.getByRole("button", { name: "Uang pas" }));
  await user.click(selesai());
  await waitFor(() => expect(payDialog()).toBeNull());
  expect(queryClient.getQueryState(key)?.isInvalidated).toBe(true);
});

test("printer-gagal → toast struk gagal", async () => {
  setScenario("printer-gagal");
  const { user, ui, selesai } = await openPay();
  await waitFor(() =>
    expect(ui.getByRole("checkbox", { name: "Cetak struk" })).toBeChecked(),
  );
  await user.click(ui.getByRole("button", { name: "Uang pas" }));
  await user.click(selesai());
  expect(
    await screen.findByText("Struk gagal dicetak — cetak ulang dari Riwayat"),
  ).toBeInTheDocument();
  expect(payDialog()).toBeNull();
  expect(mockDb.get().sales[0]?.printStatus).toBe("gagal");
});

test("Esc menutup jendela bayar tanpa menyimpan", async () => {
  const bodies = trackSales();
  const { user, scan, received } = await openPay();
  await user.type(received(), "50000");
  await user.keyboard("{Escape}");
  await waitFor(() => expect(payDialog()).toBeNull());
  expect(bodies).toHaveLength(0);
  expect(useCart.getState().lines).toHaveLength(1);
  expect(screen.getByRole("button", { name: "Bayar" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  await waitFor(() => expect(scan).toHaveFocus());
});

test("Esc saat request berjalan tidak menutup jendela", async () => {
  server.use(
    http.post("/api/sales", async () => {
      await delay(150);
      return HttpResponse.error();
    }),
  );
  const { user, ui, selesai, received } = await openPay();
  await user.type(received(), "50000");
  await user.click(selesai());
  await user.keyboard("{Escape}");
  expect(payDialog()).not.toBeNull();
  expect(await ui.findByRole("alert")).toHaveTextContent(
    "Server tidak tersambung — coba lagi",
  );
});
