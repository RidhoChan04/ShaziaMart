import { screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { beforeEach, expect, test, vi } from "vitest";
import { type MockCreditPayment, type MockSale, mockDb } from "@/mocks/db";
import { loginWithShift } from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
import { setScenario } from "@/mocks/scenarios";
import type { Sale } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { renderWithQuery } from "@/test/render-app";
import { humanTyping } from "@/test/typing";
import { KasirScreen } from "../screen/kasir-screen";
import { ShiftActions } from "../shift/shift-actions";
import { HistorySheet } from "./history-sheet";

/** Shift yang sedang buka (dibuka `loginWithShift`). */
const openShiftId = () => mockDb.get().shift?.id ?? "";

function makeSale(n: number, over: Partial<Sale> = {}): MockSale {
  return {
    id: `sale-${n}`,
    number: `20261020-000${n}`,
    createdAt: Date.now() - (10 - n) * 60_000,
    kasirName: "Rina",
    shiftId: openShiftId(),
    items: [],
    total: n * 10_000,
    payments: [{ method: "cash", amount: n * 10_000 }],
    cashReceived: n * 10_000,
    change: 0,
    customerId: null,
    status: "selesai",
    printStatus: "tercetak",
    costTotal: 0,
    lineCosts: [],
    voidedAt: null,
    voidedById: null,
    voidedByName: null,
    voidReason: null,
    voidChannel: null,
    voidRefund: null,
    creditOverLimit: null,
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
  return { user: humanTyping(), onClose };
}

const row = (n: number) =>
  screen.getByText(new RegExp(`20261020-000${n}`)).closest("li") as HTMLElement;

const stored = (id: string) => mockDb.get().sales.find((s) => s.id === id);
const saleStatus = (id: string) => stored(id)?.status;

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
  expect(
    await screen.findByText("Belum ada transaksi di shift ini"),
  ).toBeVisible();
});

test("(jawaban pemilik J0) judul 'Riwayat shift ini'; penjualan shift sebelumnya (hari sama) tidak tampil", async () => {
  mockDb.update((s) => {
    s.sales.push(
      makeSale(4, {
        shiftId: "shift-pagi",
        createdAt: Date.now() - 60 * 60_000,
      }),
    );
  });
  setup();
  expect(
    screen.getByRole("dialog", { name: "Riwayat shift ini" }),
  ).toBeInTheDocument();
  await screen.findByText(/20261020-0003/);
  expect(screen.queryByText(/20261020-0004/)).toBeNull();
  expect(screen.getAllByRole("listitem")).toHaveLength(3);
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

test("(ruling R4) Batalkan: 'Batalkan #…?' → alasan → 'Transaksi dibatalkan', 'Dibatalkan'; tercatat alasan & pembatal", async () => {
  const { user } = setup();
  await screen.findByText(/20261020-0001/);
  await user.click(
    within(row(1)).getByRole("button", { name: "Batalkan 20261020-0001" }),
  );
  const dialog = await screen.findByRole("dialog", {
    name: "Batalkan 20261020-0001?",
  });
  const ui = within(dialog);
  expect(ui.getByText("Tunai · Rp10.000")).toBeVisible();
  expect(ui.queryByRole("radio")).toBeNull();
  expect(ui.getByRole("textbox", { name: "Alasan" })).toHaveFocus();
  await user.type(ui.getByRole("textbox", { name: "Alasan" }), "Salah input");
  await user.click(ui.getByRole("button", { name: "Batalkan transaksi" }));
  expect(await screen.findByText("Transaksi dibatalkan")).toBeInTheDocument();
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: "Batalkan 20261020-0001?" }),
    ).toBeNull(),
  );
  await waitFor(() =>
    expect(within(row(1)).getByText("Dibatalkan")).toBeVisible(),
  );
  expect(stored("sale-1")).toMatchObject({
    status: "dibatalkan",
    voidReason: "Salah input",
    voidedByName: "Rina",
    voidChannel: "kasir",
  });
});

test("alasan kosong → tombol kirim nonaktif", async () => {
  const { user } = setup();
  await screen.findByText(/20261020-0001/);
  await user.click(
    within(row(1)).getByRole("button", { name: "Batalkan 20261020-0001" }),
  );
  const ui = within(
    await screen.findByRole("dialog", { name: "Batalkan 20261020-0001?" }),
  );
  const confirm = ui.getByRole("button", { name: "Batalkan transaksi" });
  expect(confirm).toBeDisabled();
  await user.type(ui.getByRole("textbox", { name: "Alasan" }), "   ");
  expect(confirm).toBeDisabled();
});

test("(koreksi mockup M1) transaksi QRIS shift ini: pilih Transfer oleh pemilik nanti → tersimpan tanpa uang laci", async () => {
  mockDb.update((s) => {
    s.sales.push(
      makeSale(5, { payments: [{ method: "qris", amount: 50_000 }] }),
    );
  });
  const { user } = setup();
  await screen.findByText(/20261020-0005/);
  await user.click(
    within(row(5)).getByRole("button", { name: "Batalkan 20261020-0005" }),
  );
  const ui = within(
    await screen.findByRole("dialog", { name: "Batalkan 20261020-0005?" }),
  );
  expect(ui.getByRole("radio", { name: "Tunai dari laci" })).toBeChecked();
  await user.click(
    ui.getByRole("radio", { name: "Transfer oleh pemilik nanti" }),
  );
  await user.type(ui.getByRole("textbox", { name: "Alasan" }), "batal{Enter}");
  // Toast tes sebelumnya bisa masih ada di sonner: tunggu baris bertanda saja.
  await waitFor(() =>
    expect(within(row(5)).getByText("Dibatalkan")).toBeVisible(),
  );
  expect(stored("sale-5")?.voidRefund).toEqual({
    cash: 0,
    qris: 50_000,
    qrisSource: "pemilik",
    drawer: 0,
  });
  expect(mockDb.get().shift?.saleRefunds).toEqual([]);
});

test("409 → pesan di dialog, transaksi tetap", async () => {
  const { user } = setup();
  await screen.findByText(/20261020-0001/);
  await user.click(
    within(row(1)).getByRole("button", { name: "Batalkan 20261020-0001" }),
  );
  const ui = within(
    await screen.findByRole("dialog", { name: "Batalkan 20261020-0001?" }),
  );
  // Shift ditutup dari tab lain di sela-sela.
  mockDb.update((s) => {
    s.shift = null;
  });
  await user.type(ui.getByRole("textbox", { name: "Alasan" }), "x{Enter}");
  expect(await ui.findByRole("alert")).toHaveTextContent("Shift belum dibuka");
  expect(saleStatus("sale-1")).toBe("selesai");
  await user.click(ui.getByRole("button", { name: "Kembali" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: "Batalkan 20261020-0001?" }),
    ).toBeNull(),
  );
});

test("Esc menutup riwayat", async () => {
  const { user, onClose } = setup();
  await screen.findByText(/20261020-0001/);
  await user.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalled();
});

// --- Pelunasan kasbon di Riwayat (ruling R2, jawaban pemilik J0) ---

const payTime = Date.now() - 5 * 60_000;
const payClock = new Intl.DateTimeFormat("id-ID", {
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
  timeZone: "Asia/Jakarta",
})
  .format(payTime)
  .replace(":", ".");

// Toast tes sebelumnya bisa masih ada di sonner (juga berupa listitem): batasi ke lembar Riwayat.
const sheetItems = () =>
  within(
    screen.getByRole("dialog", { name: "Riwayat shift ini" }),
  ).getAllByRole("listitem");
const toasted = async (text: string) =>
  expect((await screen.findAllByText(text)).length).toBeGreaterThan(0);

const payRow = () =>
  screen.getByText("Pelunasan · Bu Sari").closest("li") as HTMLElement;

function seedPayment(over: Partial<MockCreditPayment> = {}) {
  const sari = mockDb.get().customers.find((c) => c.name === "Bu Sari");
  mockDb.update((s) => {
    s.creditPayments.push({
      id: "pay-1",
      customerId: sari?.id ?? "",
      amount: 50_000,
      at: payTime,
      channel: "kasir",
      method: "tunai",
      createdById: "u",
      createdByName: "Rina",
      shiftId: openShiftId(),
      cashReceived: 50_000,
      change: 0,
      balanceAfter: 70_000,
      printStatus: "tercetak",
      cancelledAt: null,
      cancelledById: null,
      cancelledByName: null,
      cancelledChannel: null,
      cancelReason: null,
      ...over,
    });
  });
}

test("pelunasan tampil berselang-seling dengan penjualan menurut jam, terbaru dulu", async () => {
  seedPayment();
  setup();
  await screen.findByText("Pelunasan · Bu Sari");
  const rows = sheetItems().map(
    (li) => li.textContent?.match(/20261020-000\d|Pelunasan · Bu Sari/)?.[0],
  );
  // Penjualan dibuat 8–10 menit lalu; pelunasan 5 menit lalu.
  expect(rows).toEqual([
    "Pelunasan · Bu Sari",
    "20261020-0003",
    "20261020-0002",
    "20261020-0001",
  ]);
  expect(payRow()).toHaveTextContent(`Tunai ${payClock} · sisa Rp70.000`);
  expect(within(payRow()).getByText("Rp50.000")).toBeVisible();
});

test("pelunasan shift lain tidak tampil di Riwayat shift ini", async () => {
  seedPayment({ shiftId: "shift-lain" });
  setup();
  await screen.findByText(/20261020-0003/);
  expect(screen.queryByText("Pelunasan · Bu Sari")).toBeNull();
});

test("tanpa pelunasan daftar sama persis seperti sebelumnya", async () => {
  setup();
  await screen.findByText(/20261020-0003/);
  expect(sheetItems()).toHaveLength(3);
  expect(screen.queryByText(/Pelunasan ·/)).toBeNull();
});

test("keadaan kosong tidak tampil bila hanya ada pelunasan", async () => {
  mockDb.update((s) => {
    s.sales = [];
  });
  seedPayment();
  setup();
  await screen.findByText("Pelunasan · Bu Sari");
  expect(screen.queryByText("Belum ada transaksi di shift ini")).toBeNull();
});

test("Cetak ulang pelunasan → 'Struk dicetak'; printer-gagal → 'Struk gagal dicetak'", async () => {
  seedPayment();
  const { user } = setup();
  await screen.findByText("Pelunasan · Bu Sari");
  const print = () =>
    within(payRow()).getByRole("button", {
      name: `Cetak ulang pelunasan Bu Sari ${payClock}`,
    });
  await user.click(print());
  await toasted("Struk dicetak");

  setScenario("printer-gagal");
  await user.click(print());
  await toasted("Struk gagal dicetak");
});

const cancelBtn = () =>
  within(payRow()).getByRole("button", {
    name: `Batalkan pelunasan Bu Sari ${payClock}`,
  });
const cancelDialog = () =>
  screen.findByRole("dialog", { name: "Batalkan pelunasan Rp50.000?" });

test("batal pelunasan Tunai: kalimat laci → alasan → 'Pelunasan dibatalkan', 'Dibatalkan', Cetak ulang nonaktif", async () => {
  seedPayment();
  const { user } = setup();
  await screen.findByText("Pelunasan · Bu Sari");
  await user.click(cancelBtn());
  const ui = within(await cancelDialog());
  expect(
    ui.getByText(
      "Kasbon Bu Sari bertambah lagi Rp50.000 dan uang Rp50.000 dikeluarkan dari laci.",
    ),
  ).toBeVisible();
  expect(ui.getByRole("textbox", { name: "Alasan" })).toHaveFocus();
  await user.type(ui.getByRole("textbox", { name: "Alasan" }), "Salah{Enter}");
  await toasted("Pelunasan dibatalkan");
  await waitFor(() =>
    expect(within(payRow()).getByText("Dibatalkan")).toBeVisible(),
  );
  expect(
    within(payRow()).queryByRole("button", { name: /Batalkan pelunasan/ }),
  ).toBeNull();
  expect(
    within(payRow()).getByRole("button", {
      name: `Cetak ulang pelunasan Bu Sari ${payClock}`,
    }),
  ).toBeDisabled();
  expect(
    mockDb.get().creditPayments.find((p) => p.id === "pay-1")?.cancelReason,
  ).toBe("Salah");
});

test("batal pelunasan QRIS: tanpa kalimat laci", async () => {
  seedPayment({ method: "qris", cashReceived: 0 });
  const { user } = setup();
  await screen.findByText("Pelunasan · Bu Sari");
  await user.click(cancelBtn());
  const ui = within(await cancelDialog());
  expect(ui.getByText("Kasbon Bu Sari bertambah lagi Rp50.000.")).toBeVisible();
  expect(ui.queryByText(/dari laci/)).toBeNull();
});

test("409 OUTSIDE_SHIFT → pesan di dialog, pelunasan tetap aktif", async () => {
  seedPayment();
  const { user } = setup();
  await screen.findByText("Pelunasan · Bu Sari");
  await user.click(cancelBtn());
  const ui = within(await cancelDialog());
  // Shift berganti di sela-sela.
  mockDb.update((s) => {
    const p = s.creditPayments.find((x) => x.id === "pay-1");
    if (p) p.shiftId = "shift-lain";
  });
  await user.type(ui.getByRole("textbox", { name: "Alasan" }), "x{Enter}");
  expect(await ui.findByRole("alert")).toHaveTextContent(
    "Pelunasan dari shift sebelumnya — batalkan dari app pemilik",
  );
  expect(
    mockDb.get().creditPayments.find((p) => p.id === "pay-1")?.cancelledAt,
  ).toBeNull();
});

test("respons batal hilang lalu diulang → tetap satu baris laci", async () => {
  seedPayment();
  const { user } = setup();
  await screen.findByText("Pelunasan · Bu Sari");
  await user.click(cancelBtn());
  const ui = within(await cancelDialog());
  server.use(
    http.post(
      "/api/credit-payments/:paymentId/cancel",
      async ({ request }) => {
        // Server memproses, tetapi jawabannya hilang di jalan.
        await fetch(request.url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: await request.text(),
        });
        return HttpResponse.error();
      },
      { once: true },
    ),
  );
  await user.type(ui.getByRole("textbox", { name: "Alasan" }), "Salah{Enter}");
  await ui.findByRole("alert");
  await user.click(ui.getByRole("button", { name: "Batalkan pelunasan" }));
  await toasted("Pelunasan dibatalkan");
  const rows = mockDb
    .get()
    .shift?.creditCash.filter((c) => c.kind === "batal_pelunasan");
  expect(rows).toHaveLength(1);
});

test("menutup Riwayat mengembalikan fokus ke kolom scan", async () => {
  const user = humanTyping();
  renderWithQuery(
    <>
      <ShiftActions onClosed={() => {}} />
      <KasirScreen />
    </>,
  );
  const scan = screen.getByRole("combobox", {
    name: "Scan barcode / ketik nama atau kode",
  });
  await user.click(screen.getByRole("button", { name: "Riwayat" }));
  await screen.findByRole("dialog", { name: "Riwayat shift ini" });
  await user.keyboard("{Escape}");
  await waitFor(() => expect(scan).toHaveFocus());
});
