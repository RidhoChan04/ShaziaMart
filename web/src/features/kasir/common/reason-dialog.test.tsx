import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { humanTyping, scannerTyping } from "@/test/typing";
import { ReasonDialog } from "./reason-dialog";

function setup(props: Partial<Parameters<typeof ReasonDialog>[0]> = {}) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  render(
    <ReasonDialog
      open
      title="Batalkan 20261105-0144?"
      description="QRIS · Rp36.000"
      confirmLabel="Batalkan transaksi"
      confirmTone="danger"
      pending={false}
      onSubmit={onSubmit}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { user: humanTyping(), onSubmit, onCancel };
}

const reason = () => screen.getByRole("textbox", { name: "Alasan" });
const confirm = (name = "Batalkan transaksi") =>
  screen.getByRole("button", { name });

test("isian Alasan terfokus; kosong/spasi → tombol nonaktif; Enter kirim alasan yang di-trim", async () => {
  const { user, onSubmit } = setup();
  const dialog = screen.getByRole("dialog", {
    name: "Batalkan 20261105-0144?",
  });
  expect(dialog).toHaveAccessibleDescription(/QRIS · Rp36\.000/);
  expect(reason()).toHaveFocus();
  expect(reason()).toHaveAttribute("maxlength", "200");
  expect(confirm()).toBeDisabled();
  await user.type(reason(), "   ");
  expect(confirm()).toBeDisabled();
  await user.keyboard("{Enter}");
  expect(onSubmit).not.toHaveBeenCalled();
  await user.type(reason(), "Pelanggan batal beli  {Enter}");
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith("Pelanggan batal beli");
});

test("(koreksi mockup M2) confirmTone primary → tombol varian utama hijau (bukan destructive); danger → destructive", () => {
  setup({
    title: "Kasbon melewati limit",
    confirmLabel: "Simpan dengan alasan",
    confirmTone: "primary",
  });
  expect(confirm("Simpan dengan alasan")).toHaveAttribute(
    "data-variant",
    "primary",
  );
  expect(confirm("Simpan dengan alasan")).not.toHaveClass("bg-danger");
  expect(screen.getByRole("button", { name: "Kembali" })).toHaveAttribute(
    "data-variant",
    "outline",
  );
});

test("confirmTone danger → tombol merah", () => {
  setup();
  expect(confirm()).toHaveAttribute("data-variant", "danger");
});

test("Esc dan Kembali memanggil onCancel", async () => {
  const { user, onCancel } = setup();
  await user.keyboard("{Escape}");
  expect(onCancel).toHaveBeenCalledTimes(1);
  await user.click(screen.getByRole("button", { name: "Kembali" }));
  expect(onCancel).toHaveBeenCalledTimes(2);
});

test("pending: tidak bisa ditutup atau dikirim ulang; galat tampil sebagai alert", async () => {
  const { user, onCancel, onSubmit } = setup({
    pending: true,
    error: "Shift belum dibuka",
  });
  expect(screen.getByRole("alert")).toHaveTextContent("Shift belum dibuka");
  await user.type(reason(), "x{Enter}");
  await user.keyboard("{Escape}");
  expect(onCancel).not.toHaveBeenCalled();
  expect(onSubmit).not.toHaveBeenCalled();
  expect(confirm()).toBeDisabled();
  expect(confirm()).toHaveAttribute("aria-busy", "true");
  expect(screen.getByRole("button", { name: "Kembali" })).toBeDisabled();
});

test("(cek ulang) ketikan scanner (< 30 ms) + Enter di isian → ScannedAlert, isian kosong, onSubmit TIDAK dipanggil", async () => {
  const { onSubmit } = setup();
  await scannerTyping().type(reason(), "8991002101234{Enter}");
  // (fix 1) isian bebas: teks khusus alasan, bukan "bukan angka".
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Itu hasil scan barcode, bukan alasan",
  );
  expect(reason()).toHaveValue("");
  expect(onSubmit).not.toHaveBeenCalled();
  await humanTyping().type(reason(), "salah scan{Enter}");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith("salah scan");
});

test("(fix 1) burst scanner + Enter saat fokus di tombol konfirmasi atau di children → tidak mengirim", async () => {
  const { user, onSubmit } = setup({
    children: (
      <input type="radio" name="r" aria-label="pilihan" defaultChecked />
    ),
  });
  await user.type(reason(), "salah input");
  await user.click(screen.getByRole("radio", { name: "pilihan" }));
  await scannerTyping().keyboard("8991002101234{Enter}");
  confirm().focus();
  await scannerTyping().keyboard("8991002101234{Enter}");
  expect(onSubmit).not.toHaveBeenCalled();
  // Enter tangan di isian tetap mengirim.
  await humanTyping().type(reason(), "{Enter}");
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith("salah input");
});

test("(fix 1) tanpa keterangan → tanpa deskripsi kosong yang terbaca", () => {
  setup({ description: "" });
  const dialog = screen.getByRole("dialog", {
    name: "Batalkan 20261105-0144?",
  });
  expect(dialog).not.toHaveAttribute("aria-describedby");
  expect(dialog.querySelector('[data-slot="dialog-description"]')).toBeNull();
});

test("children tampil di antara keterangan dan isian Alasan; isian tetap mendapat fokus pertama", () => {
  setup({
    children: (
      <button type="button" aria-label="pilihan">
        x
      </button>
    ),
  });
  expect(screen.getByRole("button", { name: "pilihan" })).toBeVisible();
  expect(reason()).toHaveFocus();
});

test("dibuka ulang → isian kosong lagi", async () => {
  const onSubmit = vi.fn();
  const props = {
    title: "T",
    description: "D",
    confirmLabel: "OK",
    confirmTone: "primary" as const,
    pending: false,
    onSubmit,
    onCancel: () => {},
  };
  const { rerender } = render(<ReasonDialog open {...props} />);
  await humanTyping().type(reason(), "abc");
  rerender(<ReasonDialog open={false} {...props} />);
  rerender(<ReasonDialog open {...props} />);
  expect(reason()).toHaveValue("");
});

test("(R11) ownerPhone terisi → 'Ragu? Telepon pemilik: …' tampil di bawah isian Alasan", () => {
  setup({ ownerPhone: "0812-3456-7890" });
  expect(
    screen.getByText("Ragu? Telepon pemilik: 0812-3456-7890"),
  ).toBeVisible();
});

test("(R11) ownerPhone null atau tidak diisi → tidak ada baris telepon", () => {
  setup({ ownerPhone: null });
  expect(screen.queryByText(/Telepon pemilik/)).toBeNull();
});

test("(R11) tanpa prop ownerPhone → tidak ada baris telepon", () => {
  setup();
  expect(screen.queryByText(/Telepon pemilik/)).toBeNull();
});
