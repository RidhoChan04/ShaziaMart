import { screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { loginWithShift } from "@/mocks/handlers/test-helpers";
import { setScenario } from "@/mocks/scenarios";
import { openPay, panelChange, payDialog, trackSales } from "@/test/payment";
import { useCart } from "../cart/cart-store";

vi.mock("@/shared/lib/beep", () => ({ beep: vi.fn() }));

const TOTAL_CHANGED = "Total berubah — periksa pembayaran";

beforeEach(async () => {
  useCart.setState(useCart.getInitialState(), true);
  await loginWithShift();
  setScenario("harga-berubah");
});

/** Selesai/Sudah masuk → 409 PRICE_CHANGED → jendela Harga berubah. */
async function priceChangedDialog() {
  const changed = await screen.findByRole("dialog", { name: "Harga berubah" });
  return {
    changed,
    confirm: () =>
      within(changed).getByRole("button", { name: "Konfirmasi & simpan" }),
  };
}

const priceDialogGone = () =>
  waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "Harga berubah" })).toBeNull(),
  );

test("tunai yang masih menutup total baru → total lama → baru tampil; Konfirmasi & simpan langsung tersimpan", async () => {
  const bodies = trackSales();
  const { user, selesai, received } = await openPay();
  await user.type(received(), "50.000");
  await user.click(selesai());

  const { changed, confirm } = await priceChangedDialog();
  const ui = within(changed);
  expect(
    ui.getByText("Minyak Goreng Bimoli 2 L: Rp36.000 → Rp36.500"),
  ).toBeInTheDocument();
  expect(ui.getByText("Total lama Rp36.000")).toBeInTheDocument();
  expect(ui.getByText("Total baru Rp36.500")).toBeInTheDocument();
  await user.click(confirm());

  await waitFor(() => expect(payDialog()).toBeNull());
  expect(screen.queryByRole("dialog")).toBeNull();
  expect(bodies).toHaveLength(2);
  expect(bodies[1]?.saleId).toBe(bodies[0]?.saleId);
  expect(bodies[1]?.items[0]?.expectedUnitPrice).toBe(36500);
  expect(bodies[1]?.payments).toEqual([{ method: "cash", amount: 36500 }]);
  expect(panelChange()).toHaveTextContent("Rp13.500");
});

test("tunai Uang pas tidak lagi cukup → kembali ke jendela bayar dengan KURANG, tidak dikirim ulang", async () => {
  const bodies = trackSales();
  const { user, ui, selesai } = await openPay();
  await user.click(ui.getByRole("button", { name: "Uang pas" }));
  await user.click(selesai());
  const { confirm } = await priceChangedDialog();
  await user.click(confirm());
  await priceDialogGone();

  expect(ui.getByRole("alert")).toHaveTextContent("KURANG Rp500");
  expect(ui.getByText(TOTAL_CHANGED)).toBeInTheDocument();
  expect(ui.getByText("Rp36.500")).toBeInTheDocument();
  expect(selesai()).toBeDisabled();
  expect(bodies).toHaveLength(1);
  expect(useCart.getState().lines).toHaveLength(1);
});

test("QRIS: setelah konfirmasi tidak dikirim ulang sebelum kasir menekan Sudah masuk lagi", async () => {
  const bodies = trackSales();
  const { user, ui } = await openPay();
  await user.click(ui.getByRole("tab", { name: "QRIS" }));
  const sudahMasuk = () => ui.getByRole("button", { name: "Sudah masuk" });
  await user.click(sudahMasuk());
  const { changed, confirm } = await priceChangedDialog();
  expect(within(changed).getByText("Total baru Rp36.500")).toBeInTheDocument();
  await user.click(confirm());
  await priceDialogGone();

  await new Promise((r) => setTimeout(r, 50));
  expect(bodies).toHaveLength(1);
  expect(payDialog()).not.toBeNull();
  expect(ui.getByText(TOTAL_CHANGED)).toBeInTheDocument();
  expect(ui.getAllByText("Rp36.500").length).toBeGreaterThan(0);

  await user.click(sudahMasuk());
  await waitFor(() => expect(payDialog()).toBeNull());
  expect(bodies).toHaveLength(2);
  expect(bodies[1]?.saleId).toBe(bodies[0]?.saleId);
  expect(bodies[1]?.payments).toEqual([{ method: "qris", amount: 36500 }]);
});
