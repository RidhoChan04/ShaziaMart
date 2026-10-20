import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http } from "msw";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockDb } from "@/mocks/db";
import { loginWithShift, post } from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
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
  await typePin("123456");
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
  expect(header().getByRole("button", { name: "Riwayat" })).toBeEnabled();
  expect(header().getByRole("button", { name: "Kunci" })).toBeEnabled();
  expect(header().getByRole("button", { name: "Tutup shift" })).toBeEnabled();

  await user.click(header().getByRole("button", { name: "Riwayat" }));
  expect(
    await screen.findByText("Belum ada transaksi hari ini"),
  ).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Tutup" }));
  await waitFor(async () => expect(await scanBox()).toHaveFocus());
}, 15_000);

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
  await typePin("000000");
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

  await typePin("000000");
  expect(await screen.findByRole("alert")).toHaveTextContent("PIN salah");
  await typePin("123456");
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

test("hasil tutup shift bertahan walau gerbang dimuat ulang; Selesai → Buka shift", async () => {
  await loginWithShift(200_000);
  const user = userEvent.setup();
  const { queryClient } = renderApp("/kasir");
  expect(await scanBox()).toBeInTheDocument();
  await user.click(header().getByRole("button", { name: "Tutup shift" }));
  const dialog = await screen.findByRole("dialog", { name: "Tutup shift" });
  await user.type(
    within(dialog).getByRole("textbox", { name: "Uang fisik di laci" }),
    "200.000",
  );
  await user.click(within(dialog).getByRole("button", { name: "Tutup shift" }));
  expect(await screen.findByText("Uang seharusnya")).toBeInTheDocument();

  // Server sudah menghapus sesi & shift; refetch apa pun membalik gerbang.
  await act(() => queryClient.refetchQueries());
  expect(
    await screen.findByRole("heading", { name: "Buka shift", hidden: true }),
  ).toBeInTheDocument();
  expect(screen.getByText("Uang seharusnya")).toBeVisible();
  expect(screen.getByText("Selisih")).toBeVisible();

  await user.click(screen.getByRole("button", { name: "Selesai" }));
  expect(
    await screen.findByRole("heading", { name: "Buka shift" }),
  ).toBeInTheDocument();
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(mockDb.get().shift).toBeNull();
  expect(mockDb.get().closedShifts).toHaveLength(1);
});

/** Hitung request PIN login yang sampai ke server palsu. */
function countPinLogins() {
  const calls = { n: 0 };
  server.use(
    http.post("/api/auth/pin-login", () => {
      calls.n += 1;
    }),
  );
  return calls;
}

/** Jeda antar-tombol persis: hanya `performance.now()` yang dipalsukan. */
function typingAt(gapMs: number) {
  if (!vi.isFakeTimers()) vi.useFakeTimers({ toFake: ["performance"] });
  return userEvent.setup({
    delay: gapMs,
    advanceTimers: (ms) => vi.advanceTimersByTime(ms),
  });
}

/** PIN diketik dengan kecepatan tangan manusia. */
const typePin = (value: string) => typingAt(60).type(pin(), value);

async function renderLocked() {
  await loginWithShift();
  await post("/api/auth/logout", {});
  renderApp("/kasir");
  await screen.findByRole("heading", { name: "Layar terkunci" });
}

test("scan EAN-13 di layar kunci → ditolak tanpa percobaan PIN", async () => {
  await renderLocked();
  const calls = countPinLogins();
  const user = typingAt(5);
  await user.type(pin(), "8991002101234{Enter}");

  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Itu barcode, bukan PIN",
  );
  expect(pin()).toHaveValue("");
  expect(calls.n).toBe(0);
  expect(mockDb.get().pinFailures).toEqual({});
  expect(screen.getByRole("heading", { name: "Layar terkunci" })).toBeVisible();
});

test("PIN diketik manusia (jeda 60 ms) tetap masuk", async () => {
  await renderLocked();
  const calls = countPinLogins();
  await typePin("123456");
  expect(await scanBox()).toBeInTheDocument();
  expect(calls.n).toBe(1);
});

test("setelah scan ditolak, PIN berikutnya diterima", async () => {
  await renderLocked();
  const user = typingAt(5);
  await user.type(pin(), "8991002101234{Enter}");
  await screen.findByText("Itu barcode, bukan PIN");
  const human = typingAt(80);
  await human.type(pin(), "123456");
  expect(await scanBox()).toBeInTheDocument();
});
