import { screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { HttpResponse, http } from "msw";
import { toast } from "sonner";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockDb } from "@/mocks/db";
import {
  cashSale,
  customerId,
  get,
  json,
  loginWithShift,
  ownerLogin,
  post,
} from "@/mocks/handlers/test-helpers";
import { appendCredit } from "@/mocks/ledger";
import { server } from "@/mocks/node";
import type {
  OwnerCreditPaymentInput,
  OwnerCustomer,
  Sale,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { renderApp } from "@/test/render-app";

/** Kamis 5 Nov 2026, 10.00 WIB. */
const NOW = Date.UTC(2026, 10, 5, 3);
const OWNER_PAY = (name: string) =>
  `/api/owner/customers/${customerId(name)}/payments`;

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  await ownerLogin();
});

afterEach(() => {
  toast.dismiss();
  vi.unstubAllGlobals();
  vi.useRealTimers();
});

const page = (name: string) => `/owner/kasbon/${customerId(name)}`;
const title = (name: string) =>
  screen.findByRole("heading", { level: 1, name });
const history = () =>
  within(screen.getByRole("region", { name: "Riwayat" })).getAllByRole(
    "listitem",
  );
const rowOf = (text: string | RegExp) => {
  const row = history().find((li) =>
    typeof text === "string"
      ? li.textContent?.includes(text)
      : text.test(li.textContent ?? ""),
  );
  if (!row) throw new Error(`baris riwayat tidak ada: ${String(text)}`);
  return row;
};

/** Pelanggan dengan saldo −40.000 (Lebih bayar, Q8). */
function plantOverpaid() {
  mockDb.update((s) => {
    s.customers.push({
      id: "cus-lebih",
      name: "Pak Bayar",
      phone: "081234500099",
      creditLimit: 300_000,
      balance: 0,
    });
    appendCredit(s, {
      customerId: "cus-lebih",
      amount: -40_000,
      at: NOW,
      saleId: null,
      paymentId: null,
    });
  });
}

async function ownerPay(name: string, id: string, amount: number) {
  const res = await post(OWNER_PAY(name), { id, amount, method: "transfer" });
  expect(res.status).toBe(201);
}

async function openPaySheet(name = "Bu Sari") {
  const user = userEvent.setup();
  const utils = renderApp(page(name));
  await title(name);
  const trigger = screen.getByRole("button", { name: "Catat pelunasan" });
  await user.click(trigger);
  const sheet = await screen.findByRole("dialog", { name: "Catat pelunasan" });
  return { user, trigger, sheet, ...utils };
}

test("kembali Kasbon, eyebrow no. HP, judul nama, kartu Sisa kasbon + Limit + kasbon tertua", async () => {
  renderApp(page("Bu Tini"));
  await title("Bu Tini");
  const header = screen.getByRole("heading", { level: 1 }).closest("header");
  expect(header).not.toBeNull();
  expect(
    within(header as HTMLElement).getByRole("link", { name: /Kasbon/ }),
  ).toHaveAttribute("href", "/owner/kasbon");
  expect(screen.getByText("081234500005")).toBeInTheDocument();
  const card = screen.getByRole("region", { name: "Ringkasan pelanggan" });
  expect(within(card).getByText("Sisa kasbon")).toBeInTheDocument();
  expect(within(card).getByText("Rp640.000")).toBeInTheDocument();
  expect(
    within(card).getByText("Limit Rp1.000.000 · kasbon tertua 45 hari"),
  ).toBeInTheDocument();
});

test("saldo 0: kartu hanya Limit dan Catat pelunasan nonaktif; Atur limit tetap aktif", async () => {
  renderApp(page("Mbak Dewi"));
  await title("Mbak Dewi");
  const card = screen.getByRole("region", { name: "Ringkasan pelanggan" });
  expect(within(card).getByText("Limit Rp500.000")).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Catat pelunasan" }),
  ).toBeDisabled();
  expect(screen.getByRole("button", { name: "Atur limit" })).toBeEnabled();
});

test("riwayat terbaru dulu: kasbon struk + kasir, pelunasan Tunai di kasir dan Transfer ke pemilik", async () => {
  await loginWithShift();
  const sale = await json<Sale>(
    await post("/api/sales", {
      ...cashSale(),
      payments: [{ method: "credit", amount: 36_000 }],
      cashReceived: 0,
      customerId: customerId("Bu Sari"),
    }),
  );
  vi.setSystemTime(NOW + 60_000);
  await ownerPay("Bu Sari", "own-1", 20_000);
  renderApp(page("Bu Sari"));
  await title("Bu Sari");
  const rows = history();
  // Terbaru dulu: Transfer pemilik, kasbon struk, lalu seed (kasbon 18 hari, 40 hari).
  expect(rows[0]).toHaveTextContent("Pelunasan · Transfer ke pemilik");
  expect(rows[0]).toHaveTextContent("Pak Ahmad");
  expect(rows[0]).toHaveTextContent("−Rp20.000");
  expect(rows[1]).toHaveTextContent(`Kasbon · struk ${sale.number}`);
  expect(rows[1]).toHaveTextContent("Rina");
  expect(rows[1]).toHaveTextContent("+Rp36.000");
  expect(rows[1]).toHaveTextContent("Kam, 5 Nov 10.00");
  // Seed tanpa struk.
  expect(rows[2]).toHaveTextContent(/^Kasbon(?! ·)/);
  expect(rows[2]).toHaveTextContent("+Rp40.000");
});

test("pelunasan kasir seed tampil 'Pelunasan · Tunai di kasir'", async () => {
  renderApp(page("Bu Tini"));
  await title("Bu Tini");
  const row = rowOf("Pelunasan");
  expect(row).toHaveTextContent("Pelunasan · Tunai di kasir");
  expect(row).toHaveTextContent("−Rp300.000");
});

test("titip tampil 'Pelunasan · Tunai ke pemilik' (tanpa 'ke pemilik' ganda)", async () => {
  await post(OWNER_PAY("Bu Sari"), {
    id: "t-1",
    amount: 10_000,
    method: "titip",
  });
  renderApp(page("Bu Sari"));
  await title("Bu Sari");
  expect(rowOf("Tunai ke pemilik")).toHaveTextContent(
    /^Pelunasan · Tunai ke pemilik(?! ke pemilik)/,
  );
});

test("kosong: pelanggan tanpa riwayat → 'Belum ada riwayat'", async () => {
  mockDb.update((s) => {
    s.customers.push({
      id: "cus-baru",
      name: "Pak Baru",
      phone: "081200000000",
      creditLimit: 100_000,
      balance: 0,
    });
  });
  renderApp("/owner/kasbon/cus-baru");
  await title("Pak Baru");
  expect(screen.getByText("Belum ada riwayat")).toBeInTheDocument();
});

test("pelunasan dibatalkan: dicoret + Dibatalkan + '{alasan} · {pembatal} · jam' dan saldo kembali", async () => {
  await ownerPay("Bu Sari", "own-1", 20_000);
  vi.setSystemTime(Date.UTC(2026, 10, 5, 7, 5)); // 14.05 WIB
  const cancel = await post("/api/owner/credit-payments/own-1/cancel", {
    reason: "Salah catat",
  });
  expect(cancel.status).toBe(200);
  renderApp(page("Bu Sari"));
  await title("Bu Sari");
  const row = rowOf("Transfer ke pemilik");
  expect(within(row).getByText("Dibatalkan")).toBeInTheDocument();
  expect(row.querySelector("svg")).not.toBeNull();
  expect(
    within(row).getByText("Salah catat · Pak Ahmad · Hari ini 14.05"),
  ).toBeInTheDocument();
  expect(within(row).getByText("−Rp20.000")).toHaveClass("line-through");
  // Baris yang dibatalkan tidak bisa diketuk.
  expect(within(row).queryByRole("button")).toBeNull();
  const card = screen.getByRole("region", { name: "Ringkasan pelanggan" });
  expect(within(card).getByText("Rp120.000")).toBeInTheDocument();
});

test("Catat pelunasan: Transfer terpilih, tidak masuk laci, Lunas semua, melebihi sisa → nonaktif", async () => {
  const { user, sheet } = await openPaySheet();
  const ui = within(sheet);
  expect(ui.getByText("Sisa kasbon Rp120.000")).toBeInTheDocument();
  expect(ui.getByRole("radio", { name: "Transfer" })).toBeChecked();
  expect(ui.getByRole("radio", { name: "Tunai ke pemilik" })).not.toBeChecked();
  expect(ui.getByText("Tidak masuk laci kasir.")).toBeInTheDocument();
  const save = ui.getByRole("button", { name: "Simpan pelunasan" });
  expect(save).toBeDisabled();

  await user.click(ui.getByRole("button", { name: "Lunas semua" }));
  expect(ui.getByRole("textbox", { name: "Nominal" })).toHaveValue("Rp120.000");
  expect(ui.getByText("Sisa setelah ini Rp0")).toBeInTheDocument();
  expect(save).toBeEnabled();

  const amount = ui.getByRole("textbox", { name: "Nominal" });
  await user.clear(amount);
  await user.type(amount, "130000");
  expect(ui.getByText("Melebihi sisa kasbon Rp120.000")).toBeInTheDocument();
  expect(save).toBeDisabled();
  expect(ui.queryByText(/Sisa setelah ini/)).toBeNull();
});

test("Simpan pelunasan Transfer: toast, saldo turun, body method transfer, lembar tertutup", async () => {
  const bodies: OwnerCreditPaymentInput[] = [];
  server.events.on("request:start", async ({ request }) => {
    if (request.method === "POST" && request.url.endsWith("/payments")) {
      bodies.push((await request.clone().json()) as OwnerCreditPaymentInput);
    }
  });
  const { user, sheet } = await openPaySheet();
  const ui = within(sheet);
  await user.type(ui.getByRole("textbox", { name: "Nominal" }), "50000");
  expect(ui.getByText("Sisa setelah ini Rp70.000")).toBeInTheDocument();
  await user.click(ui.getByRole("button", { name: "Simpan pelunasan" }));
  expect(await screen.findByText("Pelunasan tersimpan")).toBeInTheDocument();
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: "Catat pelunasan" }),
    ).toBeNull(),
  );
  const card = screen.getByRole("region", { name: "Ringkasan pelanggan" });
  await waitFor(() => expect(within(card).getByText("Rp70.000")).toBeVisible());
  expect(bodies).toHaveLength(1);
  expect(bodies[0]).toMatchObject({ amount: 50_000, method: "transfer" });
  server.events.removeAllListeners();
  // Baris baru di riwayat.
  expect(history()[0]).toHaveTextContent("Pelunasan · Transfer ke pemilik");
});

test("Tunai ke pemilik → body method titip", async () => {
  const bodies: OwnerCreditPaymentInput[] = [];
  server.events.on("request:start", async ({ request }) => {
    if (request.method === "POST" && request.url.endsWith("/payments")) {
      bodies.push((await request.clone().json()) as OwnerCreditPaymentInput);
    }
  });
  const { user, sheet } = await openPaySheet();
  const ui = within(sheet);
  await user.click(ui.getByRole("radio", { name: "Tunai ke pemilik" }));
  await user.type(ui.getByRole("textbox", { name: "Nominal" }), "30000");
  await user.click(ui.getByRole("button", { name: "Simpan pelunasan" }));
  expect(await screen.findByText("Pelunasan tersimpan")).toBeInTheDocument();
  expect(bodies[0]).toMatchObject({ amount: 30_000, method: "titip" });
  server.events.removeAllListeners();
});

test("respons hilang lalu simpan lagi → id sama, buku sekali, pemberitahuan sudah tersimpan", async () => {
  const ids: string[] = [];
  let lose = true;
  let inner = false;
  server.use(
    http.post(OWNER_PAY("Bu Sari"), async ({ request }) => {
      const body = (await request.clone().json()) as OwnerCreditPaymentInput;
      if (inner) return;
      ids.push(body.id);
      if (!lose) return;
      lose = false;
      inner = true;
      await post(OWNER_PAY("Bu Sari"), body);
      inner = false;
      return HttpResponse.error();
    }),
  );
  const { user, sheet } = await openPaySheet();
  const ui = within(sheet);
  await user.type(ui.getByRole("textbox", { name: "Nominal" }), "50000");
  await user.click(ui.getByRole("button", { name: "Simpan pelunasan" }));
  expect(await ui.findByRole("alert")).toBeInTheDocument();
  await waitFor(() =>
    expect(
      within(
        screen.getByRole("region", { name: "Riwayat", hidden: true }),
      ).getAllByRole("listitem", { hidden: true })[0],
    ).toHaveTextContent("Transfer ke pemilik"),
  );
  await user.click(ui.getByRole("button", { name: "Simpan pelunasan" }));
  expect(
    await screen.findByText(
      "Pelunasan ini sudah tersimpan sebelumnya — cek riwayat",
    ),
  ).toBeInTheDocument();
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
  expect(
    mockDb.get().creditLedger.filter((e) => e.paymentId === ids[0]),
  ).toHaveLength(1);
  expect(
    mockDb.get().creditPayments.filter((p) => p.id === ids[0]),
  ).toHaveLength(1);
});

test("respons hilang, lembar ditutup lalu dibuka lagi → id sama, buku sekali, pemberitahuan; setelah berhasil id baru", async () => {
  const ids: string[] = [];
  let lose = true;
  let inner = false;
  server.use(
    http.post(OWNER_PAY("Bu Sari"), async ({ request }) => {
      const body = (await request.clone().json()) as OwnerCreditPaymentInput;
      if (inner) return;
      ids.push(body.id);
      if (!lose) return;
      lose = false;
      inner = true;
      await post(OWNER_PAY("Bu Sari"), body);
      inner = false;
      return HttpResponse.error();
    }),
  );
  const { user, sheet } = await openPaySheet();
  await user.type(
    within(sheet).getByRole("textbox", { name: "Nominal" }),
    "50000",
  );
  await user.click(
    within(sheet).getByRole("button", { name: "Simpan pelunasan" }),
  );
  expect(await within(sheet).findByRole("alert")).toBeInTheDocument();
  await user.click(within(sheet).getByRole("button", { name: "Batal" }));
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: "Catat pelunasan" }),
    ).toBeNull(),
  );
  // Pelunasan yang sudah tersimpan di server muncul di riwayat setelah muat ulang.
  await waitFor(() =>
    expect(history()[0]).toHaveTextContent("Transfer ke pemilik"),
  );
  await user.click(screen.getByRole("button", { name: "Catat pelunasan" }));
  const again = await screen.findByRole("dialog", { name: "Catat pelunasan" });
  const box = within(again).getByRole("textbox", { name: "Nominal" });
  await user.clear(box);
  await user.type(box, "50000");
  await user.click(
    within(again).getByRole("button", { name: "Simpan pelunasan" }),
  );
  expect(
    await screen.findByText(
      "Pelunasan ini sudah tersimpan sebelumnya — cek riwayat",
    ),
  ).toBeInTheDocument();
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
  expect(
    mockDb.get().creditLedger.filter((e) => e.paymentId === ids[0]),
  ).toHaveLength(1);
  // Setelah berhasil, pelunasan berikutnya memakai id baru.
  await user.click(screen.getByRole("button", { name: "Catat pelunasan" }));
  const third = await screen.findByRole("dialog", { name: "Catat pelunasan" });
  await user.type(
    within(third).getByRole("textbox", { name: "Nominal" }),
    "10000",
  );
  await user.click(
    within(third).getByRole("button", { name: "Simpan pelunasan" }),
  );
  await waitFor(() => expect(ids).toHaveLength(3));
  expect(ids[2]).not.toBe(ids[0]);
});

/** Pelunasan pertama: server menyimpan tetapi respons hilang; kirim berikutnya lolos apa adanya. */
function loseFirstResponse(ids: string[]) {
  let lose = true;
  let inner = false;
  server.use(
    http.post(OWNER_PAY("Bu Sari"), async ({ request }) => {
      const body = (await request.clone().json()) as OwnerCreditPaymentInput;
      if (inner) return;
      ids.push(body.id);
      if (!lose) return;
      lose = false;
      inner = true;
      await post(OWNER_PAY("Bu Sari"), body);
      inner = false;
      return HttpResponse.error();
    }),
  );
}

test("id tertunda lewat 10 menit → input yang sama dikirim dengan id baru, dua pelunasan", async () => {
  const ids: string[] = [];
  loseFirstResponse(ids);
  const { user, sheet } = await openPaySheet();
  await user.type(
    within(sheet).getByRole("textbox", { name: "Nominal" }),
    "30000",
  );
  await user.click(
    within(sheet).getByRole("button", { name: "Simpan pelunasan" }),
  );
  expect(await within(sheet).findByRole("alert")).toBeInTheDocument();
  vi.setSystemTime(NOW + 10 * 60_000 + 1000);
  await user.click(
    within(sheet).getByRole("button", { name: "Simpan pelunasan" }),
  );
  expect(await screen.findByText("Pelunasan tersimpan")).toBeInTheDocument();
  expect(ids).toHaveLength(2);
  expect(ids[0]).not.toBe(ids[1]);
  expect(
    mockDb
      .get()
      .creditPayments.filter((p) => ids.includes(p.id) && p.amount === 30_000),
  ).toHaveLength(2);
});

test("kirim ulang dengan id tertunda yang sudah tersimpan → pemberitahuan sudah tersimpan sebelumnya", async () => {
  const ids: string[] = [];
  loseFirstResponse(ids);
  const { user, sheet } = await openPaySheet();
  await user.type(
    within(sheet).getByRole("textbox", { name: "Nominal" }),
    "30000",
  );
  await user.click(
    within(sheet).getByRole("button", { name: "Simpan pelunasan" }),
  );
  expect(await within(sheet).findByRole("alert")).toBeInTheDocument();
  vi.setSystemTime(NOW + 60_000);
  await user.click(
    within(sheet).getByRole("button", { name: "Simpan pelunasan" }),
  );
  expect(
    await screen.findByText(
      "Pelunasan ini sudah tersimpan sebelumnya — cek riwayat",
    ),
  ).toBeInTheDocument();
  expect(ids[0]).toBe(ids[1]);
  expect(
    mockDb.get().creditPayments.filter((p) => p.id === ids[0]),
  ).toHaveLength(1);
});

test("nominal atau cara bayar berubah selama id tertunda → id baru", async () => {
  const ids: string[] = [];
  server.use(
    http.post(OWNER_PAY("Bu Sari"), async ({ request }) => {
      const body = (await request.clone().json()) as OwnerCreditPaymentInput;
      ids.push(body.id);
      return HttpResponse.error();
    }),
  );
  const { user, sheet } = await openPaySheet();
  const ui = within(sheet);
  const box = ui.getByRole("textbox", { name: "Nominal" });
  const save = () =>
    user.click(ui.getByRole("button", { name: "Simpan pelunasan" }));
  await user.type(box, "30000");
  await save();
  await ui.findByRole("alert");
  await save();
  await waitFor(() => expect(ids).toHaveLength(2));
  expect(ids[1]).toBe(ids[0]);
  await user.clear(box);
  await user.type(box, "40000");
  await save();
  await waitFor(() => expect(ids).toHaveLength(3));
  expect(ids[2]).not.toBe(ids[0]);
  await user.click(ui.getByRole("radio", { name: "Tunai ke pemilik" }));
  await save();
  await waitFor(() => expect(ids).toHaveLength(4));
  expect(ids[3]).not.toBe(ids[2]);
});

test("simpan berhasil → tutup → buka lagi → input yang sama → id baru, dua pelunasan", async () => {
  const bodies: OwnerCreditPaymentInput[] = [];
  server.events.on("request:start", async ({ request }) => {
    if (request.method === "POST" && request.url.endsWith(OWNER_PAY("Bu Sari")))
      bodies.push((await request.clone().json()) as OwnerCreditPaymentInput);
  });
  const { user, sheet } = await openPaySheet();
  await user.type(
    within(sheet).getByRole("textbox", { name: "Nominal" }),
    "30000",
  );
  await user.click(
    within(sheet).getByRole("button", { name: "Simpan pelunasan" }),
  );
  expect(await screen.findByText("Pelunasan tersimpan")).toBeInTheDocument();
  await waitFor(() =>
    expect(
      screen.queryByRole("dialog", { name: "Catat pelunasan" }),
    ).toBeNull(),
  );
  await user.click(screen.getByRole("button", { name: "Catat pelunasan" }));
  const again = await screen.findByRole("dialog", { name: "Catat pelunasan" });
  await user.type(
    within(again).getByRole("textbox", { name: "Nominal" }),
    "30000",
  );
  await user.click(
    within(again).getByRole("button", { name: "Simpan pelunasan" }),
  );
  await waitFor(() => expect(bodies).toHaveLength(2));
  expect(bodies[0]?.id).not.toBe(bodies[1]?.id);
  await waitFor(() =>
    expect(
      mockDb
        .get()
        .creditPayments.filter((p) => bodies.some((b) => b.id === p.id)),
    ).toHaveLength(2),
  );
  server.events.removeAllListeners();
});

test("tombol Simpan nonaktif selama pending (tidak terkirim dua kali)", async () => {
  let calls = 0;
  server.use(
    http.post(OWNER_PAY("Bu Sari"), async () => {
      calls += 1;
      await new Promise((r) => setTimeout(r, 100));
      return HttpResponse.error();
    }),
  );
  const { user, sheet } = await openPaySheet();
  const ui = within(sheet);
  await user.type(ui.getByRole("textbox", { name: "Nominal" }), "50000");
  const save = ui.getByRole("button", { name: "Simpan pelunasan" });
  await user.click(save);
  expect(save).toBeDisabled();
  await user.click(save);
  await ui.findByRole("alert");
  expect(calls).toBe(1);
});

test("Atur limit di bawah saldo → catatan R7; Simpan limit → toast dan kartu", async () => {
  const user = userEvent.setup();
  renderApp(page("Bu Sari"));
  await title("Bu Sari");
  await user.click(screen.getByRole("button", { name: "Atur limit" }));
  const sheet = await screen.findByRole("dialog", { name: "Atur limit" });
  const ui = within(sheet);
  const field = ui.getByRole("textbox", { name: "Limit kasbon" });
  expect(field).toHaveValue("Rp500.000");
  expect(ui.getByText("Sisa kasbon sekarang Rp120.000.")).toBeInTheDocument();
  expect(ui.queryByText(/Kasbon baru di kasir akan melewati limit/)).toBeNull();
  await user.clear(field);
  await user.type(field, "100000");
  expect(
    ui.getByText("Kasbon baru di kasir akan melewati limit dan perlu alasan."),
  ).toBeInTheDocument();
  await user.click(ui.getByRole("button", { name: "Simpan limit" }));
  expect(await screen.findByText("Limit disimpan")).toBeInTheDocument();
  const card = screen.getByRole("region", { name: "Ringkasan pelanggan" });
  await waitFor(() =>
    expect(
      within(card).getByText(/^Limit Rp100\.000 · kasbon tertua/),
    ).toBeInTheDocument(),
  );
  expect(
    mockDb.get().customers.find((c) => c.name === "Bu Sari")?.creditLimit,
  ).toBe(100_000);
});

test("Atur limit: isian tidak valid → galat dan tombol nonaktif", async () => {
  const user = userEvent.setup();
  renderApp(page("Bu Sari"));
  await title("Bu Sari");
  await user.click(screen.getByRole("button", { name: "Atur limit" }));
  const ui = within(await screen.findByRole("dialog", { name: "Atur limit" }));
  const field = ui.getByRole("textbox", { name: "Limit kasbon" });
  await user.clear(field);
  await user.type(field, "abc");
  expect(
    ui.getByText("Limit harus bilangan bulat minimal 0"),
  ).toBeInTheDocument();
  expect(ui.getByRole("button", { name: "Simpan limit" })).toBeDisabled();
});

/** Pelunasan kasir Tunai pada shift yang sudah tutup (laci shift lain buka). */
async function plantClosedShiftCashPayment() {
  await loginWithShift();
  const pay = await post("/api/credit-payments", {
    id: "pel-1",
    customerId: customerId("Bu Sari"),
    amount: 50_000,
    method: "tunai",
    cashReceived: 50_000,
    print: false,
  });
  expect(pay.status).toBe(201);
  return pay;
}

async function closeShiftAndOpenAnother() {
  await post("/api/shifts/current/close", { countedCash: 250_000 });
  const { login } = await import("@/mocks/handlers/test-helpers");
  await login("654321", "Budi");
  await post("/api/shifts", { openingCash: 100_000 });
}

test("batal pelunasan Tunai kasir (shift sudah tutup): kalimat pemilik, alasan wajib, tanpa perubahan laci, fokus ke judul", async () => {
  await plantClosedShiftCashPayment();
  await closeShiftAndOpenAnother();
  const drawerBefore = structuredClone(mockDb.get().shift);
  const user = userEvent.setup();
  renderApp(page("Bu Sari"));
  const h1 = await title("Bu Sari");
  await user.click(
    within(rowOf("Tunai di kasir")).getByRole("button", {
      name: /Pelunasan · Tunai di kasir/,
    }),
  );
  const sheet = await screen.findByRole("dialog", {
    name: "Pelunasan Rp50.000",
  });
  await user.click(
    within(sheet).getByRole("button", { name: "Batalkan pelunasan" }),
  );
  const dialog = await screen.findByRole("alertdialog", {
    name: "Batalkan pelunasan ini?",
  });
  const ui = within(dialog);
  expect(
    ui.getByText(
      /Rp50\.000 dari Bu Sari, 5 Nov 10\.00\. Sisa kasbon menjadi Rp120\.000\./,
    ),
  ).toBeInTheDocument();
  expect(
    ui.getByText(/Uang dikembalikan pemilik; laci kasir tidak berubah\./),
  ).toBeInTheDocument();
  const confirm = ui.getByRole("button", { name: "Batalkan pelunasan" });
  expect(confirm).toBeDisabled();
  await user.type(ui.getByRole("textbox", { name: "Alasan" }), "Salah catat");
  await user.click(confirm);
  expect(await screen.findByText("Pelunasan dibatalkan")).toBeInTheDocument();
  await waitFor(() => expect(h1).toHaveFocus());
  const row = rowOf("Tunai di kasir");
  expect(within(row).getByText("Dibatalkan")).toBeInTheDocument();
  expect(
    within(row).getByText("Salah catat · Pak Ahmad · Hari ini 10.00"),
  ).toBeInTheDocument();
  // Laci tidak berubah.
  expect(mockDb.get().shift).toEqual(drawerBefore);
  const card = screen.getByRole("region", { name: "Ringkasan pelanggan" });
  expect(within(card).getByText("Rp120.000")).toBeInTheDocument();
});

test("pelunasan kasir di shift yang masih buka: tanpa tombol, ada keterangan", async () => {
  await plantClosedShiftCashPayment();
  renderApp(page("Bu Sari"));
  await title("Bu Sari");
  const row = rowOf("Tunai di kasir");
  expect(within(row).queryByRole("button")).toBeNull();
  expect(
    within(row).getByText("Masih di shift yang buka — batalkan dari kasir"),
  ).toBeInTheDocument();
});

test("batal pelunasan Transfer → tanpa kalimat laci", async () => {
  await ownerPay("Bu Sari", "own-1", 20_000);
  const user = userEvent.setup();
  renderApp(page("Bu Sari"));
  await title("Bu Sari");
  await user.click(within(rowOf("Transfer ke pemilik")).getByRole("button"));
  const sheet = await screen.findByRole("dialog", {
    name: "Pelunasan Rp20.000",
  });
  await user.click(
    within(sheet).getByRole("button", { name: "Batalkan pelunasan" }),
  );
  const dialog = await screen.findByRole("alertdialog");
  expect(
    within(dialog).getByText(/Sisa kasbon menjadi Rp120\.000\./),
  ).toBeInTheDocument();
  expect(within(dialog).queryByText(/laci kasir tidak berubah/)).toBeNull();
});

test("409 IN_OPEN_SHIFT (shift dibuka di sela): pesan di lembar dan data dimuat ulang", async () => {
  await plantClosedShiftCashPayment();
  await closeShiftAndOpenAnother();
  // Pelunasan dari shift yang kini terbuka kembali: server menolak.
  const user = userEvent.setup();
  renderApp(page("Bu Sari"));
  await title("Bu Sari");
  await user.click(within(rowOf("Tunai di kasir")).getByRole("button"));
  const sheet = await screen.findByRole("dialog", {
    name: "Pelunasan Rp50.000",
  });
  await user.click(
    within(sheet).getByRole("button", { name: "Batalkan pelunasan" }),
  );
  const dialog = await screen.findByRole("alertdialog");
  server.use(
    http.post("/api/owner/credit-payments/pel-1/cancel", () =>
      HttpResponse.json(
        {
          type: "about:blank",
          title: "x",
          status: 409,
          code: "IN_OPEN_SHIFT",
          detail: "Masih di shift yang buka — batalkan dari kasir",
        },
        {
          status: 409,
          headers: { "Content-Type": "application/problem+json" },
        },
      ),
    ),
  );
  await user.type(
    within(dialog).getByRole("textbox", { name: "Alasan" }),
    "Salah catat",
  );
  await user.click(
    within(dialog).getByRole("button", { name: "Batalkan pelunasan" }),
  );
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect(screen.queryByText("Pelunasan dibatalkan")).toBeNull();
});

test("409 IN_OPEN_SHIFT: lembar yang terbuka ikut keadaan terbaru (tanpa Batalkan, ada keterangan)", async () => {
  await plantClosedShiftCashPayment();
  await closeShiftAndOpenAnother();
  const user = userEvent.setup();
  renderApp(page("Bu Sari"));
  await title("Bu Sari");
  await user.click(within(rowOf("Tunai di kasir")).getByRole("button"));
  const sheet = await screen.findByRole("dialog", {
    name: "Pelunasan Rp50.000",
  });
  await user.click(
    within(sheet).getByRole("button", { name: "Batalkan pelunasan" }),
  );
  const dialog = await screen.findByRole("alertdialog");
  const fresh = await json<OwnerCustomer>(
    await get(`/api/owner/customers/${customerId("Bu Sari")}`),
  );
  for (const e of fresh.history) {
    if (e.payment?.id === "pel-1") e.payment.inOpenShift = true;
  }
  server.use(
    http.get(`/api/owner/customers/${customerId("Bu Sari")}`, () =>
      HttpResponse.json(fresh),
    ),
    http.post("/api/owner/credit-payments/pel-1/cancel", () =>
      HttpResponse.json(
        {
          type: "about:blank",
          title: "x",
          status: 409,
          code: "IN_OPEN_SHIFT",
          detail: "Masih di shift yang buka — batalkan dari kasir",
        },
        {
          status: 409,
          headers: { "Content-Type": "application/problem+json" },
        },
      ),
    ),
  );
  await user.type(
    within(dialog).getByRole("textbox", { name: "Alasan" }),
    "Salah catat",
  );
  await user.click(
    within(dialog).getByRole("button", { name: "Batalkan pelunasan" }),
  );
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  const open = screen.getByRole("dialog", { name: "Pelunasan Rp50.000" });
  expect(
    within(open).queryByRole("button", { name: "Batalkan pelunasan" }),
  ).toBeNull();
  expect(
    within(open).getByText("Masih di shift yang buka — batalkan dari kasir"),
  ).toBeInTheDocument();
});

test("Lebih bayar (Q8): kartu Lebih bayar + Limit, Catat pelunasan nonaktif, pelunasan lama tetap aktif", async () => {
  plantOverpaid();
  renderApp("/owner/kasbon/cus-lebih");
  await title("Pak Bayar");
  const card = screen.getByRole("region", { name: "Ringkasan pelanggan" });
  expect(within(card).getByText("Lebih bayar")).toBeInTheDocument();
  expect(within(card).getByText("Rp40.000")).toBeInTheDocument();
  expect(within(card).getByText("Limit Rp300.000")).toBeInTheDocument();
  expect(within(card).queryByText(/kasbon tertua/)).toBeNull();
  expect(
    screen.getByRole("button", { name: "Catat pelunasan" }),
  ).toBeDisabled();
});

test("Q8: kasbon yang dibatalkan pemilik tetap dicoret dengan alasan, pelunasan sebelumnya tetap aktif", async () => {
  await loginWithShift();
  const sale = await json<Sale>(
    await post("/api/sales", {
      ...cashSale(),
      payments: [{ method: "credit", amount: 36_000 }],
      cashReceived: 0,
      customerId: customerId("Mbak Dewi"),
    }),
  );
  await ownerPay("Mbak Dewi", "own-1", 30_000);
  await post("/api/shifts/current/close", { countedCash: 200_000 });
  vi.setSystemTime(Date.UTC(2026, 10, 5, 7, 5)); // 14.05 WIB
  const voided = await post(`/api/owner/sales/${sale.id}/void`, {
    reason: "Salah orang",
  });
  expect(voided.status).toBe(200);
  renderApp(page("Mbak Dewi"));
  await title("Mbak Dewi");
  const card = screen.getByRole("region", { name: "Ringkasan pelanggan" });
  expect(within(card).getByText("Lebih bayar")).toBeInTheDocument();
  expect(within(card).getByText("Rp30.000")).toBeInTheDocument();
  const kasbon = rowOf(`struk ${sale.number}`);
  expect(within(kasbon).getByText("Dibatalkan")).toBeInTheDocument();
  expect(
    within(kasbon).getByText("Salah orang · Pak Ahmad · Hari ini 14.05"),
  ).toBeInTheDocument();
  const payment = rowOf("Transfer ke pemilik");
  expect(within(payment).queryByText("Dibatalkan")).toBeNull();
  expect(within(payment).getByRole("button")).toBeInTheDocument();
});

test("pelanggan tidak ada → pesan galat dengan Coba lagi", async () => {
  renderApp("/owner/kasbon/tidak-ada");
  expect(await screen.findByRole("alert")).toHaveTextContent(
    "Data tidak ditemukan",
  );
  expect(screen.getByRole("button", { name: "Coba lagi" })).toBeInTheDocument();
});
