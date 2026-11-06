import { screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { beforeEach, expect, test, vi } from "vitest";
import { type MockSale, mockDb } from "@/mocks/db";
import { problem } from "@/mocks/handlers/respond";
import { json, loginWithShift, post } from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
import type {
  Sale,
  ShiftClosure,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { DAY_MS } from "@/shared/lib/business-day";
import { renderWithQuery } from "@/test/render-app";
import { humanTyping, scannerTyping } from "@/test/typing";
import { dayClockLabel } from "./clock";
import { HistorySheet } from "./history-sheet";

const OLD_AT = Date.now() - 2 * DAY_MS;

function makeSale(number: string, over: Partial<MockSale> = {}): MockSale {
  return {
    id: `old-${number}`,
    number,
    createdAt: OLD_AT,
    kasirName: "Rina",
    shiftId: "shift-kemarin",
    items: [],
    total: 50_000,
    payments: [
      { method: "cash", amount: 30_000 },
      { method: "qris", amount: 20_000 },
    ],
    cashReceived: 30_000,
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

const OLD = "20261104-0145";

beforeEach(async () => {
  await loginWithShift();
});

const seed = (...sales: MockSale[]) =>
  mockDb.update((s) => {
    s.sales.push(...sales);
  });

function setup() {
  renderWithQuery(<HistorySheet open onClose={vi.fn()} />);
  return humanTyping();
}

const search = () => screen.getByRole("textbox", { name: "Cari nomor struk" });
// Toast tes sebelumnya bisa masih ada di sonner: cukup ada satu.
const toasted = async () =>
  expect(
    (await screen.findAllByText("Transaksi dibatalkan")).length,
  ).toBeGreaterThan(0);
const section = () =>
  within(screen.getByRole("region", { name: "Transaksi shift sebelumnya" }));
const stored = (id: string) => mockDb.get().sales.find((s) => s.id === id);

async function openDialog(user: ReturnType<typeof humanTyping>, q = "0145") {
  await user.type(search(), q);
  await user.click(
    await screen.findByRole("button", { name: `Batalkan ${OLD}` }),
  );
  return within(
    await screen.findByRole("dialog", { name: `Batalkan ${OLD}?` }),
  );
}

const close = async () => {
  const res = await post("/api/shifts/current/close", { countedCash: 0 });
  return json<ShiftClosure>(res);
};

test("cari '0145' → transaksi shift kemarin berlabel Campuran · Rina; shift ini tidak muncul", async () => {
  seed(
    makeSale(OLD),
    makeSale("20261106-0145", { shiftId: mockDb.get().shift?.id ?? "x" }),
  );
  const user = setup();
  expect(screen.getByText("Transaksi shift sebelumnya")).toBeVisible();
  expect(screen.getByText("Maksimal 7 hari ke belakang")).toBeVisible();
  await user.type(search(), "0145");
  const rowEl = (await screen.findByText(new RegExp(OLD))).closest(
    "li",
  ) as HTMLElement;
  expect(rowEl).toHaveTextContent(`${OLD} · ${dayClockLabel(OLD_AT)}`);
  expect(within(rowEl).getByText("Campuran · Rina")).toBeVisible();
  expect(within(rowEl).getByText("Rp50.000")).toBeVisible();
  expect(section().queryByText(/20261106-0145/)).toBeNull();
});

test("tanpa hasil, dan transaksi 8 hari lalu tidak muncul", async () => {
  seed(makeSale("20261020-0145", { createdAt: Date.now() - 8 * DAY_MS }));
  const user = setup();
  await user.type(search(), "0145");
  expect(
    await screen.findByText(
      "Tidak ada transaksi dengan nomor itu dalam 7 hari",
    ),
  ).toBeVisible();
});

test("campuran Tunai 30.000 + QRIS 20.000: kalimat tunai, radio QRIS bawaan laci → refund laci masuk penutupan shift", async () => {
  seed(makeSale(OLD));
  const user = setup();
  const ui = await openDialog(user);
  expect(
    ui.getByText("Tunai Rp30.000 dikembalikan dari laci shift ini."),
  ).toBeVisible();
  expect(ui.getByText("Kembalikan QRIS Rp20.000")).toBeVisible();
  expect(ui.getByRole("radio", { name: "Tunai dari laci" })).toBeChecked();
  expect(ui.getByRole("textbox", { name: "Alasan" })).toHaveFocus();
  await user.type(ui.getByRole("textbox", { name: "Alasan" }), "Salah{Enter}");
  await toasted();
  const rowEl = screen.getByText(new RegExp(OLD)).closest("li") as HTMLElement;
  await waitFor(() =>
    expect(within(rowEl).getByText("Dibatalkan")).toBeVisible(),
  );
  expect(within(rowEl).queryByRole("button", { name: /Batalkan/ })).toBeNull();
  expect(stored(`old-${OLD}`)).toMatchObject({
    status: "dibatalkan",
    voidReason: "Salah",
  });
  expect(mockDb.get().shift?.saleRefunds.map((r) => r.amount)).toEqual([
    50_000,
  ]);
  const closure = await close();
  expect(closure.saleRefunds).toBe(50_000);
  expect(closure.expectedCash).toBe(200_000 - 50_000);
});

test("kirim body qrisRefundSource: laci", async () => {
  seed(makeSale(OLD));
  const bodies: unknown[] = [];
  server.use(
    http.post("/api/sales/:saleId/void", async ({ request }) => {
      bodies.push(await request.clone().json());
    }),
  );
  const user = setup();
  const ui = await openDialog(user);
  await user.type(ui.getByRole("textbox", { name: "Alasan" }), "Salah{Enter}");
  await toasted();
  expect(bodies).toEqual([{ reason: "Salah", qrisRefundSource: "laci" }]);
});

test("pilih Transfer oleh pemilik nanti → body pemilik, hanya bagian tunai keluar laci", async () => {
  seed(makeSale(OLD));
  const bodies: unknown[] = [];
  server.use(
    http.post("/api/sales/:saleId/void", async ({ request }) => {
      bodies.push(await request.clone().json());
    }),
  );
  const user = setup();
  const ui = await openDialog(user);
  await user.click(
    ui.getByRole("radio", { name: "Transfer oleh pemilik nanti" }),
  );
  await user.type(ui.getByRole("textbox", { name: "Alasan" }), "Salah{Enter}");
  await toasted();
  expect(bodies).toEqual([{ reason: "Salah", qrisRefundSource: "pemilik" }]);
  expect(mockDb.get().shift?.saleRefunds.map((r) => r.amount)).toEqual([
    30_000,
  ]);
  const closure = await close();
  expect(closure.saleRefunds).toBe(30_000);
  expect(closure.expectedCash).toBe(200_000 - 30_000);
});

test("(M1) QRIS-saja transaksi shift ini di Riwayat + Tunai dari laci → penutupan memuat -Rp20.000", async () => {
  const shiftId = mockDb.get().shift?.id ?? "x";
  const sale: Sale = makeSale("20261106-0001", {
    shiftId,
    createdAt: Date.now() - 60_000,
    total: 20_000,
    payments: [{ method: "qris", amount: 20_000 }],
    cashReceived: 0,
  });
  seed(sale as MockSale);
  const user = setup();
  const rowEl = (await screen.findByText(/20261106-0001/)).closest(
    "li",
  ) as HTMLElement;
  await user.click(
    within(rowEl).getByRole("button", { name: "Batalkan 20261106-0001" }),
  );
  const ui = within(
    await screen.findByRole("dialog", { name: "Batalkan 20261106-0001?" }),
  );
  await user.type(ui.getByRole("textbox", { name: "Alasan" }), "Salah{Enter}");
  await toasted();
  const closure = await close();
  expect(closure.saleRefunds).toBe(20_000);
  expect(closure.expectedCash).toBe(200_000 - 20_000);
});

test("kasbon 10.000: kalimat kasbon dengan nama; QRIS-saja tanpa kalimat Tunai", async () => {
  const sari = mockDb.get().customers.find((c) => c.name === "Bu Sari");
  seed(
    makeSale(OLD, {
      total: 10_000,
      payments: [{ method: "credit", amount: 10_000 }],
      cashReceived: 0,
      customerId: sari?.id ?? null,
    }),
    makeSale("20261104-0146", {
      total: 20_000,
      payments: [{ method: "qris", amount: 20_000 }],
      cashReceived: 0,
    }),
  );
  const user = setup();
  const ui = await openDialog(user, "0145");
  expect(ui.getByText("Kasbon Bu Sari dikurangi Rp10.000.")).toBeVisible();
  expect(ui.queryByText(/dikembalikan dari laci/)).toBeNull();
  expect(ui.queryByRole("radio")).toBeNull();
  await user.click(ui.getByRole("button", { name: "Kembali" }));
  await waitFor(() =>
    expect(screen.queryByRole("dialog", { name: /Batalkan/ })).toBeNull(),
  );

  await user.clear(search());
  await user.type(search(), "0146");
  await user.click(
    await screen.findByRole("button", { name: "Batalkan 20261104-0146" }),
  );
  const qris = within(
    await screen.findByRole("dialog", { name: "Batalkan 20261104-0146?" }),
  );
  expect(qris.queryByText(/dikembalikan dari laci/)).toBeNull();
  expect(qris.getByText("Kembalikan QRIS Rp20.000")).toBeVisible();
});

test("409 VOID_TOO_OLD → pesan di dialog", async () => {
  seed(makeSale(OLD));
  server.use(
    http.post("/api/sales/:saleId/void", () =>
      problem(409, "VOID_TOO_OLD", "terlalu lama"),
    ),
  );
  const user = setup();
  const ui = await openDialog(user);
  await user.type(ui.getByRole("textbox", { name: "Alasan" }), "x{Enter}");
  expect(await ui.findByRole("alert")).toHaveTextContent(
    "Transaksi lebih dari 7 hari — batalkan dari app pemilik",
  );
  expect(stored(`old-${OLD}`)?.status).toBe("selesai");
});

test("ketikan scanner di isian → ScannedAlert, tanpa request", async () => {
  const urls: string[] = [];
  server.use(
    http.get("/api/sales/lookup", ({ request }) => {
      urls.push(request.url);
      return HttpResponse.json([]);
    }),
  );
  setup();
  const scanner = scannerTyping();
  search().focus();
  await scanner.keyboard("8999999012345{Enter}");
  expect(await screen.findByText("Itu barcode, bukan angka")).toBeVisible();
  await new Promise((r) => setTimeout(r, 300));
  expect(urls.filter((u) => u.includes("q=8999"))).toEqual([]);
  expect((search() as HTMLInputElement).value.length).toBeLessThanOrEqual(1);
});

test("Esc menutup dialog dulu, lalu Riwayat", async () => {
  seed(makeSale(OLD));
  const onClose = vi.fn();
  renderWithQuery(<HistorySheet open onClose={onClose} />);
  const user = humanTyping();
  await openDialog(user);
  await user.keyboard("{Escape}");
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: `Batalkan ${OLD}?` }),
    ).toBeNull(),
  );
  expect(onClose).not.toHaveBeenCalled();
  await user.keyboard("{Escape}");
  expect(onClose).toHaveBeenCalled();
});
