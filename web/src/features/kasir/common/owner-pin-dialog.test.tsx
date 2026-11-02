import { render, screen } from "@testing-library/react";
import { expect, test, vi } from "vitest";
import { humanTyping, scannerTyping } from "@/test/typing";
import { OwnerPinDialog } from "./owner-pin-dialog";

function setup(props: Partial<Parameters<typeof OwnerPinDialog>[0]> = {}) {
  const onSubmit = vi.fn();
  const onCancel = vi.fn();
  render(
    <OwnerPinDialog
      open
      title="PIN pemilik"
      requireReason={false}
      onSubmit={onSubmit}
      onCancel={onCancel}
      {...props}
    />,
  );
  return { user: humanTyping(), onSubmit, onCancel };
}

const pin = () => screen.getByLabelText("PIN");
const confirm = () => screen.getByRole("button", { name: "Konfirmasi" });

test("hanya digit, 6 angka baru bisa dikonfirmasi; Enter mengirim", async () => {
  const { user, onSubmit } = setup();
  expect(
    screen.getByRole("dialog", { name: "PIN pemilik" }),
  ).toBeInTheDocument();
  expect(pin()).toHaveFocus();
  expect(pin()).toHaveAttribute("autocomplete", "off");
  await user.type(pin(), "12a34");
  expect(pin()).toHaveValue("1234");
  expect(confirm()).toBeDisabled();
  await user.type(pin(), "5678{Enter}");
  expect(pin()).toHaveValue("123456");
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith("123456");
});

test("requireReason: Alasan wajib diisi", async () => {
  const { user, onSubmit } = setup({
    title: "Batalkan penjualan",
    requireReason: true,
  });
  await user.type(pin(), "999999");
  expect(confirm()).toBeDisabled();
  await user.type(screen.getByRole("textbox", { name: "Alasan" }), "  ");
  expect(confirm()).toBeDisabled();
  await user.type(
    screen.getByRole("textbox", { name: "Alasan" }),
    "salah input",
  );
  await user.click(confirm());
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith("999999", "salah input");
});

test("error tampil sebagai alert; pending menonaktifkan; Batal memanggil onCancel", async () => {
  const { user, onCancel } = setup({ error: "PIN salah" });
  expect(screen.getByRole("alert")).toHaveTextContent("PIN salah");
  await user.click(screen.getByRole("button", { name: "Batal" }));
  expect(onCancel).toHaveBeenCalledTimes(1);
});

test("pending: tombol nonaktif dan Esc tidak membatalkan", async () => {
  const { user, onCancel, onSubmit } = setup({ pending: true });
  await user.type(pin(), "999999{Enter}");
  expect(confirm()).toBeDisabled();
  await user.keyboard("{Escape}");
  expect(onCancel).not.toHaveBeenCalled();
  expect(onSubmit).not.toHaveBeenCalled();
});

test("scan di kolom PIN: rentetan dibuang, Enter penutupnya tidak mengirim", async () => {
  const { user, onSubmit } = setup();
  await user.type(pin(), "99999");
  await scannerTyping().type(pin(), "8991002101234{Enter}");
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Itu barcode, bukan angka",
  );
  expect(pin()).toHaveValue("99999");
  expect(onSubmit).not.toHaveBeenCalled();
  await user.type(pin(), "9{Enter}");
  expect(screen.queryByRole("alert")).toBeNull();
  expect(onSubmit).toHaveBeenCalledExactlyOnceWith("999999");
});
