import { act, screen, waitFor, within } from "@testing-library/react";
import { delay, HttpResponse, http } from "msw";
import { beforeEach, expect, test, vi } from "vitest";
import { mockDb } from "@/mocks/db";
import { problem } from "@/mocks/handlers/respond";
import { loginWithShift, post } from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
import { setScenario } from "@/mocks/scenarios";
import type { KasirCreditPaymentInput } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { getGetHealthQueryKey } from "@/shared/api/gen/system/system";
import { renderWithQuery } from "@/test/render-app";
import { fillSpecCart, seedMatch } from "@/test/spec-cart";
import { humanTyping, scannerTyping } from "@/test/typing";
import { useCart } from "../cart/cart-store";
import { KasirScreen } from "../screen/kasir-screen";
import { ShiftActions } from "../shift/shift-actions";

vi.mock("@/shared/lib/beep", () => ({ beep: vi.fn() }));
vi.mock("@/shared/lib/id", async (importOriginal) => {
  const mod = await importOriginal<typeof import("@/shared/lib/id")>();
  return { ...mod, newId: vi.fn(mod.newId) };
});

const OFFLINE = "Server tidak tersambung — coba lagi";

beforeEach(async () => {
  useCart.setState(useCart.getInitialState(), true);
  await loginWithShift();
});

async function setup() {
  const user = humanTyping();
  const utils = renderWithQuery(
    <>
      <ShiftActions onClosed={() => {}} />
      <KasirScreen />
    </>,
  );
  const scan = screen.getByRole("combobox", {
    name: "Scan barcode / ketik nama atau kode",
  });
  const trigger = screen.getByRole("button", { name: "Pelunasan kasbon" });
  await waitFor(() => expect(trigger).toBeEnabled());
  return { user, scan, trigger, ...utils };
}

// Judul berganti jadi "Pelunasan tersimpan" pada hasil; dialognya tetap satu.
const SHEET_NAME = /^Pelunasan (kasbon|tersimpan)$/;
const sheet = () => screen.queryByRole("dialog", { name: SHEET_NAME });
const sheetUi = () => within(screen.getByRole("dialog", { name: SHEET_NAME }));

/** Buka lembar dan pilih Bu Sari (sisa kasbon Rp120.000). */
async function openWithSari() {
  const ctx = await setup();
  await ctx.user.click(ctx.trigger);
  const ui = sheetUi();
  await ctx.user.click(await ui.findByRole("button", { name: /Bu Sari/ }));
  return {
    ...ctx,
    ui,
    amount: () => ui.getByRole("textbox", { name: "NOMINAL PELUNASAN" }),
    received: () => ui.getByRole("textbox", { name: "UANG DITERIMA" }),
    save: () => ui.getByRole("button", { name: "Simpan pelunasan" }),
  };
}

function trackPayments() {
  const bodies: KasirCreditPaymentInput[] = [];
  server.use(
    http.post("/api/credit-payments", async ({ request }) => {
      bodies.push((await request.clone().json()) as KasirCreditPaymentInput);
    }),
  );
  return bodies;
}

const saved = () => mockDb.get().creditPayments;

test("tombol 'Pelunasan kasbon' membuka lembar; pemilih tanpa 'Tambah pelanggan' dan tanpa Mbak Dewi (saldo 0); pilih Bu Sari → 'Sisa kasbon Rp120.000 · Limit Rp500.000'", async () => {
  const { user, trigger } = await setup();
  expect(sheet()).toBeNull();
  await user.click(trigger);
  const ui = sheetUi();
  expect(ui.getByText("Esc untuk menutup")).toBeInTheDocument();
  expect(ui.getByText("PELANGGAN")).toBeInTheDocument();
  const sari = await ui.findByRole("button", { name: /Bu Sari/ });
  expect(ui.queryByRole("button", { name: /Mbak Dewi/ })).toBeNull();
  expect(ui.queryByRole("button", { name: "Tambah pelanggan" })).toBeNull();
  await user.click(sari);
  expect(
    ui.getByText("Sisa kasbon Rp120.000 · Limit Rp500.000"),
  ).toBeInTheDocument();
});

test("'Lunas semua' mengisi nominal; 'Cetak struk' tercentang mengikuti autoPrint seed (true) → body print true; dimatikan → false; useCart.printReceipt tidak berubah", async () => {
  const bodies = trackPayments();
  const { user, ui, amount, received, save } = await openWithSari();
  const print = ui.getByRole("checkbox", { name: "Cetak struk" });
  await waitFor(() => expect(print).toBeChecked());
  await user.click(ui.getByRole("button", { name: "Lunas semua" }));
  expect(amount()).toHaveValue("120.000");
  await user.type(received(), "120000");
  await user.click(save());
  await screen.findByText("Pelunasan tersimpan");
  expect(bodies[0]?.print).toBe(true);
  expect(useCart.getState().printReceipt).toBeNull();
});

test("Cetak struk dimatikan → body print false", async () => {
  const bodies = trackPayments();
  const { user, ui, amount, received, save } = await openWithSari();
  const print = ui.getByRole("checkbox", { name: "Cetak struk" });
  await waitFor(() => expect(print).toBeChecked());
  await user.click(print);
  expect(print).not.toBeChecked();
  await user.type(amount(), "50000");
  await user.type(received(), "50000");
  await user.click(save());
  await screen.findByText("Pelunasan tersimpan");
  expect(bodies[0]?.print).toBe(false);
  expect(useCart.getState().printReceipt).toBeNull();
});

test("Tunai 50.000 diterima 100.000 → KEMBALIAN Rp50.000, 'Sisa kasbon setelah ini Rp70.000'; Enter → 'Pelunasan tersimpan', 'Sisa kasbon Rp70.000'", async () => {
  const { user, ui, amount, received, scan } = await openWithSari();
  await user.type(amount(), "50000");
  await user.type(received(), "100000");
  expect(ui.getByText("KEMBALIAN").parentElement).toHaveTextContent("Rp50.000");
  expect(ui.getByText("Sisa kasbon setelah ini Rp70.000")).toBeInTheDocument();
  await user.keyboard("{Enter}");
  expect(await screen.findByText("Pelunasan tersimpan")).toBeInTheDocument();
  const done = sheetUi();
  expect(done.getByText("Rp50.000", { selector: "span" })).toBeInTheDocument();
  expect(done.getByText("Sisa kasbon Rp70.000")).toBeInTheDocument();
  expect(saved().at(-1)).toMatchObject({
    amount: 50_000,
    method: "tunai",
    cashReceived: 100_000,
  });
  const tutup = done.getByRole("button", { name: "Tutup" });
  expect(tutup).toHaveFocus();
  await user.keyboard("{Enter}");
  await waitFor(() => expect(sheet()).toBeNull());
  await waitFor(() => expect(scan).toHaveFocus());
});

test("(jawaban pemilik Q4) tab QRIS → satu tombol 'Sudah masuk' langsung menyimpan (tanpa langkah kedua); nominal > sisa → 'Melebihi sisa kasbon Rp120.000' dan tombol nonaktif; Lunas semua → 'Rp0 · lunas'", async () => {
  const bodies = trackPayments();
  const { user, ui, amount } = await openWithSari();
  await user.click(ui.getByRole("tab", { name: "QRIS" }));
  expect(ui.queryByRole("button", { name: "Simpan pelunasan" })).toBeNull();
  const masuk = () => ui.getByRole("button", { name: "Sudah masuk" });
  await user.type(amount(), "130000");
  expect(ui.getByRole("alert")).toHaveTextContent(
    "Melebihi sisa kasbon Rp120.000",
  );
  expect(masuk()).toBeDisabled();
  await user.click(ui.getByRole("button", { name: "Lunas semua" }));
  expect(
    ui.getByText("Sisa kasbon setelah ini Rp0 · lunas"),
  ).toBeInTheDocument();
  expect(ui.queryByRole("alert")).toBeNull();
  await user.click(masuk());
  expect(await screen.findByText("Pelunasan tersimpan")).toBeInTheDocument();
  expect(bodies).toHaveLength(1);
  expect(bodies[0]).toMatchObject({
    method: "qris",
    amount: 120_000,
    cashReceived: null,
  });
  // QRIS tanpa kembalian.
  expect(sheetUi().queryByText("KEMBALIAN")).toBeNull();
});

test("keranjang berisi 2 baris → tombol tetap aktif; setelah simpan & Tutup keranjang tetap 2 baris", async () => {
  act(() => {
    const cart = useCart.getState();
    cart.addUnit(seedMatch("Beras Pandan Wangi 5 kg"));
    cart.addUnit(seedMatch("Minyak Goreng Bimoli 2 L"));
  });
  const before = useCart.getState().lines;
  expect(before).toHaveLength(2);
  const { user, trigger, ui, amount, received, save } = await openWithSari();
  expect(trigger).toBeEnabled();
  await user.type(amount(), "20000");
  await user.type(received(), "20000");
  await user.click(save());
  await screen.findByText("Pelunasan tersimpan");
  await user.click(ui.getByRole("button", { name: "Tutup" }));
  await waitFor(() => expect(sheet()).toBeNull());
  expect(useCart.getState().lines).toEqual(before);
});

test("scan (ketikan < 30 ms + Enter) saat lembar terbuka tidak menambah barang ke keranjang", async () => {
  act(() => {
    fillSpecCart();
  });
  const before = useCart.getState().lines;
  const barcode = seedMatch("Minyak Goreng Bimoli 2 L").product.units[0]
    ?.barcodes[0];
  expect(barcode).toBeTruthy();
  const { trigger, user } = await setup();
  await user.click(trigger);
  await sheetUi().findByRole("button", { name: /Bu Sari/ });
  (document.activeElement as HTMLElement | null)?.blur();
  await scannerTyping().keyboard(`${barcode}{Enter}`);
  expect(useCart.getState().lines).toEqual(before);
});

test("respons hilang (server menyimpan lalu HttpResponse.error) → pesan; klik lagi → id sama → 200; satu entri buku & laci", async () => {
  const ids: string[] = [];
  let lose = true;
  let inner = false;
  server.use(
    http.post("/api/credit-payments", async ({ request }) => {
      const body = (await request.clone().json()) as KasirCreditPaymentInput;
      if (inner) return;
      ids.push(body.id);
      if (!lose) return;
      lose = false;
      inner = true;
      await post("/api/credit-payments", body);
      inner = false;
      return HttpResponse.error();
    }),
  );
  const { user, ui, amount, received, save } = await openWithSari();
  await user.type(amount(), "50000");
  await user.type(received(), "50000");
  await user.click(save());
  expect(await ui.findByRole("alert")).toHaveTextContent(OFFLINE);
  expect(saved().filter((p) => p.id === ids[0])).toHaveLength(1);
  await user.click(save());
  expect(await screen.findByText("Pelunasan tersimpan")).toBeInTheDocument();
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
  const mine = saved().filter((p) => p.id === ids[0]);
  expect(mine).toHaveLength(1);
  const ledger = mockDb
    .get()
    .creditLedger.filter((e) => e.paymentId === ids[0]);
  expect(ledger).toHaveLength(1);
  expect(
    (mockDb.get().shift?.creditCash ?? []).filter((c) => c.amount === 50_000),
  ).toHaveLength(1);
});

test("id sudah tersimpan dengan isi lain → 'Pelunasan ini sudah tersimpan sebelumnya' dan data server yang tampil", async () => {
  const { newId } = await import("@/shared/lib/id");
  vi.mocked(newId).mockReturnValueOnce("pel-tetap");
  const { user, ui, amount, received, save } = await openWithSari().then(
    async (ctx) => {
      const res = await post("/api/credit-payments", {
        id: "pel-tetap",
        customerId: mockDb.get().customers.find((c) => c.name === "Bu Sari")
          ?.id,
        amount: 30_000,
        method: "tunai",
        cashReceived: 30_000,
        print: false,
      });
      expect(res.status).toBe(201);
      return ctx;
    },
  );
  await user.type(amount(), "50000");
  await user.type(received(), "50000");
  await user.click(save());
  await screen.findByText("Pelunasan tersimpan");
  expect(
    ui.getByText("Pelunasan ini sudah tersimpan sebelumnya"),
  ).toBeInTheDocument();
  expect(ui.getByText("Sisa kasbon Rp90.000")).toBeInTheDocument();
  expect(saved().filter((p) => p.id === "pel-tetap")).toHaveLength(1);
});

test("klik ganda 'Simpan pelunasan' → satu request", async () => {
  const bodies = trackPayments();
  const { user, amount, received, save } = await openWithSari();
  await user.type(amount(), "50000");
  await user.type(received(), "50000");
  await user.dblClick(save());
  await screen.findByText("Pelunasan tersimpan");
  expect(bodies).toHaveLength(1);
});

test("offline → tombol nonaktif; 409 SHIFT_CLOSED → 'Shift belum dibuka'; 422 → pesan server di lembar", async () => {
  const { user, ui, amount, received, save, queryClient } =
    await openWithSari();
  await user.type(amount(), "50000");
  await user.type(received(), "50000");
  expect(save()).toBeEnabled();

  server.use(
    http.post("/api/credit-payments", () => problem(409, "SHIFT_CLOSED")),
  );
  await user.click(save());
  expect(await ui.findByRole("alert")).toHaveTextContent("Shift belum dibuka");

  server.use(
    http.post("/api/credit-payments", () =>
      problem(422, "VALIDATION", "Jumlah melebihi sisa kasbon"),
    ),
  );
  await user.click(save());
  await waitFor(() =>
    expect(ui.getByRole("alert")).toHaveTextContent(
      "Jumlah melebihi sisa kasbon",
    ),
  );

  setScenario("server-mati");
  await act(() =>
    queryClient.refetchQueries({ queryKey: getGetHealthQueryKey() }),
  );
  await waitFor(() => expect(save()).toBeDisabled());
});

test("printer-gagal + Cetak struk → toast 'Struk gagal dicetak — cetak ulang dari Riwayat'", async () => {
  setScenario("printer-gagal");
  const { user, ui, amount, received, save } = await openWithSari();
  await waitFor(() =>
    expect(ui.getByRole("checkbox", { name: "Cetak struk" })).toBeChecked(),
  );
  await user.type(amount(), "50000");
  await user.type(received(), "50000");
  await user.click(save());
  expect(
    await screen.findByText("Struk gagal dicetak — cetak ulang dari Riwayat"),
  ).toBeInTheDocument();
  expect(saved().at(-1)?.printStatus).toBe("gagal");
});

test("Esc menutup dan fokus kembali ke kolom scan; Esc diabaikan saat pending", async () => {
  const { user, scan, trigger } = await setup();
  await user.click(trigger);
  await sheetUi().findByRole("button", { name: /Bu Sari/ });
  await user.keyboard("{Escape}");
  await waitFor(() => expect(sheet()).toBeNull());
  await waitFor(() => expect(scan).toHaveFocus());

  server.use(
    http.post("/api/credit-payments", async () => {
      await delay(150);
      return HttpResponse.error();
    }),
  );
  await user.click(trigger);
  const ui = sheetUi();
  await user.click(await ui.findByRole("button", { name: /Bu Sari/ }));
  await user.type(
    ui.getByRole("textbox", { name: "NOMINAL PELUNASAN" }),
    "50000",
  );
  await user.type(ui.getByRole("textbox", { name: "UANG DITERIMA" }), "50000");
  await user.click(ui.getByRole("button", { name: "Simpan pelunasan" }));
  await user.keyboard("{Escape}");
  expect(sheet()).not.toBeNull();
  expect(await ui.findByRole("alert")).toHaveTextContent(OFFLINE);
});
