import { act, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { mockDb } from "@/mocks/db";
import { loginWithShift } from "@/mocks/handlers/test-helpers";
import { setScenario } from "@/mocks/scenarios";
import { openPay, panelChange, payDialog, trackSales } from "@/test/payment";
import { seedMatch } from "@/test/spec-cart";
import { useCart } from "../cart/cart-store";

vi.mock("@/shared/lib/beep", () => ({ beep: vi.fn() }));

const TOTAL_CHANGED = "Total berubah — periksa pembayaran";
const BIMOLI_UPDATED =
  "Harga 1 barang diperbarui. Total sekarang Rp36.500 (sebelumnya Rp36.000).";

beforeEach(async () => {
  useCart.setState(useCart.getInitialState(), true);
  await loginWithShift();
  setScenario("harga-berubah");
});

/** Selesai/Sudah masuk → 409 PRICE_CHANGED → jendela Harga diperbarui. */
async function priceUpdatedDialog() {
  const updated = await screen.findByRole("dialog", {
    name: "Harga diperbarui",
  });
  const ui = within(updated);
  return {
    updated,
    confirm: () => ui.getByRole("button", { name: "Simpan dengan harga baru" }),
    back: () => ui.getByRole("button", { name: "Kembali" }),
  };
}

const priceDialogGone = () =>
  waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: "Harga diperbarui" }),
    ).toBeNull(),
  );

test("tunai yang masih menutup total baru → ringkasan total; Simpan dengan harga baru langsung tersimpan", async () => {
  const bodies = trackSales();
  const { user, selesai, received } = await openPay();
  await user.type(received(), "50.000");
  await user.click(selesai());

  const { updated, confirm } = await priceUpdatedDialog();
  expect(updated).toHaveAccessibleDescription(BIMOLI_UPDATED);
  expect(within(updated).queryByText(/→/)).toBeNull();
  expect(useCart.getState().lines[0]?.listPrice).toBe(36500);
  await user.click(confirm());

  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  expect(bodies).toHaveLength(2);
  expect(bodies[1]?.saleId).toBe(bodies[0]?.saleId);
  expect(bodies[1]?.items[0]?.expectedUnitPrice).toBe(36500);
  expect(bodies[1]?.payments).toEqual([{ method: "cash", amount: 36500 }]);
  expect(panelChange()).toHaveTextContent("Rp13.500");
});

test("harga grosir berubah di server → satu 409, ringkasan total, simpan tersimpan tanpa berulang", async () => {
  setScenario("normal");
  const indomie = seedMatch("Indomie Goreng");
  act(() => {
    for (let i = 0; i < 40; i += 1) useCart.getState().addUnit(indomie);
  });
  mockDb.update((s) => {
    for (const unit of s.products.flatMap((p) => p.units)) {
      if (unit.id === indomie.unitId) {
        unit.wholesaleTiers = [{ minQty: 40, price: 2700 }];
      }
    }
  });
  const bodies = trackSales();
  const { user, selesai, received } = await openPay(() => {});
  await user.type(received(), "120.000");
  await user.click(selesai());

  const { updated, confirm } = await priceUpdatedDialog();
  expect(updated).toHaveAccessibleDescription(
    "Harga 1 barang diperbarui. Total sekarang Rp108.000 (sebelumnya Rp112.000).",
  );
  await user.click(confirm());

  // Dialog harga tetap terbuka selama kirim ulang; jendela bayar tersembunyi di baliknya.
  await waitFor(() => expect(screen.queryByRole("dialog")).toBeNull());
  await new Promise((r) => setTimeout(r, 50));
  expect(bodies).toHaveLength(2);
  expect(bodies[1]?.saleId).toBe(bodies[0]?.saleId);
  expect(bodies[1]?.items[0]?.expectedUnitPrice).toBe(2700);
  expect(bodies[1]?.payments).toEqual([{ method: "cash", amount: 108000 }]);
  expect(panelChange()).toHaveTextContent("Rp12.000");
});

test("Kembali → jendela bayar dengan total baru, keranjang tetap memakai harga baru, tidak dikirim ulang", async () => {
  const bodies = trackSales();
  const { user, ui, selesai, received } = await openPay();
  await user.type(received(), "50.000");
  await user.click(selesai());
  const { back } = await priceUpdatedDialog();
  await user.click(back());
  await priceDialogGone();

  expect(payDialog()).not.toBeNull();
  expect(ui.getByText(TOTAL_CHANGED)).toBeInTheDocument();
  expect(ui.getAllByText("Rp36.500").length).toBeGreaterThan(0);
  expect(useCart.getState().lines[0]?.listPrice).toBe(36500);
  expect(bodies).toHaveLength(1);
});

test("tunai Uang pas tidak lagi cukup → kembali ke jendela bayar dengan KURANG, tidak dikirim ulang", async () => {
  const bodies = trackSales();
  const { user, ui, selesai } = await openPay();
  await user.click(ui.getByRole("button", { name: "Uang pas" }));
  await user.click(selesai());
  const { confirm } = await priceUpdatedDialog();
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
  const { updated, confirm } = await priceUpdatedDialog();
  expect(updated).toHaveAccessibleDescription(BIMOLI_UPDATED);
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
