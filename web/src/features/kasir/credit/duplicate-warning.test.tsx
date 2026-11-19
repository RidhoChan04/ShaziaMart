import { screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockDb } from "@/mocks/db";
import { loginWithShift, post } from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
import type { KasirCreditPaymentInput } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { renderWithQuery } from "@/test/render-app";
import { humanTyping } from "@/test/typing";
import { useCart } from "../cart/cart-store";
import { KasirScreen } from "../screen/kasir-screen";
import { ShiftActions } from "../shift/shift-actions";
import { clearPendingRepaymentId } from "./pending-repayment-id";

vi.mock("@/shared/lib/beep", () => ({ beep: vi.fn() }));

const AT_1405 = Date.UTC(2026, 10, 19, 7, 5); // 14.05 WIB
const AT_1430 = Date.UTC(2026, 10, 19, 7, 30); // 14.30 WIB
const TEXT =
  "Pelunasan Rp50.000 untuk Bu Sari sudah tercatat pukul 14.05 — tetap simpan lagi?";

const sariId = () =>
  mockDb.get().customers.find((c) => c.name === "Bu Sari")?.id ?? "";

beforeEach(async () => {
  // `performance` ikut dipalsukan: humanTyping memajukannya 60 ms per tombol (bukan scan).
  vi.useFakeTimers({ toFake: ["Date", "performance"] });
  vi.setSystemTime(AT_1405);
  clearPendingRepaymentId();
  useCart.setState(useCart.getInitialState(), true);
  await loginWithShift();
});

afterEach(() => {
  vi.useRealTimers();
});

/** Pelunasan Rp50.000 Bu Sari tercatat pukul 14.05 (di luar lembar), lalu jam menjadi 14.30. */
async function seedEarlierRepayment(patch: Partial<KasirCreditPaymentInput>) {
  const res = await post("/api/credit-payments", {
    id: "pel-1405",
    customerId: sariId(),
    amount: 50_000,
    method: "tunai",
    cashReceived: 50_000,
    print: false,
    ...patch,
  });
  expect(res.status).toBe(201);
  vi.setSystemTime(AT_1430);
}

/** Catat POST pelunasan dan GET daftar pelunasan shift (diteruskan ke mock). */
function track() {
  const bodies: KasirCreditPaymentInput[] = [];
  const lists = { count: 0 };
  server.use(
    http.post("/api/credit-payments", async ({ request }) => {
      bodies.push((await request.clone().json()) as KasirCreditPaymentInput);
    }),
    http.get("/api/credit-payments/shift", () => {
      lists.count += 1;
    }),
  );
  return { bodies, lists };
}

const SHEET_NAME = /^Pelunasan (kasbon|tersimpan)$/;
const warning = () =>
  screen.queryByRole("dialog", { name: "Pelunasan mungkin dobel" });

/** Buka lembar, pilih Bu Sari, isi tunai Rp50.000 pas. */
async function openAndFill() {
  const user = humanTyping();
  renderWithQuery(
    <>
      <ShiftActions onClosed={() => {}} />
      <KasirScreen />
    </>,
  );
  const trigger = screen.getByRole("button", { name: "Pelunasan kasbon" });
  await waitFor(() => expect(trigger).toBeEnabled());
  await user.click(trigger);
  const ui = within(screen.getByRole("dialog", { name: SHEET_NAME }));
  await user.click(await ui.findByRole("button", { name: /Bu Sari/ }));
  await user.type(
    ui.getByRole("textbox", { name: "NOMINAL PELUNASAN" }),
    "50000",
  );
  await user.type(ui.getByRole("textbox", { name: "UANG DITERIMA" }), "50000");
  const save = () => ui.getByRole("button", { name: "Simpan pelunasan" });
  return { user, ui, save };
}

test("duplikat 14.05 → dialog 'Pelunasan mungkin dobel' dengan teks persis; Kembali → tidak ada POST; simpan lagi (≤ 10 menit) → dialog muncul lagi; Tetap simpan (klik ganda) → satu POST", async () => {
  await seedEarlierRepayment({});
  const { bodies } = track();
  const { user, save } = await openAndFill();
  await user.click(save());
  const dialog = await screen.findByRole("dialog", {
    name: "Pelunasan mungkin dobel",
  });
  expect(within(dialog).getByText(TEXT)).toBeInTheDocument();
  // Pilihan aman lebih dulu: Enter tidak langsung menyimpan lagi.
  await waitFor(() =>
    expect(
      within(dialog).getByRole("button", { name: "Kembali" }),
    ).toHaveFocus(),
  );
  expect(
    within(dialog).getByRole("button", { name: "Kembali" }),
  ).toBeInTheDocument();
  expect(
    within(dialog).getByRole("button", { name: "Tetap simpan" }),
  ).toBeInTheDocument();

  await user.click(within(dialog).getByRole("button", { name: "Kembali" }));
  await waitFor(() => expect(warning()).toBeNull());
  expect(bodies).toHaveLength(0);
  expect(screen.queryByText("Pelunasan tersimpan")).toBeNull();

  // (pra-cek) Kembali melepas id tertunda: simpan lagi diperiksa lagi.
  vi.setSystemTime(AT_1430 + 60_000);
  await user.click(save());
  const again = await screen.findByRole("dialog", {
    name: "Pelunasan mungkin dobel",
  });
  expect(bodies).toHaveLength(0);
  await user.dblClick(
    within(again).getByRole("button", { name: "Tetap simpan" }),
  );
  expect(await screen.findByText("Pelunasan tersimpan")).toBeInTheDocument();
  expect(bodies).toHaveLength(1);
  expect(bodies[0]?.id).not.toBe("pel-1405");
  const sari = mockDb
    .get()
    .creditPayments.filter(
      (p) => p.customerId === sariId() && p.amount === 50_000,
    );
  expect(sari.map((p) => p.id)).toEqual(["pel-1405", bodies[0]?.id]);
});

test("Tutup (✕) dialog peringatan = Kembali: tidak ada POST dan simpan lagi diperiksa lagi", async () => {
  await seedEarlierRepayment({});
  const { bodies } = track();
  const { user, save } = await openAndFill();
  await user.click(save());
  const dialog = await screen.findByRole("dialog", {
    name: "Pelunasan mungkin dobel",
  });
  await user.click(within(dialog).getByRole("button", { name: "Tutup" }));
  await waitFor(() => expect(warning()).toBeNull());
  expect(bodies).toHaveLength(0);
  await user.click(save());
  expect(
    await screen.findByRole("dialog", { name: "Pelunasan mungkin dobel" }),
  ).toBeInTheDocument();
  expect(bodies).toHaveLength(0);
});

test("pelunasan 14.05 sudah dibatalkan → tanpa peringatan", async () => {
  await seedEarlierRepayment({});
  const cancel = await post("/api/credit-payments/pel-1405/cancel", {
    reason: "salah catat",
  });
  expect(cancel.status).toBe(200);
  const { bodies } = track();
  const { user, save } = await openAndFill();
  await user.click(save());
  expect(await screen.findByText("Pelunasan tersimpan")).toBeInTheDocument();
  expect(warning()).toBeNull();
  expect(bodies).toHaveLength(1);
});

test("lewat 60 menit sejak 14.05 → tanpa peringatan", async () => {
  await seedEarlierRepayment({});
  vi.setSystemTime(AT_1405 + 60 * 60_000 + 1);
  const { bodies } = track();
  const { user, save } = await openAndFill();
  await user.click(save());
  expect(await screen.findByText("Pelunasan tersimpan")).toBeInTheDocument();
  expect(warning()).toBeNull();
  expect(bodies).toHaveLength(1);
});

test("id dipakai ulang (jawaban hilang, server sudah menyimpan) → tanpa pemeriksaan: tidak ada GET daftar, langsung POST", async () => {
  let lose = true;
  let inner = false;
  const ids: string[] = [];
  const lists = { count: 0 };
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
    http.get("/api/credit-payments/shift", () => {
      lists.count += 1;
    }),
  );
  const { user, ui, save } = await openAndFill();
  await user.click(save());
  expect(await ui.findByRole("alert")).toHaveTextContent(
    "Server tidak tersambung — coba lagi",
  );
  // Id baru → diperiksa sekali (belum ada pelunasan lain).
  expect(lists.count).toBe(1);
  await user.click(save());
  expect(await screen.findByText("Pelunasan tersimpan")).toBeInTheDocument();
  expect(warning()).toBeNull();
  expect(ids).toHaveLength(2);
  expect(ids[1]).toBe(ids[0]);
  expect(lists.count).toBe(1);
});

test("galat GET daftar pelunasan shift → POST tetap jalan tanpa peringatan", async () => {
  await seedEarlierRepayment({});
  const bodies: KasirCreditPaymentInput[] = [];
  server.use(
    http.get("/api/credit-payments/shift", () => HttpResponse.error()),
    http.post("/api/credit-payments", async ({ request }) => {
      bodies.push((await request.clone().json()) as KasirCreditPaymentInput);
    }),
  );
  const { user, save } = await openAndFill();
  await user.click(save());
  expect(await screen.findByText("Pelunasan tersimpan")).toBeInTheDocument();
  expect(warning()).toBeNull();
  expect(bodies).toHaveLength(1);
});
