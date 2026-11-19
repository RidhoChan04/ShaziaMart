import { screen, waitFor, within } from "@testing-library/react";
import { delay, HttpResponse, http } from "msw";
import { beforeEach, expect, test, vi } from "vitest";
import { mockDb } from "@/mocks/db";
import { loginWithShift, post } from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
import type { ExpenseInput } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { renderWithQuery } from "@/test/render-app";
import { fillSpecCart } from "@/test/spec-cart";
import { humanTyping, scannerTyping } from "@/test/typing";
import { useCart } from "../cart/cart-store";
import { KasirScreen } from "../screen/kasir-screen";
import { clearPendingExpenseId } from "./pending-expense-id";
import { ShiftActions } from "./shift-actions";

vi.mock("@/shared/lib/beep", () => ({ beep: vi.fn() }));

const OFFLINE = "Server tidak tersambung — coba lagi";

beforeEach(async () => {
  clearPendingExpenseId();
  useCart.setState(useCart.getInitialState(), true);
  await loginWithShift();
});

async function setup() {
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
  const trigger = screen.getByRole("button", { name: "Kas keluar" });
  await waitFor(() => expect(trigger).toBeEnabled());
  return { user, scan, trigger };
}

const dlg = () =>
  screen.queryByRole("dialog", { name: "Kas keluar dari laci" });
const ui = () =>
  within(screen.getByRole("dialog", { name: "Kas keluar dari laci" }));
const nominal = () => ui().getByRole("textbox", { name: "Nominal" });
const alasan = () => ui().getByRole("textbox", { name: "Alasan" });
const save = () => ui().getByRole("button", { name: "Catat kas keluar" });
// Seed memuat kas keluar shift lama; yang dihitung hanya milik shift yang sedang buka.
const stored = () =>
  mockDb
    .get()
    .drawerExpenses.filter((e) => e.shiftId === mockDb.get().shift?.id);
const toasted = async (text: string) =>
  expect((await screen.findAllByText(text)).length).toBeGreaterThan(0);

async function fillAndSave(user: ReturnType<typeof humanTyping>) {
  await user.type(nominal(), "15000");
  await user.type(alasan(), "Beli es batu");
  await user.click(save());
}

test("tombol 'Kas keluar' ada di header sebelum 'Riwayat', setelah 'Pelunasan kasbon'", async () => {
  await setup();
  const names = screen
    .getAllByRole("button")
    .map((b) => b.textContent)
    .filter((t) =>
      ["Pelunasan kasbon", "Kas keluar", "Riwayat", "Kunci"].includes(t ?? ""),
    );
  expect(names).toEqual(["Pelunasan kasbon", "Kas keluar", "Riwayat", "Kunci"]);
});

test("dialog: judul, Nominal terfokus, placeholder, kalimat laci mengikuti nominal, R11; tombol nonaktif sampai lengkap", async () => {
  const { user, trigger } = await setup();
  await user.click(trigger);
  await screen.findByRole("dialog", { name: "Kas keluar dari laci" });
  expect(nominal()).toHaveFocus();
  expect(alasan()).toHaveAttribute("placeholder", "Beli es batu");
  expect(alasan()).toHaveAttribute("maxlength", "200");
  expect(save()).toBeDisabled();
  await user.type(nominal(), "15000");
  expect(
    ui().getByText("Uang seharusnya di laci berkurang Rp15.000."),
  ).toBeVisible();
  expect(save()).toBeDisabled();
  await user.type(alasan(), "   ");
  expect(save()).toBeDisabled();
  await user.type(alasan(), "Beli es batu");
  expect(save()).toBeEnabled();
  expect(
    await ui().findByText("Ragu? Telepon pemilik: 0812-3456-7890"),
  ).toBeVisible();
  expect(ui().getByRole("button", { name: "Kembali" })).toBeVisible();
});

test("nominal 0 tidak bisa disimpan", async () => {
  const { user, trigger } = await setup();
  await user.click(trigger);
  await user.type(nominal(), "0");
  await user.type(alasan(), "x");
  expect(save()).toBeDisabled();
});

test("simpan → toast 'Kas keluar tercatat', dialog tutup, fokus ke kotak scan, rekaman tersimpan", async () => {
  const { user, trigger, scan } = await setup();
  await user.click(trigger);
  await fillAndSave(user);
  await toasted("Kas keluar tercatat");
  await waitFor(() => expect(dlg()).toBeNull());
  await waitFor(() => expect(scan).toHaveFocus());
  expect(stored()).toHaveLength(1);
  expect(stored()[0]).toMatchObject({
    amount: 15_000,
    reason: "Beli es batu",
    cancelledAt: null,
  });
});

test("aktif walau keranjang berisi; keranjang tidak berubah", async () => {
  const { user, trigger } = await setup();
  fillSpecCart();
  const before = useCart.getState().lines;
  expect(before.length).toBeGreaterThan(0);
  await user.click(trigger);
  await fillAndSave(user);
  await toasted("Kas keluar tercatat");
  expect(useCart.getState().lines).toEqual(before);
});

test("Kembali menutup tanpa request; fokus ke kotak scan", async () => {
  const { user, trigger, scan } = await setup();
  await user.click(trigger);
  await user.click(ui().getByRole("button", { name: "Kembali" }));
  await waitFor(() => expect(dlg()).toBeNull());
  await waitFor(() => expect(scan).toHaveFocus());
  expect(stored()).toHaveLength(0);
});

test("rentetan scanner di isian Alasan tidak menjadi alasan", async () => {
  const { user, trigger } = await setup();
  await user.click(trigger);
  await user.type(nominal(), "15000");
  await user.click(alasan());
  await scannerTyping().keyboard("8999999{Enter}");
  expect(ui().getByText("Itu hasil scan barcode, bukan alasan")).toBeVisible();
  expect(stored()).toHaveLength(0);
});

test("klik ganda 'Catat kas keluar' → satu POST", async () => {
  let posts = 0;
  server.use(
    http.post("/api/shifts/current/expenses", async () => {
      posts += 1;
      await delay(50);
      return undefined;
    }),
  );
  const { user, trigger } = await setup();
  await user.click(trigger);
  await user.type(nominal(), "15000");
  await user.type(alasan(), "Beli es batu");
  const button = save();
  await user.dblClick(button);
  // Toast tes lain bisa masih tampil: tunggu dialog tutup (jawaban sudah kembali).
  await waitFor(() => expect(dlg()).toBeNull());
  expect(posts).toBe(1);
  expect(stored()).toHaveLength(1);
});

test("respons hilang → pesan; klik lagi memakai id sama → satu rekaman; toast replay", async () => {
  const ids: string[] = [];
  let lose = true;
  let inner = false;
  server.use(
    http.post("/api/shifts/current/expenses", async ({ request }) => {
      const body = (await request.clone().json()) as ExpenseInput;
      if (inner) return undefined;
      ids.push(body.id);
      if (!lose) return undefined;
      lose = false;
      inner = true;
      await post("/api/shifts/current/expenses", body);
      inner = false;
      return HttpResponse.error();
    }),
  );
  const { user, trigger } = await setup();
  await user.click(trigger);
  await fillAndSave(user);
  expect(await ui().findByRole("alert")).toHaveTextContent(OFFLINE);
  expect(stored()).toHaveLength(1);
  await user.click(save());
  await toasted("Kas keluar ini sudah tercatat sebelumnya");
  await waitFor(() => expect(dlg()).toBeNull());
  expect(ids).toHaveLength(2);
  expect(ids[0]).toBe(ids[1]);
  expect(stored()).toHaveLength(1);
});

test("isian berubah setelah galat → id baru", async () => {
  const ids: string[] = [];
  let fail = true;
  server.use(
    http.post("/api/shifts/current/expenses", async ({ request }) => {
      const body = (await request.clone().json()) as ExpenseInput;
      ids.push(body.id);
      if (!fail) return undefined;
      fail = false;
      return HttpResponse.error();
    }),
  );
  const { user, trigger } = await setup();
  await user.click(trigger);
  await fillAndSave(user);
  await ui().findByRole("alert");
  await user.clear(nominal());
  await user.type(nominal(), "20000");
  await user.click(save());
  await toasted("Kas keluar tercatat");
  expect(ids).toHaveLength(2);
  expect(ids[0]).not.toBe(ids[1]);
});
