import { act, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { setScenario } from "@/mocks/scenarios";
import { renderWithQuery } from "@/test/render-app";
import { fillSpecCart } from "@/test/spec-cart";
import { useCart } from "../cart/cart-store";
import { KasirScreen } from "./kasir-screen";
import { QuickCurahStrip } from "./quick-curah-strip";

vi.mock("@/shared/lib/beep", () => ({ beep: vi.fn() }));

function setup() {
  const user = userEvent.setup();
  const utils = renderWithQuery(<KasirScreen />);
  const scan = screen.getByRole("combobox", {
    name: "Scan barcode / ketik nama atau kode",
  });
  return { ...utils, user, scan };
}

const bayar = () => screen.getByRole("button", { name: "Bayar" });
const bodyRows = () =>
  within(screen.getByRole("table")).getAllByRole("row").slice(1);

beforeEach(() => {
  useCart.setState(useCart.getInitialState(), true);
});

test("tabel menampilkan kolom dan baris contoh spec, total Rp361.500", async () => {
  fillSpecCart();
  setup();
  const table = screen.getByRole("table");
  expect(
    within(table)
      .getAllByRole("columnheader")
      .map((h) => h.textContent),
  ).toEqual(["NO.", "BARANG", "QTY", "HARGA", "SUBTOTAL"]);
  const rows = bodyRows();
  expect(rows).toHaveLength(6);
  const cells = (i: number) =>
    within(rows[i] as HTMLElement)
      .getAllByRole("cell")
      .map((c) => c.textContent);
  expect(cells(0)).toEqual([
    "1",
    "Beras Pandan Wangi 5 kg",
    "1 pcs",
    "78.000",
    "78.000",
  ]);
  expect(cells(1)).toEqual([
    "2",
    "Minyak Goreng Bimoli 2 L",
    "2 pcs",
    "36.000",
    "72.000",
  ]);
  expect(cells(2)).toEqual([
    "3",
    "Gula Pasir curah",
    "1,5 kg",
    "18.000/kg",
    "27.000",
  ]);
  expect(cells(3)).toEqual([
    "4",
    "Telur Ayam curah",
    "1 kg",
    "29.000/kg",
    "29.000",
  ]);
  expect(cells(4)).toEqual([
    "5",
    "Indomie Goreng grosir",
    "40 pcs",
    "2.800",
    "112.000",
  ]);
  expect(cells(5)?.slice(0, 2)).toEqual(["6", "Kopi Kapal Api 165 g"]);
  expect(cells(5)?.slice(3)).toEqual(["14.500", "43.500"]);
  expect(within(rows[2] as HTMLElement).getByText("curah")).toBeInTheDocument();
  expect(
    within(rows[4] as HTMLElement).getByText("grosir"),
  ).toBeInTheDocument();
  expect(screen.getByText("6 BARANG · TOTAL")).toBeInTheDocument();
  expect(screen.getByText("Rp361.500")).toBeInTheDocument();
});

test("baris terakhir ditambah disorot", async () => {
  fillSpecCart();
  setup();
  const rows = bodyRows();
  expect(rows[5]).toHaveClass("bg-success-soft");
  for (const row of rows.slice(0, 5)) {
    expect(row).not.toHaveClass("bg-success-soft");
  }
});

test("klik baris → tombol − + Hapus; + menambah qty", async () => {
  fillSpecCart();
  const { user, scan } = setup();
  const row = () => bodyRows()[1] as HTMLElement;
  expect(row()).toHaveAttribute("aria-selected", "false");
  await user.click(within(row()).getByText("Minyak Goreng Bimoli 2 L"));
  expect(row()).toHaveAttribute("aria-selected", "true");
  expect(
    within(row()).getByRole("button", { name: "Kurangi" }),
  ).toBeInTheDocument();
  expect(
    within(row()).getByRole("button", { name: "Hapus" }),
  ).toBeInTheDocument();
  await user.click(within(row()).getByRole("button", { name: "Tambah" }));
  expect(within(row()).getByText("3 pcs")).toBeInTheDocument();
  expect(screen.getByText("Rp397.500")).toBeInTheDocument();
  await waitFor(() => expect(scan).toHaveFocus());

  await user.click(within(row()).getByRole("button", { name: "Kurangi" }));
  expect(within(row()).getByText("2 pcs")).toBeInTheDocument();

  // Baris curah: hanya Hapus, tanpa − / +.
  await user.click(
    within(bodyRows()[2] as HTMLElement).getByText("Gula Pasir"),
  );
  const gula = bodyRows()[2] as HTMLElement;
  expect(within(gula).queryByRole("button", { name: "Tambah" })).toBeNull();
  await user.click(within(gula).getByRole("button", { name: "Hapus" }));
  expect(bodyRows()).toHaveLength(5);
  await waitFor(() => expect(scan).toHaveFocus());
});

test("Bayar nonaktif saat keranjang kosong dan saat server-mati", async () => {
  const { unmount } = setup();
  expect(bayar()).toBeDisabled();
  expect(
    screen.getByRole("button", { name: "Tahan transaksi" }),
  ).toBeDisabled();
  unmount();

  fillSpecCart();
  setup();
  await waitFor(() => expect(bayar()).toBeEnabled());
});

test("Bayar nonaktif saat server-mati walau keranjang berisi", async () => {
  setScenario("server-mati");
  fillSpecCart();
  setup();
  await screen.findByText("Rp361.500");
  // Tunggu hasil health pertama gagal sebelum menilai tombol.
  await act(() => new Promise((r) => setTimeout(r, 50)));
  expect(bayar()).toBeDisabled();
});

test("Tahan transaksi lalu Ditahan (1) → Lanjutkan memulihkan", async () => {
  fillSpecCart();
  const { user, scan } = setup();
  expect(screen.queryByRole("button", { name: /^Ditahan/ })).toBeNull();
  await user.click(screen.getByRole("button", { name: "Tahan transaksi" }));
  expect(screen.getByText("0 BARANG · TOTAL")).toBeInTheDocument();
  await waitFor(() => expect(scan).toHaveFocus());

  await user.click(screen.getByRole("button", { name: "Ditahan (1)" }));
  const sheet = await screen.findByRole("dialog");
  expect(within(sheet).getByText("Keranjang 1")).toBeInTheDocument();
  expect(within(sheet).getByText("6 barang · Rp361.500")).toBeInTheDocument();
  await user.click(within(sheet).getByRole("button", { name: "Lanjutkan" }));

  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(screen.getByText("6 BARANG · TOTAL")).toBeInTheDocument();
  expect(screen.queryByRole("button", { name: /^Ditahan/ })).toBeNull();
  await waitFor(() => expect(scan).toHaveFocus());
});

test("tombol Gula Pasir curah membuka jendela curah (prop onCurah terpanggil)", async () => {
  const user = userEvent.setup();
  const onCurah = vi.fn();
  renderWithQuery(<QuickCurahStrip openProductId={null} onCurah={onCurah} />);
  const names = (await screen.findAllByRole("button")).map(
    (b) => b.textContent,
  );
  expect(names).toEqual([
    "Gula Pasir curah",
    "Beras curah",
    "Telur Ayam curah",
    "Minyak Goreng curah",
    "Tepung Terigu curah",
  ]);
  await user.click(screen.getByRole("button", { name: "Gula Pasir curah" }));
  expect(onCurah).toHaveBeenCalledTimes(1);
  expect(onCurah.mock.calls[0]?.[0]).toMatchObject({
    product: { name: "Gula Pasir", isCurah: true },
  });
});

test("di layar kasir, tombol curah menyimpan barang curah yang dibuka", async () => {
  const { user } = setup();
  const gula = await screen.findByRole("button", { name: "Gula Pasir curah" });
  expect(gula).toHaveAttribute("aria-expanded", "false");
  await user.click(gula);
  expect(gula).toHaveAttribute("aria-expanded", "true");
  expect(useCart.getState().lines).toHaveLength(0);
});

test("kembalian setelah transaksi tampil sampai barang berikutnya ditambah", async () => {
  act(() => useCart.getState().completeSale(38500));
  const { user, scan } = setup();
  expect(screen.getByText("KEMBALIAN")).toBeInTheDocument();
  expect(screen.getByText("Rp38.500")).toBeInTheDocument();
  await user.type(scan, "089686010947{Enter}");
  await waitFor(() => expect(screen.queryByText("KEMBALIAN")).toBeNull());
  expect(screen.getByText("1 BARANG · TOTAL")).toBeInTheDocument();
});

test("Cetak struk mengikuti pengaturan autoPrint lalu pilihan kasir", async () => {
  const { user } = setup();
  const box = screen.getByRole("checkbox", { name: "Cetak struk" });
  await waitFor(() => expect(box).toBeChecked());
  await user.click(box);
  expect(box).not.toBeChecked();
  expect(useCart.getState().printReceipt).toBe(false);
});

test("scan saat fokus di luar kolom scan tetap menambah barang", async () => {
  setup();
  act(() => (document.activeElement as HTMLElement | null)?.blur());
  act(() => {
    for (const key of [..."8991002105126", "Enter"]) {
      window.dispatchEvent(
        new KeyboardEvent("keydown", { key, bubbles: true, cancelable: true }),
      );
    }
  });
  await waitFor(() => expect(useCart.getState().lines).toHaveLength(1));
  expect(useCart.getState().lines[0]?.productName).toBe("Kopi Kapal Api 165 g");
});

test("tidak ada handler tombol F (keydown F12 tidak membuka bayar)", async () => {
  fillSpecCart();
  const { user } = setup();
  await waitFor(() => expect(bayar()).toBeEnabled());
  expect(bayar()).toHaveAttribute("aria-expanded", "false");
  const ev = new KeyboardEvent("keydown", {
    key: "F12",
    bubbles: true,
    cancelable: true,
  });
  act(() => {
    window.dispatchEvent(ev);
  });
  await user.keyboard("{F12}");
  expect(ev.defaultPrevented).toBe(false);
  expect(bayar()).toHaveAttribute("aria-expanded", "false");
  await user.click(bayar());
  // Jendela bayar modal menyembunyikan panel dari pohon aksesibilitas.
  expect(
    screen.getByRole("button", { name: "Bayar", hidden: true }),
  ).toHaveAttribute("aria-expanded", "true");
});
