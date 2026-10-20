import { screen, waitFor } from "@testing-library/react";
import { beforeEach, expect, test, vi } from "vitest";
import { mockDb } from "@/mocks/db";
import { loginWithShift } from "@/mocks/handlers/test-helpers";
import { openPay, payDialog, trackSales } from "@/test/payment";
import { scannerTyping } from "@/test/typing";
import { useCart } from "../cart/cart-store";

vi.mock("@/shared/lib/beep", () => ({ beep: vi.fn() }));

beforeEach(async () => {
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
