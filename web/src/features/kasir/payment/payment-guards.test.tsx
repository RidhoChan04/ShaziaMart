import { act, screen, waitFor, within } from "@testing-library/react";
import { HttpResponse, http } from "msw";
import { beforeEach, expect, test, vi } from "vitest";
import { mockDb } from "@/mocks/db";
import { loginWithShift, post } from "@/mocks/handlers/test-helpers";
import { server } from "@/mocks/node";
import { setScenario } from "@/mocks/scenarios";
import type { SaleRequest } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { getGetHealthQueryKey } from "@/shared/api/gen/system/system";
import {
  addBimoli,
  openPay,
  panelChange,
  payDialog,
  trackSales,
} from "@/test/payment";
import { seedMatch } from "@/test/spec-cart";
import { scannerTyping } from "@/test/typing";
import { useCart } from "../cart/cart-store";

vi.mock("@/shared/lib/beep", () => ({ beep: vi.fn() }));

// Membuat buildSaleRequest melempar secara sinkron (mis. total di luar rentang aman).
const build = vi.hoisted(() => ({ fail: false }));
vi.mock("./payment-model", async (importOriginal) => {
  const mod = await importOriginal<typeof import("./payment-model")>();
  return {
    ...mod,
    buildSaleRequest: (...args: Parameters<typeof mod.buildSaleRequest>) => {
      if (build.fail) throw new RangeError("Total di luar rentang aman");
      return mod.buildSaleRequest(...args);
    },
  };
});

const OFFLINE = "Server tidak tersambung — coba lagi";

beforeEach(async () => {
  build.fail = false;
  useCart.setState(useCart.getInitialState(), true);
  await loginWithShift();
});

test("scan di UANG DITERIMA: rentetan dibuang, Enter penutupnya tidak menyimpan", async () => {
  const bodies = trackSales();
  const { user, ui, received, selesai } = await openPay();
  await user.type(received(), "50000");
  await scannerTyping().type(received(), "8992761111014{Enter}");

  expect(ui.getByRole("alert")).toHaveTextContent("Itu barcode, bukan angka");
  expect(received()).toHaveValue("50000");
  await new Promise((r) => setTimeout(r, 50));
  expect(bodies).toHaveLength(0);
  expect(payDialog()).not.toBeNull();
  expect(selesai()).toBeEnabled();
});

test("UANG DITERIMA diketik manusia (jeda 60 ms) + Enter → tersimpan", async () => {
  const bodies = trackSales();
  const { user, received } = await openPay();
  await user.type(received(), "50000{Enter}");
  await waitFor(() => expect(payDialog()).toBeNull());
  expect(bodies).toHaveLength(1);
  expect(mockDb.get().sales[0]?.cashReceived).toBe(50000);
  expect(screen.queryByText("Itu barcode, bukan angka")).toBeNull();
});

test("POST /api/sales tanpa jawaban → 15 dtk kemudian pesan; Selesai aktif lagi; coba lagi memakai saleId sama", async () => {
  const saleIds: string[] = [];
  let hang = true;
  server.use(
    http.post("/api/sales", async ({ request }) => {
      saleIds.push(((await request.clone().json()) as SaleRequest).saleId);
      if (hang) await new Promise(() => {});
    }),
  );
  const { user, ui, selesai } = await openPay();
  const saleId = useCart.getState().saleId;
  vi.useFakeTimers({
    toFake: ["setTimeout", "clearTimeout", "performance"],
    shouldAdvanceTime: true,
  });
  await user.click(ui.getByRole("button", { name: "Uang pas" }));
  await user.click(selesai());
  await waitFor(() => expect(saleIds).toHaveLength(1));
  expect(selesai()).toBeDisabled();

  await act(() => vi.advanceTimersByTimeAsync(15_000));
  expect(await ui.findByRole("alert")).toHaveTextContent(OFFLINE);
  expect(selesai()).toBeEnabled();

  hang = false;
  await user.click(selesai());
  await waitFor(() => expect(payDialog()).toBeNull());
  expect(saleIds).toEqual([saleId, saleId]);
  expect(mockDb.get().sales.map((s) => s.id)).toEqual([saleId]);
});

test("buildSaleRequest melempar → pesan tampil, Selesai tetap bisa dipakai lagi", async () => {
  const bodies = trackSales();
  const { user, ui, selesai } = await openPay();
  await user.click(ui.getByRole("button", { name: "Uang pas" }));
  build.fail = true;
  await user.click(selesai());
  expect(ui.getByRole("alert")).toHaveTextContent(
    "Terjadi kesalahan di server",
  );
  expect(selesai()).toBeEnabled();
  expect(bodies).toHaveLength(0);

  build.fail = false;
  await user.click(selesai());
  await waitFor(() => expect(payDialog()).toBeNull());
  expect(bodies).toHaveLength(1);
});

test("server mati saat jendela bayar terbuka → Selesai nonaktif dengan keterangan", async () => {
  const { user, ui, selesai, queryClient } = await openPay();
  await user.click(ui.getByRole("button", { name: "Uang pas" }));
  expect(selesai()).toBeEnabled();
  expect(ui.queryByRole("status")).toBeNull();

  setScenario("server-mati");
  await act(() =>
    queryClient.refetchQueries({ queryKey: getGetHealthQueryKey() }),
  );
  await waitFor(() => expect(selesai()).toBeDisabled());
  expect(ui.getByRole("status")).toHaveTextContent(OFFLINE);
});

test("jawaban hilang lalu keranjang diubah → saleId sudah tersimpan: dialog transaksi tersimpan, kembalian dari server", async () => {
  let lose = true;
  server.use(
    http.post("/api/sales", async ({ request }) => {
      if (!lose) return;
      lose = false;
      // Server menyimpan, tetapi jawabannya tidak sampai ke kasir.
      await post("/api/sales", await request.clone().json());
      return HttpResponse.error();
    }),
  );
  const first = await openPay(() => {
    addBimoli();
    act(() => useCart.getState().addUnit(seedMatch("Indomie Goreng")));
  });
  await first.user.type(first.received(), "50000");
  await first.user.click(first.selesai());
  expect(await first.ui.findByRole("alert")).toHaveTextContent(OFFLINE);
  const stored = mockDb.get().sales[0];
  expect(stored?.total).toBe(39100);

  await first.user.keyboard("{Escape}");
  await waitFor(() => expect(payDialog()).toBeNull());
  const indomie = useCart.getState().lines[1]?.lineId ?? "";
  act(() => useCart.getState().remove(indomie));
  await first.user.click(screen.getByRole("button", { name: "Bayar" }));
  const again = within(
    await screen.findByRole("dialog", { name: "Pembayaran" }),
  );
  await first.user.type(
    again.getByRole("textbox", { name: "UANG DITERIMA" }),
    "50000",
  );
  await first.user.click(again.getByRole("button", { name: "Selesai" }));

  const notice = await screen.findByRole("alertdialog", {
    name: "Transaksi ini sudah tersimpan sebelumnya",
  });
  expect(within(notice).getByText(`No. ${stored?.number}`)).toBeInTheDocument();
  expect(
    within(notice).getByText("Total tersimpan Rp39.100"),
  ).toBeInTheDocument();
  expect(useCart.getState().lines).toHaveLength(1);

  await first.user.click(
    within(notice).getByRole("button", { name: "Mengerti" }),
  );
  await waitFor(() => expect(screen.queryByRole("alertdialog")).toBeNull());
  expect(payDialog()).toBeNull();
  expect(useCart.getState().lines).toHaveLength(0);
  expect(panelChange()).toHaveTextContent("Rp10.900");
  expect(mockDb.get().sales).toHaveLength(1);
});
