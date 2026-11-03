import { screen, within } from "@testing-library/react";
import { http } from "msw";
import { useState } from "react";
import { beforeEach, expect, test, vi } from "vitest";
import { mockDb } from "@/mocks/db";
import { loginWithShift } from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
import type { ShiftClosure } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { renderWithQuery } from "@/test/render-app";
import { humanTyping, scannerTyping } from "@/test/typing";
import { CloseShiftDialog } from "./close-shift-dialog";
import { ShiftClosureDialog } from "./shift-closure-dialog";

/** Modal awal 200.000 + penjualan tunai 150.000 → uang seharusnya 350.000. */
beforeEach(async () => {
  await loginWithShift(200_000);
  mockDb.update((s) => {
    if (s.shift) s.shift.cashSales = 150_000;
  });
});

/** Sama seperti layout: jendela hitung → jendela hasil. */
function Harness({ onDone }: { onDone: () => void }) {
  const [closure, setClosure] = useState<ShiftClosure | null>(null);
  return (
    <>
      <CloseShiftDialog
        open={closure === null}
        onClose={() => {}}
        onClosed={setClosure}
      />
      <ShiftClosureDialog closure={closure} onDone={onDone} />
    </>
  );
}

function setup() {
  const user = humanTyping();
  const onClose = vi.fn();
  renderWithQuery(<Harness onDone={onClose} />);
  const ui = within(screen.getByRole("dialog", { name: "Tutup shift" }));
  return {
    user,
    onClose,
    ui,
    result: () => within(screen.getByRole("dialog", { name: "Tutup shift" })),
    counted: () => ui.getByRole("textbox", { name: "Uang fisik di laci" }),
    submit: () => ui.getByRole("button", { name: "Tutup shift" }),
  };
}

test("tutup shift hitung buta: uang seharusnya tidak tampil sebelum kirim; hasil selisih −Rp5.000", async () => {
  const { user, counted, submit, onClose, result } = setup();
  expect(submit()).toBeDisabled();
  await user.type(counted(), "345.000");
  expect(screen.queryByText("Uang seharusnya")).toBeNull();
  expect(screen.queryByText("Rp350.000")).toBeNull();
  expect(screen.queryByText("Selisih")).toBeNull();

  await user.click(submit());
  expect(await screen.findByText("Uang seharusnya")).toBeInTheDocument();
  const ui = result();
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

test("hasil tutup shift: 'Bayar supplier' '-Rp1.442.000' di atas 'Uang seharusnya' 'Rp208.000'; Selisih '-Rp5.000'", async () => {
  // Modal 1.500.000 + tunai 150.000 − barang masuk dibayar dari laci 1.442.000.
  mockDb.update((s) => {
    if (!s.shift) return;
    s.shift.openingCash = 1_500_000;
    s.shift.cashOuts.push({
      id: "c1",
      at: 1,
      amount: 1_442_000,
      receiptId: "draf-1",
      kind: "bayar",
    });
  });
  const { user, counted, submit, result } = setup();
  await user.type(counted(), "203.000");
  expect(screen.queryByText("Bayar supplier")).toBeNull();
  await user.click(submit());

  expect(await screen.findByText("Bayar supplier")).toBeInTheDocument();
  const ui = result();
  const labels = ui.getAllByRole("term").map((t) => t.textContent);
  expect(labels).toEqual([
    "Bayar supplier",
    "Uang seharusnya",
    "Uang fisik",
    "Selisih",
  ]);
  const row = (label: string) =>
    ui.getByText(label).closest("div") as HTMLElement;
  expect(within(row("Bayar supplier")).getByText("-Rp1.442.000")).toBeVisible();
  expect(within(row("Uang seharusnya")).getByText("Rp208.000")).toBeVisible();
  expect(within(row("Selisih")).getByText("-Rp5.000")).toHaveClass(
    "text-danger",
  );
});

test("koreksi bersih masuk ke laci → 'Bayar supplier' bertanda +", async () => {
  mockDb.update((s) => {
    s.shift?.cashOuts.push({
      id: "c1",
      at: 1,
      amount: -32_400,
      receiptId: "draf-1",
      kind: "koreksi",
    });
  });
  const { user, counted, submit, result } = setup();
  await user.type(counted(), "380.000");
  await user.click(submit());
  await screen.findByText("Bayar supplier");
  const row = (label: string) =>
    result().getByText(label).closest("div") as HTMLElement;
  expect(within(row("Bayar supplier")).getByText("+Rp32.400")).toBeVisible();
  expect(within(row("Uang seharusnya")).getByText("Rp382.400")).toBeVisible();
});

test("tanpa uang keluar → tidak ada baris 'Bayar supplier'", async () => {
  const { user, counted, submit } = setup();
  await user.type(counted(), "350.000");
  await user.click(submit());
  expect(await screen.findByText("Uang seharusnya")).toBeInTheDocument();
  expect(screen.queryByText("Bayar supplier")).toBeNull();
});

test("selisih lebih tampil dengan tanda +", async () => {
  const { user, counted, submit } = setup();
  await user.type(counted(), "360.000");
  await user.click(submit());
  const selisih = await screen.findByText("+Rp10.000");
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

test("scan di Uang fisik di laci: rentetan dibuang, Enter penutupnya tidak menutup shift", async () => {
  const closes = { n: 0 };
  server.use(
    http.post("/api/shifts/current/close", () => {
      closes.n += 1;
    }),
  );
  const { user, ui, counted } = setup();
  await user.type(counted(), "345.000");
  await scannerTyping().type(counted(), "8991002101234{Enter}");

  expect(ui.getByRole("alert")).toHaveTextContent("Itu barcode, bukan angka");
  expect(counted()).toHaveValue("345.000");
  await new Promise((r) => setTimeout(r, 50));
  expect(closes.n).toBe(0);
  expect(mockDb.get().shift).not.toBeNull();

  await user.type(counted(), "{Enter}");
  expect(await screen.findByText("Uang seharusnya")).toBeInTheDocument();
  expect(closes.n).toBe(1);
});
