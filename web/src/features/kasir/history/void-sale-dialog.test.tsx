import { render, screen, within } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import type { Sale } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { humanTyping, scannerTyping } from "@/test/typing";
import { VoidSaleDialog } from "./void-sale-dialog";

const sale = (over: Partial<Sale> = {}): Sale => ({
  id: "s1",
  number: "20261105-0144",
  createdAt: Date.UTC(2026, 10, 5, 5, 58),
  kasirName: "Rina",
  shiftId: "sh1",
  items: [],
  total: 36_000,
  payments: [{ method: "qris", amount: 36_000 }],
  cashReceived: 0,
  change: 0,
  customerId: null,
  status: "selesai",
  printStatus: "tercetak",
  ...over,
});

function setup(props: Partial<Parameters<typeof VoidSaleDialog>[0]> = {}) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  render(
    <VoidSaleDialog
      sale={sale()}
      fromClosedShift={false}
      pending={false}
      onSubmit={onSubmit}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { user: humanTyping(), onSubmit, onCancel };
}

const dialog = (name = "Batalkan 20261105-0144?") =>
  screen.getByRole("dialog", { name });
const confirm = () =>
  screen.getByRole("button", { name: "Batalkan transaksi" });

test("(koreksi mockup M1) transaksi QRIS: radio 'Tunai dari laci' terpilih bawaan → body {reason, qrisRefundSource: 'laci'}", async () => {
  const { user, onSubmit } = setup();
  const ui = within(dialog());
  expect(ui.getByText("QRIS · Rp36.000")).toBeVisible();
  const group = ui.getByRole("group", { name: "Kembalikan QRIS Rp36.000" });
  expect(
    within(group).getByRole("radio", { name: "Tunai dari laci" }),
  ).toBeChecked();
  expect(
    within(group).getByRole("radio", { name: "Transfer oleh pemilik nanti" }),
  ).not.toBeChecked();
  expect(ui.getByRole("textbox", { name: "Alasan" })).toHaveFocus();
  expect(confirm()).toHaveAttribute("data-variant", "danger");
  await user.type(
    ui.getByRole("textbox", { name: "Alasan" }),
    "Pelanggan batal beli{Enter}",
  );
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith(
    "Pelanggan batal beli",
    "laci",
  );
});

test("(fix 1) burst scanner + Enter saat fokus di radio QRIS → tidak membatalkan", async () => {
  const { user, onSubmit } = setup();
  await user.type(screen.getByRole("textbox", { name: "Alasan" }), "salah");
  await user.click(
    screen.getByRole("radio", { name: "Transfer oleh pemilik nanti" }),
  );
  expect(
    screen.getByRole("radio", { name: "Transfer oleh pemilik nanti" }),
  ).toHaveFocus();
  await scannerTyping().keyboard("8991002101234{Enter}");
  expect(onSubmit).not.toHaveBeenCalled();
  await user.click(confirm());
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith("salah", "pemilik");
});

test("pilih 'Transfer oleh pemilik nanti' → 'pemilik'", async () => {
  const { user, onSubmit } = setup();
  await user.click(
    screen.getByRole("radio", { name: "Transfer oleh pemilik nanti" }),
  );
  await user.type(screen.getByRole("textbox", { name: "Alasan" }), "salah");
  await user.click(confirm());
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith("salah", "pemilik");
});

test("tanpa QRIS → tanpa radio, body qrisRefundSource null; tanpa kalimat Tunai (fromClosedShift false)", async () => {
  const { user, onSubmit } = setup({
    sale: sale({
      payments: [{ method: "cash", amount: 36_000 }],
      cashReceived: 50_000,
      change: 14_000,
    }),
  });
  const ui = within(dialog());
  expect(ui.getByText("Tunai · Rp36.000")).toBeVisible();
  expect(ui.queryByRole("radio")).toBeNull();
  expect(ui.queryByText(/dikembalikan dari laci/)).toBeNull();
  await user.type(ui.getByRole("textbox", { name: "Alasan" }), "x{Enter}");
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith("x", null);
});

test("(cek ulang M1) fromClosedShift true, tunai 30.000 + QRIS 20.000 + kasbon 10.000 (customerName 'Bu Sari') → kalimat Tunai, radio QRIS, kalimat Kasbon; tanpa kalimat 'di luar laci'", async () => {
  const { user, onSubmit } = setup({
    fromClosedShift: true,
    sale: {
      ...sale({
        number: "20261104-0145",
        total: 60_000,
        payments: [
          { method: "cash", amount: 30_000 },
          { method: "qris", amount: 20_000 },
          { method: "credit", amount: 10_000 },
        ],
        cashReceived: 50_000,
        change: 20_000,
        customerId: "c1",
      }),
      customerName: "Bu Sari",
    },
  });
  const ui = within(dialog("Batalkan 20261104-0145?"));
  expect(
    ui.getByText("Tunai Rp30.000 dikembalikan dari laci shift ini."),
  ).toBeVisible();
  expect(
    ui.getByRole("group", { name: "Kembalikan QRIS Rp20.000" }),
  ).toBeVisible();
  expect(ui.getByText("Kasbon Bu Sari dikurangi Rp10.000.")).toBeVisible();
  expect(ui.queryByText(/di luar laci/)).toBeNull();
  expect(ui.queryByText("Campuran · Rp60.000")).toBeNull();
  await user.type(ui.getByRole("textbox", { name: "Alasan" }), "rusak{Enter}");
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith("rusak", "laci");
});

test("(fix 1) fromClosedShift tanpa bagian tunai (QRIS-saja) → tanpa deskripsi kosong", () => {
  setup({ fromClosedShift: true });
  const d = dialog();
  expect(d).not.toHaveAttribute("aria-describedby");
  expect(
    within(d).getByRole("group", { name: "Kembalikan QRIS Rp36.000" }),
  ).toBeVisible();
  expect(within(d).queryByText(/dikembalikan dari laci/)).toBeNull();
});

test("pending: radio nonaktif; galat tampil; sale null → tertutup", () => {
  setup({
    pending: true,
    error: "Transaksi lebih dari 7 hari — batalkan dari app pemilik",
  });
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Transaksi lebih dari 7 hari — batalkan dari app pemilik",
  );
  expect(screen.getByRole("radio", { name: "Tunai dari laci" })).toBeDisabled();
});

test("sale null → tanpa dialog; dibuka lagi untuk transaksi lain → pilihan kembali ke Tunai dari laci", async () => {
  const onSubmit = vi.fn();
  const base = {
    fromClosedShift: false,
    pending: false,
    onSubmit,
    onCancel: () => {},
  };
  const { rerender } = render(<VoidSaleDialog sale={null} {...base} />);
  expect(screen.queryByRole("dialog")).toBeNull();
  rerender(<VoidSaleDialog sale={sale()} {...base} />);
  await humanTyping().click(
    screen.getByRole("radio", { name: "Transfer oleh pemilik nanti" }),
  );
  rerender(<VoidSaleDialog sale={null} {...base} />);
  rerender(
    <VoidSaleDialog
      sale={sale({ id: "s2", number: "20261105-0150" })}
      {...base}
    />,
  );
  expect(screen.getByRole("radio", { name: "Tunai dari laci" })).toBeChecked();
});

test("(R11) prop ownerPhone diteruskan ke dialog alasan", () => {
  setup({ ownerPhone: "0812-3456-7890" });
  expect(
    within(dialog()).getByText("Ragu? Telepon pemilik: 0812-3456-7890"),
  ).toBeVisible();
});
