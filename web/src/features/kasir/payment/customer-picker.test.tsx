import { screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { useState } from "react";
import { expect, test } from "vitest";
import { mockDb } from "@/mocks/db";
import type { Customer } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { renderWithQuery } from "@/test/render-app";
import { CustomerPicker } from "./customer-picker";

function Harness() {
  const [value, setValue] = useState<Customer | null>(null);
  return <CustomerPicker value={value} onChange={setValue} />;
}

function setup() {
  renderWithQuery(<Harness />);
  return { user: userEvent.setup() };
}

const search = () => screen.getByRole("searchbox", { name: "Cari pelanggan" });

test("cari per nomor telepon, pilih, lalu Ganti pelanggan", async () => {
  const { user } = setup();
  await user.type(search(), "500004");
  await waitFor(() => {
    expect(screen.queryByRole("button", { name: /Bu Sari/ })).toBeNull();
    expect(
      screen.getByRole("button", { name: /Pak Udin/ }),
    ).toBeInTheDocument();
  });
  const option = screen.getByRole("button", { name: /Pak Udin/ });
  expect(option).toHaveTextContent("Pak Udin · 081234500004");
  expect(option).toHaveTextContent("Saldo Rp50.000 · Limit Rp200.000");
  await user.click(option);
  expect(screen.queryByRole("searchbox")).toBeNull();
  expect(screen.getByText("Pak Udin · 081234500004")).toBeInTheDocument();
  await user.click(screen.getByRole("button", { name: "Ganti pelanggan" }));
  expect(search()).toHaveFocus();
});

test("Tambah pelanggan: validasi nama & telepon, lalu tersimpan dan terpilih", async () => {
  const { user } = setup();
  await user.click(screen.getByRole("button", { name: "Tambah pelanggan" }));
  const name = screen.getByRole("textbox", { name: "Nama" });
  const phone = screen.getByRole("textbox", { name: "No. HP" });
  const save = screen.getByRole("button", { name: "Simpan pelanggan" });
  await user.type(name, "B");
  await user.type(phone, "0812");
  await user.click(save);
  expect(screen.getByText("Nama minimal 2 huruf")).toBeInTheDocument();
  expect(screen.getByText("No. HP harus 8–15 digit angka")).toBeInTheDocument();
  expect(mockDb.get().customers).toHaveLength(5);

  await user.type(name, "u Ani");
  await user.type(phone, "34567890");
  await user.click(save);
  expect(await screen.findByText("Bu Ani · 081234567890")).toBeInTheDocument();
  expect(screen.getByText("Saldo Rp0 · Limit Rp500.000")).toBeInTheDocument();
  expect(mockDb.get().customers.map((c) => c.name)).toContain("Bu Ani");
});
