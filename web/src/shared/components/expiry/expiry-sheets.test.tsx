import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { expect, test, vi } from "vitest";
import { ExpiryActionSheet } from "./expiry-action-sheet";
import { ExpiryDateSheet } from "./expiry-date-sheet";
import { ExpiryLogRow } from "./expiry-log-row";
import { ExpiryRemovalSheet } from "./expiry-removal-sheet";
import { ExpiryRow } from "./expiry-row";

test("ExpiryRow: nama, ±jumlah · ED, teks waktu; ⋯ 'Pilihan' ≥ 44px memanggil onMore dengan tombolnya", async () => {
  const onMore = vi.fn();
  const user = userEvent.setup();
  render(
    <ExpiryRow
      name="Sari Roti Tawar"
      qtyText="3 bungkus"
      expiryText="31 Okt 2026"
      whenText="Lewat 2 hari"
      tone="bad"
      onMore={onMore}
    />,
  );
  expect(screen.getByText("Sari Roti Tawar")).toBeVisible();
  expect(screen.getByText(/±3 bungkus/)).toHaveTextContent(
    "±3 bungkus · ED 31 Okt 2026",
  );
  expect(screen.getByText("Lewat 2 hari")).toBeVisible();
  const more = screen.getByRole("button", { name: "Pilihan" });
  expect(more).toHaveClass("size-11");
  await user.click(more);
  expect(onMore).toHaveBeenCalledWith(more);
});

test("ExpiryLogRow: teks dan keterangan", () => {
  render(
    <ExpiryLogRow
      kind="keluar"
      text="Rina mengeluarkan 2 Roti"
      detail="Kedaluwarsa · Hari ini 10.00"
    />,
  );
  expect(screen.getByText("Rina mengeluarkan 2 Roti")).toBeVisible();
  expect(screen.getByText("Kedaluwarsa · Hari ini 10.00")).toBeVisible();
});

const head = {
  name: "Susu Kental Manis",
  summary: "±6 kaleng · ED 15 Nov 2026 · CV Sumber Rejeki, 3 Agu",
};

test("ExpiryActionSheet: kepala, dua pilihan, catatan alasan, Batal; offline menonaktifkan pilihan", async () => {
  const onDate = vi.fn();
  const onRemove = vi.fn();
  const onClose = vi.fn();
  const user = userEvent.setup();
  const props = {
    open: true,
    ...head,
    actorName: "Rina",
    onChangeDate: onDate,
    onRemove,
    onClose,
  };
  const { rerender } = render(<ExpiryActionSheet {...props} offline={false} />);
  expect(screen.getByText(head.name)).toBeVisible();
  expect(screen.getByText(head.summary)).toBeVisible();
  expect(
    screen.getByText("Alasan: kedaluwarsa · tercatat atas nama Rina"),
  ).toBeVisible();
  await user.click(screen.getByRole("button", { name: /Ubah tanggal ED/ }));
  expect(onDate).toHaveBeenCalledOnce();
  await user.click(screen.getByRole("button", { name: /Keluarkan dari stok/ }));
  expect(onRemove).toHaveBeenCalledOnce();
  await user.click(screen.getByRole("button", { name: "Batal" }));
  expect(onClose).toHaveBeenCalledOnce();

  rerender(<ExpiryActionSheet {...props} offline />);
  expect(
    screen.getByRole("button", { name: /Ubah tanggal ED/ }),
  ).toBeDisabled();
  expect(
    screen.getByRole("button", { name: /Keluarkan dari stok/ }),
  ).toBeDisabled();
  expect(screen.getByText("Perlu tersambung ke toko")).toBeVisible();
});

test("ExpiryDateSheet: simpan mengirim tanggal terpilih; galat tampil; pending menonaktifkan tombol", async () => {
  const onSave = vi.fn();
  const base = {
    open: true,
    name: "Roti",
    currentDate: "2026-10-31",
    offline: false,
    pending: false,
    error: null,
    onSave,
    onClose: vi.fn(),
  };
  const { rerender } = render(<ExpiryDateSheet {...base} />);
  expect(screen.getByRole("dialog", { name: "Ubah tanggal ED" })).toBeVisible();
  expect(screen.getByText("31 Okt 2026")).toBeVisible();
  fireEvent.change(screen.getByLabelText("Tanggal kedaluwarsa"), {
    target: { value: "2026-12-01" },
  });
  expect(screen.getByText("1 Des 2026")).toBeVisible();
  await userEvent.click(screen.getByRole("button", { name: "Simpan tanggal" }));
  expect(onSave).toHaveBeenCalledWith("2026-12-01");

  rerender(
    <ExpiryDateSheet {...base} error="Tanggal kedaluwarsa tidak valid" />,
  );
  expect(screen.getByRole("alert")).toHaveTextContent(
    "Tanggal kedaluwarsa tidak valid",
  );
  rerender(<ExpiryDateSheet {...base} pending />);
  expect(screen.getByRole("button", { name: "Simpan tanggal" })).toBeDisabled();
});

test("ExpiryRemovalSheet: default perkiraan; ubah → 'Keluarkan 2'; nol → 'Jumlah minimal 1' tanpa onSubmit", async () => {
  const onSubmit = vi.fn();
  const user = userEvent.setup();
  render(
    <ExpiryRemovalSheet
      open
      name="Sari Roti Tawar"
      estimateQtyBase={3}
      unitName="bungkus"
      unitSize={1}
      isCurah={false}
      actorName="Rina"
      offline={false}
      pending={false}
      error={null}
      onSubmit={onSubmit}
      onClose={vi.fn()}
    />,
  );
  expect(
    screen.getByRole("dialog", { name: "Keluarkan dari stok" }),
  ).toBeVisible();
  expect(
    screen.getByText("Alasan: kedaluwarsa · tercatat atas nama Rina"),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Keluarkan 3" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Kurangi Bungkus" }));
  expect(screen.getByRole("button", { name: "Keluarkan 2" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Keluarkan 2" }));
  expect(onSubmit).toHaveBeenCalledWith(2);

  await user.click(screen.getByRole("button", { name: "Kurangi Bungkus" }));
  await user.click(screen.getByRole("button", { name: "Kurangi Bungkus" }));
  onSubmit.mockClear();
  await user.click(screen.getByRole("button", { name: "Keluarkan" }));
  expect(onSubmit).not.toHaveBeenCalled();
  expect(screen.getByRole("alert")).toHaveTextContent("Jumlah minimal 1");
});
