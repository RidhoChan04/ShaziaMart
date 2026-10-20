import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockDb } from "@/mocks/db";
import { loginWithShift, post } from "@/mocks/handlers/test-helpers";
import { renderApp } from "@/test/render-app";
import { fillSpecCart } from "@/test/spec-cart";
import { useCart } from "../cart/cart-store";

vi.mock("@/shared/lib/beep", () => ({ beep: vi.fn() }));

const scanBox = () =>
  screen.findByRole("combobox", {
    name: "Scan barcode / ketik nama atau kode",
  });
const header = () => within(screen.getByRole("banner"));
const pin = () => screen.getByLabelText("PIN");

beforeEach(() => {
  useCart.setState(useCart.getInitialState(), true);
});

afterEach(() => {
  vi.useRealTimers();
});

test("tanpa shift → Buka shift: Rina → PIN 123456 → modal 200.000 → layar kasir", async () => {
  const user = userEvent.setup();
  renderApp("/kasir");
  expect(
    await screen.findByRole("heading", { name: "Buka shift" }),
  ).toBeInTheDocument();
  expect(header().queryByRole("button", { name: "Kunci" })).toBeNull();
  expect(header().queryByRole("button", { name: "Tutup shift" })).toBeNull();

  await user.click(await screen.findByRole("button", { name: "Rina" }));
  await user.type(pin(), "123456");
  const modal = await screen.findByRole("textbox", {
    name: "Modal awal di laci",
  });
  await user.type(modal, "200.000");
  await user.click(screen.getByRole("button", { name: "Buka shift" }));

  expect(await scanBox()).toBeInTheDocument();
  expect(mockDb.get().shift).toMatchObject({
    kasirName: "Rina",
    openingCash: 200_000,
  });
  expect(header().getByText(/^Rina · Shift \d{2}\.\d{2}$/)).toBeInTheDocument();
  expect(header().getByRole("button", { name: "Riwayat" })).toBeDisabled();
  expect(header().getByRole("button", { name: "Kunci" })).toBeEnabled();
  expect(header().getByRole("button", { name: "Tutup shift" })).toBeEnabled();
});

test("Ganti kasir kembali ke pilihan kasir", async () => {
  const user = userEvent.setup();
  renderApp("/kasir");
  await user.click(await screen.findByRole("button", { name: "Budi" }));
  expect(screen.getByText("PIN untuk Budi")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Ganti kasir" }));
  expect(screen.getByRole("button", { name: "Rina" })).toBeInTheDocument();
});

test("PIN salah → 'PIN salah'; 5x → 'Terlalu banyak PIN salah — coba lagi dalam 5 menit'", async () => {
  const user = userEvent.setup();
  renderApp("/kasir");
  await user.click(await screen.findByRole("button", { name: "Rina" }));
  await user.type(pin(), "000000");
  expect(await screen.findByRole("alert")).toHaveTextContent("PIN salah");
  expect(pin()).toHaveValue("");

  for (let i = 0; i < 4; i += 1) {
    // Tombol layar dipakai di sini; keyboard fisik di atas.
    for (let d = 0; d < 6; d += 1) {
      await user.click(screen.getByRole("button", { name: "0" }));
    }
    await waitFor(() => expect(pin()).toHaveValue(""));
  }
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Terlalu banyak PIN salah — coba lagi dalam 5 menit",
  );
  expect(mockDb.get().session).toBeNull();
});

test("tombol Hapus menghapus digit terakhir", async () => {
  const user = userEvent.setup();
  renderApp("/kasir");
  await user.click(await screen.findByRole("button", { name: "Rina" }));
  await user.click(screen.getByRole("button", { name: "1" }));
  await user.click(screen.getByRole("button", { name: "2" }));
  await user.click(screen.getByRole("button", { name: "Hapus" }));
  expect(pin()).toHaveValue("1");
  expect(pin()).toHaveFocus();
});

test("klik Kunci → Layar terkunci; PIN benar → kembali, keranjang utuh", async () => {
  await loginWithShift();
  fillSpecCart();
  const user = userEvent.setup();
  renderApp("/kasir");
  expect(await scanBox()).toBeInTheDocument();

  await user.click(header().getByRole("button", { name: "Kunci" }));
  expect(
    await screen.findByRole("heading", { name: "Layar terkunci" }),
  ).toBeInTheDocument();
  expect(screen.getByText("Shift Rina")).toBeInTheDocument();
  expect(header().queryByRole("button", { name: "Kunci" })).toBeNull();
  expect(mockDb.get().session).toBeNull();
  expect(mockDb.get().shift).not.toBeNull();

  await user.type(pin(), "000000");
  expect(await screen.findByRole("alert")).toHaveTextContent("PIN salah");
  await user.type(pin(), "123456");
  expect(await scanBox()).toBeInTheDocument();
  expect(screen.getByText("6 BARANG · TOTAL")).toBeInTheDocument();
  expect(useCart.getState().lines).toHaveLength(6);
  await waitFor(async () => expect(await scanBox()).toHaveFocus());
});

test("idle 5 menit → terkunci (fake timers); aktivitas mereset hitungan", async () => {
  await loginWithShift();
  vi.useFakeTimers({ shouldAdvanceTime: true });
  renderApp("/kasir");
  expect(await scanBox()).toBeInTheDocument();

  act(() => vi.advanceTimersByTime(299_000));
  act(() => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "a" }));
  });
  act(() => vi.advanceTimersByTime(299_000));
  // Beri waktu nyata agar logout yang (salah) terkirim sempat selesai.
  await act(() => new Promise((r) => setTimeout(r, 300)));
  expect(screen.queryByRole("heading", { name: "Layar terkunci" })).toBeNull();
  expect(mockDb.get().session).not.toBeNull();

  act(() => vi.advanceTimersByTime(2_000));
  expect(
    await screen.findByRole("heading", { name: "Layar terkunci" }),
  ).toBeInTheDocument();
  expect(mockDb.get().session).toBeNull();
});

test("refresh saat terkunci tetap terkunci (sesi kosong, shift ada)", async () => {
  await loginWithShift();
  const user = userEvent.setup();
  const first = renderApp("/kasir");
  expect(await scanBox()).toBeInTheDocument();
  await user.click(header().getByRole("button", { name: "Kunci" }));
  await screen.findByRole("heading", { name: "Layar terkunci" });
  first.unmount();

  renderApp("/kasir");
  expect(
    await screen.findByRole("heading", { name: "Layar terkunci" }),
  ).toBeInTheDocument();
  expect(screen.getByText("Shift Rina")).toBeInTheDocument();
  expect(
    screen.queryByRole("combobox", {
      name: "Scan barcode / ketik nama atau kode",
    }),
  ).toBeNull();
});

test("sesi berakhir di server (401 UNAUTHORIZED) → Layar terkunci", async () => {
  await loginWithShift();
  fillSpecCart();
  const user = userEvent.setup();
  renderApp("/kasir");
  expect(await scanBox()).toBeInTheDocument();
  await post("/api/auth/logout", {});

  const bayar = screen.getByRole("button", { name: "Bayar" });
  await waitFor(() => expect(bayar).toBeEnabled());
  await user.click(bayar);
  const dialog = await screen.findByRole("dialog", { name: "Pembayaran" });
  await user.type(
    within(dialog).getByRole("textbox", { name: "UANG DITERIMA" }),
    "400.000",
  );
  await user.click(within(dialog).getByRole("button", { name: "Selesai" }));

  expect(
    await screen.findByRole("heading", { name: "Layar terkunci" }),
  ).toBeInTheDocument();
  expect(useCart.getState().lines).toHaveLength(6);
});

test("tutup shift ditolak saat keranjang berisi", async () => {
  await loginWithShift();
  fillSpecCart();
  const user = userEvent.setup();
  renderApp("/kasir");
  expect(await scanBox()).toBeInTheDocument();
  await user.click(header().getByRole("button", { name: "Tutup shift" }));
  expect(
    await screen.findByText(
      "Keranjang masih berisi — tahan atau kosongkan dulu",
    ),
  ).toBeInTheDocument();
  expect(screen.queryByRole("dialog", { name: "Tutup shift" })).toBeNull();
  expect(mockDb.get().shift).not.toBeNull();
  await waitFor(async () => expect(await scanBox()).toHaveFocus());
});

test("batal tutup shift (Esc) → kursor kembali ke kolom scan", async () => {
  await loginWithShift();
  const user = userEvent.setup();
  renderApp("/kasir");
  const scan = await scanBox();
  await user.click(header().getByRole("button", { name: "Tutup shift" }));
  await screen.findByRole("dialog", { name: "Tutup shift" });
  await user.keyboard("{Escape}");
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await waitFor(() => expect(scan).toHaveFocus());
  expect(mockDb.get().shift).not.toBeNull();
});

test("tutup shift → Selesai → kembali ke Buka shift", async () => {
  await loginWithShift(200_000);
  const user = userEvent.setup();
  renderApp("/kasir");
  expect(await scanBox()).toBeInTheDocument();
  await user.click(header().getByRole("button", { name: "Tutup shift" }));
  const dialog = await screen.findByRole("dialog", { name: "Tutup shift" });
  await user.type(
    within(dialog).getByRole("textbox", { name: "Uang fisik di laci" }),
    "200.000",
  );
  await user.click(within(dialog).getByRole("button", { name: "Tutup shift" }));
  await user.click(
    await within(dialog).findByRole("button", { name: "Selesai" }),
  );

  expect(
    await screen.findByRole("heading", { name: "Buka shift" }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(mockDb.get().shift).toBeNull();
  expect(mockDb.get().closedShifts).toHaveLength(1);
});
