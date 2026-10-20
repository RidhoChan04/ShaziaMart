import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, expect, test, vi } from "vitest";
import { mockDb } from "@/mocks/db";
import { loginWithShift } from "@/mocks/handlers/test-helpers";
import { setScenario } from "@/mocks/scenarios";
import type { Sale } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { renderWithQuery } from "@/test/render-app";
import { HistorySheet } from "./history-sheet";

function makeSale(n: number, over: Partial<Sale> = {}): Sale {
  return {
    id: `sale-${n}`,
    number: `20261020-000${n}`,
    createdAt: Date.now() - (10 - n) * 60_000,
    kasirName: "Rina",
    items: [],
    total: n * 10_000,
    payments: [{ method: "cash", amount: n * 10_000 }],
    cashReceived: n * 10_000,
    change: 0,
    customerId: null,
    status: "selesai",
    printStatus: "tercetak",
    ...over,
  };
}

beforeEach(async () => {
  await loginWithShift();
  mockDb.update((s) => {
    s.sales.push(
      makeSale(1),
      makeSale(2, {
        status: "dibatalkan",
        payments: [{ method: "qris", amount: 20_000 }],
      }),
      makeSale(3, {
        printStatus: "gagal",
        payments: [
          { method: "cash", amount: 10_000 },
          { method: "credit", amount: 20_000 },
        ],
      }),
    );
  });
});

function setup() {
  const onClose = vi.fn();
  renderWithQuery(<HistorySheet open onClose={onClose} />);
  return { user: userEvent.setup(), onClose };
}

const row = (n: number) =>
  screen.getByText(new RegExp(`20261020-000${n}`)).closest("li") as HTMLElement;

const saleStatus = (id: string) =>
  mockDb.get().sales.find((s) => s.id === id)?.status;

test("menampilkan penjualan hari ini terbaru dulu", async () => {
  setup();
  await screen.findByText(/20261020-0003/);
  const numbers = screen
    .getAllByRole("listitem")
    .map((li) => li.textContent?.match(/20261020-000\d/)?.[0]);
  expect(numbers).toEqual(["20261020-0003", "20261020-0002", "20261020-0001"]);
  expect(within(row(1)).getByText("Tunai")).toBeVisible();
  expect(within(row(1)).getByText("Rp10.000")).toBeVisible();
  expect(within(row(3)).getByText("Campuran")).toBeVisible();
  expect(within(row(3)).getByText("Struk gagal")).toBeVisible();
  expect(within(row(2)).getByText("QRIS")).toBeVisible();
  expect(within(row(2)).getByText("Dibatalkan")).toBeVisible();
  expect(within(row(2)).getByText("Rp20.000")).toHaveClass("line-through");
  expect(
    within(row(2)).getByRole("button", { name: "Cetak ulang 20261020-0002" }),
  ).toBeDisabled();
  expect(within(row(2)).queryByRole("button", { name: /Batalkan/ })).toBeNull();
  expect(within(row(1)).getByText(/^\d{2}\.\d{2}$/)).toBeVisible();
});

test("tanpa transaksi menampilkan keadaan kosong", async () => {
  mockDb.update((s) => {
    s.sales = [];
  });
  setup();
  expect(await screen.findByText("Belum ada transaksi hari ini")).toBeVisible();
});

test("Cetak ulang memanggil print dan menampilkan 'Struk dicetak'", async () => {
  const { user } = setup();
  await screen.findByText(/20261020-0003/);
  await user.click(
    within(row(3)).getByRole("button", { name: "Cetak ulang 20261020-0003" }),
  );
  expect(await screen.findByText("Struk dicetak")).toBeInTheDocument();
  await waitFor(() =>
    expect(within(row(3)).queryByText("Struk gagal")).toBeNull(),
  );
});

test("printer gagal → 'Struk gagal dicetak'", async () => {
  setScenario("printer-gagal");
  const { user } = setup();
  await screen.findByText(/20261020-0001/);
  await user.click(
    within(row(1)).getByRole("button", { name: "Cetak ulang 20261020-0001" }),
  );
  expect(await screen.findByText("Struk gagal dicetak")).toBeInTheDocument();
});

test("Batalkan: PIN salah → 'PIN salah'; PIN 999999 + alasan → status Dibatalkan", async () => {
  const { user } = setup();
  await screen.findByText(/20261020-0001/);
  await user.click(
    within(row(1)).getByRole("button", { name: "Batalkan 20261020-0001" }),
  );
  const dialog = await screen.findByRole("dialog", { name: "PIN pemilik" });
  const ui = within(dialog);
  await user.type(ui.getByLabelText("PIN"), "111111");
  await user.type(ui.getByLabelText("Alasan"), "Salah input");
  await user.click(ui.getByRole("button", { name: "Konfirmasi" }));
  expect(await ui.findByText("PIN salah")).toBeVisible();
  expect(saleStatus("sale-1")).toBe("selesai");
  expect(within(row(1)).queryByText("Dibatalkan")).toBeNull();

  await user.clear(ui.getByLabelText("PIN"));
  await user.type(ui.getByLabelText("PIN"), "999999");
  await user.click(ui.getByRole("button", { name: "Konfirmasi" }));
  expect(await screen.findByText("Transaksi dibatalkan")).toBeInTheDocument();
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: "PIN pemilik" })).toBeNull(),
  );
  await waitFor(() =>
    expect(within(row(1)).getByText("Dibatalkan")).toBeVisible(),
  );
  expect(saleStatus("sale-1")).toBe("dibatalkan");
});

test("alasan kosong → tombol kirim nonaktif", async () => {
  const { user } = setup();
  await screen.findByText(/20261020-0001/);
  await user.click(
    within(row(1)).getByRole("button", { name: "Batalkan 20261020-0001" }),
  );
  const ui = within(await screen.findByRole("dialog", { name: "PIN pemilik" }));
  await user.type(ui.getByLabelText("PIN"), "999999");
  expect(ui.getByRole("button", { name: "Konfirmasi" })).toBeDisabled();
});

test("Esc menutup riwayat", async () => {
  const { user, onClose } = setup();
  await screen.findByText(/20261020-0001/);
  await user.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalled();
});
