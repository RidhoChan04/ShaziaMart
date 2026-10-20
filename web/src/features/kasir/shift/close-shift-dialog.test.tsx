import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { mockDb } from "@/mocks/db";
import { loginWithShift } from "@/mocks/handlers/test-helpers";
import { renderWithQuery } from "@/test/render-app";
import { CloseShiftDialog } from "./close-shift-dialog";

/** Modal awal 200.000 + penjualan tunai 150.000 → uang seharusnya 350.000. */
beforeEach(async () => {
  await loginWithShift(200_000);
  mockDb.update((s) => {
    if (s.shift) s.shift.cashSales = 150_000;
  });
});

function setup() {
  const user = userEvent.setup();
  const onClose = vi.fn();
  renderWithQuery(<CloseShiftDialog open onClose={onClose} />);
  const dialog = screen.getByRole("dialog", { name: "Tutup shift" });
  const ui = within(dialog);
  return {
    user,
    onClose,
    ui,
    counted: () => ui.getByRole("textbox", { name: "Uang fisik di laci" }),
    submit: () => ui.getByRole("button", { name: "Tutup shift" }),
  };
}

test("tutup shift hitung buta: uang seharusnya tidak tampil sebelum kirim; hasil selisih −Rp5.000", async () => {
  const { user, ui, counted, submit, onClose } = setup();
  expect(submit()).toBeDisabled();
  await user.type(counted(), "345.000");
  expect(ui.queryByText("Uang seharusnya")).toBeNull();
  expect(ui.queryByText("Rp350.000")).toBeNull();
  expect(ui.queryByText("Selisih")).toBeNull();

  await user.click(submit());
  expect(await ui.findByText("Uang seharusnya")).toBeInTheDocument();
  const row = (label: string) =>
    ui.getByText(label).closest("div") as HTMLElement;
  expect(within(row("Uang seharusnya")).getByText("Rp350.000")).toBeVisible();
  expect(within(row("Uang fisik")).getByText("Rp345.000")).toBeVisible();
  const selisih = within(row("Selisih")).getByText("-Rp5.000");
  expect(selisih).toHaveClass("text-danger");
  expect(mockDb.get().shift).toBeNull();

  expect(onClose).not.toHaveBeenCalled();
  await user.click(ui.getByRole("button", { name: "Selesai" }));
  expect(onClose).toHaveBeenCalledOnce();
});

test("selisih lebih tampil dengan tanda +", async () => {
  const { user, ui, counted, submit } = setup();
  await user.type(counted(), "360.000");
  await user.click(submit());
  const selisih = await ui.findByText("+Rp10.000");
  expect(selisih).not.toHaveClass("text-danger");
});

test("kalkulator pecahan mengisi total uang fisik", async () => {
  const { user, ui, counted } = setup();
  await user.click(ui.getByRole("button", { name: "Hitung per pecahan" }));
  await user.type(ui.getByRole("textbox", { name: "100.000" }), "3");
  await user.type(ui.getByRole("textbox", { name: "20.000" }), "2");
  await user.type(ui.getByRole("textbox", { name: "1.000" }), "5");
  await user.type(ui.getByRole("textbox", { name: "Koin" }), "1.500");
  expect(counted()).toHaveValue("346.500");
  expect(ui.queryByText("Uang seharusnya")).toBeNull();
});

test("uang fisik tidak valid → tombol nonaktif", async () => {
  const { user, counted, submit } = setup();
  await user.type(counted(), "12,5");
  expect(submit()).toBeDisabled();
  await user.clear(counted());
  await user.type(counted(), "0");
  expect(submit()).toBeEnabled();
});
