import { screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, beforeEach, expect, test, vi } from "vitest";
import { mockDb } from "@/mocks/db";
import {
  json,
  ownerLogin,
  post,
  receiptInput,
  staffLogin,
} from "@/mocks/handlers/test-helpers";
import type { OwnerProduct } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { renderApp } from "@/test/render-app";
import { RECEIPT_NOW } from "@/test/seed-receipts";

const RECEIPT_MESSAGE = "Barang ini sudah ada di barang masuk — pakai Nonaktif";
const TEH = {
  name: "Teh Pucuk Harum 350 ml",
  category: "Minuman",
  sellUnit: "botol",
  barcode: "8996001600269",
  cost: 3000,
  price: 4000,
  tier: null,
  bigUnit: null,
  minStock: null,
};

let teh: OwnerProduct;

/** Rina mencatat nota `id`: 24 botol Teh × Rp3.000, transfer. */
async function receiveTeh(id: string) {
  const unit = teh.units[0];
  if (!unit) throw new Error("Teh tanpa satuan");
  const res = await post(
    "/api/staff/receipts",
    receiptInput({
      id,
      payment: {
        timing: "sekarang",
        method: "transfer",
        cashSource: null,
        dueDate: null,
      },
      lines: [
        {
          lineId: "l1",
          productId: teh.id,
          unitId: unit.id,
          newProduct: null,
          qty: 24,
          unitCost: 3000,
          expiryDate: null,
        },
      ],
    }),
  );
  expect(res.status).toBe(201);
}

async function openTeh() {
  renderApp(`/owner/barang/${teh.id}`);
  await screen.findByRole("heading", { level: 1, name: TEH.name });
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(RECEIPT_NOW);
  await ownerLogin();
  teh = await json<OwnerProduct>(await post("/api/owner/products", TEH));
  expect((await staffLogin()).status).toBe(200);
  await receiveTeh("nota-teh");
});

afterEach(() => vi.useRealTimers());

test("barang di nota barang masuk aktif (R32): tanpa tombol Hapus barang; alasan tampil", async () => {
  await openTeh();
  const settings = screen.getByRole("region", { name: "Pengaturan" });
  expect(
    within(settings).queryByRole("button", { name: "Hapus barang" }),
  ).toBeNull();
  expect(within(settings).getByText(RECEIPT_MESSAGE)).toBeInTheDocument();
});

test("nota dibatalkan → tombol Hapus barang kembali", async () => {
  expect((await post("/api/owner/receipts/nota-teh/cancel", {})).status).toBe(
    200,
  );
  await openTeh();
  expect(
    screen.getByRole("button", { name: "Hapus barang" }),
  ).toBeInTheDocument();
  expect(screen.queryByText(RECEIPT_MESSAGE)).toBeNull();
});

test("barang masuk dicatat setelah halaman dimuat: server menolak hapus dengan alasan barang masuk (bukan 'sudah terjual')", async () => {
  const user = userEvent.setup();
  expect((await post("/api/owner/receipts/nota-teh/cancel", {})).status).toBe(
    200,
  );
  await openTeh();
  // Nota kedua dengan barang yang sama masuk saat halaman terbuka.
  await receiveTeh("nota-teh-2");
  await user.click(screen.getByRole("button", { name: "Hapus barang" }));
  const dialog = await screen.findByRole("alertdialog");
  await user.click(within(dialog).getByRole("button", { name: "Hapus" }));
  expect(await within(dialog).findByRole("alert")).toHaveTextContent(
    RECEIPT_MESSAGE,
  );
  expect(mockDb.get().products.some((p) => p.id === teh.id)).toBe(true);
});
