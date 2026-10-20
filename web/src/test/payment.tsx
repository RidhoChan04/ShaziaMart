import { act, screen, waitFor, within } from "@testing-library/react";
import { delay, http } from "msw";
import { expect } from "vitest";
import { useCart } from "@/features/kasir/cart/cart-store";
import { KasirScreen } from "@/features/kasir/screen/kasir-screen";
import { server } from "@/mocks/node";
import type { SaleRequest } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { renderWithQuery } from "./render-app";
import { seedMatch } from "./spec-cart";
import { humanTyping } from "./typing";

export const BIMOLI = "Minyak Goreng Bimoli 2 L";

/** Catat body setiap POST /api/sales, lalu teruskan ke handler mock. */
export function trackSales(wait = 0) {
  const bodies: SaleRequest[] = [];
  server.use(
    http.post("/api/sales", async ({ request }) => {
      bodies.push((await request.clone().json()) as SaleRequest);
      if (wait > 0) await delay(wait);
    }),
  );
  return bodies;
}

export function addBimoli() {
  act(() => useCart.getState().addUnit(seedMatch(BIMOLI)));
}

/** Layar kasir dengan keranjang `fill`, lalu jendela bayar dibuka lewat Bayar. */
export async function openPay(fill: () => void = addBimoli) {
  fill();
  const user = humanTyping();
  const { queryClient } = renderWithQuery(<KasirScreen />);
  const scan = screen.getByRole("combobox", {
    name: "Scan barcode / ketik nama atau kode",
  });
  const bayar = screen.getByRole("button", { name: "Bayar" });
  await waitFor(() => expect(bayar).toBeEnabled());
  await user.click(bayar);
  const dialog = await screen.findByRole("dialog", { name: "Pembayaran" });
  const ui = within(dialog);
  return {
    user,
    queryClient,
    scan,
    dialog,
    ui,
    selesai: () => ui.getByRole("button", { name: "Selesai" }),
    received: () => ui.getByRole("textbox", { name: "UANG DITERIMA" }),
  };
}

export const payDialog = () =>
  screen.queryByRole("dialog", { name: "Pembayaran" });

/** Kembalian transaksi terakhir di panel total. */
export const panelChange = () => screen.getByRole("status");
