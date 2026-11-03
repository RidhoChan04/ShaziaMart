import { beforeEach, describe, expect, test } from "vitest";
import type {
  CatalogMatch,
  OwnerProduct,
  OwnerTodaySummary,
  ReceiptInput,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { mockDb } from "../db";
import {
  json,
  ownerLogin,
  post,
  put,
  receiptInput,
  staffLogin,
  unitOf,
} from "./test-helpers";

const INDOMIE = "Indomie Goreng";
const TEH = "Teh Pucuk Harum 350 ml";
const TRANSFER = {
  timing: "sekarang",
  method: "transfer",
  cashSource: null,
  dueDate: null,
} as const;

const productId = (name: string): string => {
  const p = mockDb.get().products.find((x) => x.name === name);
  if (!p) throw new Error(`tanpa ${name}`);
  return p.id;
};
const detail = async (id: string) =>
  json<OwnerProduct>(await fetch(`/api/owner/products/${id}`));
const awaitingPriceCount = async () =>
  (await json<OwnerTodaySummary>(await fetch("/api/owner/summary/today")))
    .attention.awaitingPriceCount;
const codeAndDetail = async (res: Response) =>
  json<{ code: string; detail: string }>(res);

async function receive(patch: Partial<ReceiptInput> = {}): Promise<void> {
  const res = await post(
    "/api/staff/receipts",
    receiptInput({ payment: TRANSFER, ...patch }),
  );
  expect(res.status).toBe(201);
}

/** Barang baru dari nota: Teh Pucuk botol, dus isi 24 (barcode di dus), 2 dus × 80.000. */
const receiveTeh = () =>
  receive({
    lines: [
      {
        lineId: "l1",
        productId: null,
        unitId: null,
        newProduct: {
          name: TEH,
          sellUnit: "botol",
          notaUnit: "dus",
          notaUnitSize: 24,
          barcode: "8996001600269",
        },
        qty: 2,
        unitCost: 80_000,
        expiryDate: null,
      },
    ],
  });

/** Isi form Teh Pucuk dengan harga jual; modal kosong (hanya-baca di form). */
const tehInput = () => ({
  name: TEH,
  category: "Minuman",
  sellUnit: "botol",
  barcode: null,
  cost: null,
  price: 4000,
  tier: null,
  bigUnit: {
    unitId: unitOf(TEH, "dus").id,
    name: "dus",
    size: 24,
    barcode: "8996001600269",
    cost: null,
    price: 90_000,
  },
  minStock: null,
});

/** Isi form Indomie sesuai seed dengan modal dus yang diketik. */
const indomieInput = (bigCost: number) => ({
  name: INDOMIE,
  category: "Mi Instan",
  sellUnit: "pcs",
  barcode: "089686010947",
  cost: null,
  price: 3100,
  tier: { minQty: 40, price: 2800 },
  bigUnit: {
    unitId: unitOf(INDOMIE, "dus").id,
    name: "dus",
    size: 40,
    barcode: "189686010944",
    cost: bigCost,
    price: 112_000,
  },
  minStock: 10,
});

beforeEach(async () => {
  expect((await staffLogin()).status).toBe(200);
  expect((await ownerLogin()).status).toBe(200);
});

describe("barang menunggu harga jual", () => {
  test("PUT status barang menunggu → 422 'Isi harga jual dulu'; status menunggu_harga tidak bisa dipilih", async () => {
    await receiveTeh();
    const teh = productId(TEH);
    const before = mockDb.get().products;
    for (const status of ["aktif", "nonaktif"]) {
      const res = await put(`/api/owner/products/${teh}/status`, {
        status,
        scarce: false,
      });
      expect(res.status).toBe(422);
      expect(await codeAndDetail(res)).toMatchObject({
        code: "VALIDATION",
        detail: "Isi harga jual dulu",
      });
    }
    const res = await put(`/api/owner/products/${productId(INDOMIE)}/status`, {
      status: "menunggu_harga",
      scarce: false,
    });
    expect(res.status).toBe(422);
    expect((await codeAndDetail(res)).detail).toBe("Isi harga jual dulu");
    expect(mockDb.get().products).toEqual(before);
  });

  test("PUT barang menunggu dengan price 4000 & bigUnit.price 90000 → status aktif, awaitingPriceCount 0, priceHistory oldPrice null (tanpa 'Rp0')", async () => {
    await receiveTeh();
    const teh = productId(TEH);
    expect(await awaitingPriceCount()).toBe(1);
    expect((await detail(teh)).hasReceipts).toBe(true);

    const res = await put(`/api/owner/products/${teh}`, tehInput());
    expect(res.status).toBe(200);
    const p = await json<OwnerProduct>(res);
    expect(p.status).toBe("aktif");
    expect(p.cost).toEqual({ amount: 160_000, qtyBase: 48 });
    expect(
      p.priceHistory.map((e) => [e.unitName, e.oldPrice, e.newPrice, e.source]),
    ).toEqual([
      // Terbaru dulu (satu simpan → urutan baris dibalik).
      ["dus", null, 90_000, "pemilik"],
      ["botol", null, 4000, "pemilik"],
    ]);
    expect(await awaitingPriceCount()).toBe(0);

    // Sudah bisa dijual di kasir.
    const lookup = await fetch("/api/catalog/lookup?code=8996001600269");
    expect(lookup.status).toBe(200);
    expect((await json<CatalogMatch>(lookup)).product.name).toBe(TEH);
  });

  test("PUT barang menunggu yang tidak lolos validasi → 422, tetap menunggu", async () => {
    await receiveTeh();
    const teh = productId(TEH);
    const res = await put(`/api/owner/products/${teh}`, {
      ...tehInput(),
      price: null,
    });
    expect(res.status).toBe(422);
    expect((await detail(teh)).status).toBe("menunggu_harga");
  });
});

describe("modal hanya-baca setelah barang masuk (K16)", () => {
  beforeEach(() => {
    mockDb.update((s) => {
      s.stock[productId(INDOMIE)] = 60;
    });
  });

  test("Indomie setelah barang masuk: hasReceipts true; PUT dengan bigUnit.cost 120000 → cost tetap {380000,140}, tanpa butir modal baru", async () => {
    const id = productId(INDOMIE);
    expect((await detail(id)).hasReceipts).toBe(false);
    await receive();
    const before = await detail(id);
    expect(before).toMatchObject({
      hasReceipts: true,
      cost: { amount: 380_000, qtyBase: 140 },
    });
    expect(before.costAlert?.source).toBe("barang_masuk");

    const res = await put(`/api/owner/products/${id}`, indomieInput(120_000));
    expect(res.status).toBe(200);
    const after = await json<OwnerProduct>(res);
    expect(after.cost).toEqual({ amount: 380_000, qtyBase: 140 });
    expect(after.costAlert).toEqual(before.costAlert);
    expect(after.priceHistory).toEqual([]);
  });

  test("modal yang diketik tidak memicu 'Harga jual di bawah modal' (HPP barang masuk yang dipakai)", async () => {
    const id = productId(INDOMIE);
    await receive();
    const res = await put(`/api/owner/products/${id}`, {
      ...indomieInput(200_000),
      cost: 9000,
    });
    expect(res.status).toBe(200);
    expect((await json<OwnerProduct>(res)).cost).toEqual({
      amount: 380_000,
      qtyBase: 140,
    });
  });

  test("nota dibatalkan → hasReceipts false; modal dari form dipakai lagi", async () => {
    const id = productId(INDOMIE);
    await receive();
    mockDb.update((s) => {
      for (const r of s.receipts) r.status = "dibatalkan";
    });
    expect((await detail(id)).hasReceipts).toBe(false);
    const res = await put(`/api/owner/products/${id}`, indomieInput(110_000));
    expect(res.status).toBe(200);
    expect((await json<OwnerProduct>(res)).cost).toEqual({
      amount: 110_000,
      qtyBase: 40,
    });
  });
});
