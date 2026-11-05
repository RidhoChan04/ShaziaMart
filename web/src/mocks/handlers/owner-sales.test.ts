import { beforeEach, describe, expect, test, vi } from "vitest";
import type {
  OwnerSale,
  OwnerSaleRow,
  Problem,
  Sale,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { DAY_MS } from "@/shared/lib/business-day";
import { newId } from "@/shared/lib/id";
import { mockDb } from "../db";
import { cashierExceptions } from "../exceptions";
import {
  BIMOLI,
  cashSale,
  customerBalance,
  customerId,
  get,
  json,
  loginWithShift,
  ownerLogin,
  post,
  saleItem,
  unitOf,
  userId,
  voidSale,
} from "./test-helpers";

/** Kamis 5 Nov 2026 10.00 WIB. */
const NOW = Date.UTC(2026, 10, 5, 3);
const BERAS = "Beras Pandan Wangi 5 kg";

const sell = async (body: Record<string, unknown> = cashSale()) => {
  const res = await post("/api/sales", body);
  if (res.status !== 201) throw new Error(`jual gagal ${res.status}`);
  return json<Sale>(res);
};
const ownerVoid = (id: string, body: unknown = { reason: "salah input" }) =>
  post(`/api/owner/sales/${id}/void`, body);
const list = async (query = "") =>
  json<OwnerSaleRow[]>(await get(`/api/owner/sales${query}`));
const detail = async (id: string) =>
  json<OwnerSale>(await get(`/api/owner/sales/${id}`));
const nextShift = async () => {
  await post("/api/shifts/current/close", { countedCash: 0 });
  await loginWithShift();
};
const stored = (id: string) => mockDb.get().sales.find((s) => s.id === id);
const stockOf = (name: string) =>
  mockDb.get().stock[unitOf(name).productId] ?? Number.NaN;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

describe("listOwnerSales & getOwnerSale", () => {
  test("list per tanggal WIB + q nomor struk; shiftOpen benar; 401 tanpa sesi pemilik; 422 tanggal salah", async () => {
    await loginWithShift();
    expect((await get("/api/owner/sales")).status).toBe(401);
    const open = await sell({
      ...cashSale(),
      payments: [
        { method: "cash", amount: 20_000 },
        { method: "credit", amount: 16_000 },
      ],
      cashReceived: 20_000,
      customerId: customerId("Bu Sari"),
    });
    await ownerLogin();
    const today = await list();
    expect(today.map((r) => r.id)).toEqual([open.id]);
    expect(today[0]).toEqual({
      id: open.id,
      number: "20261105-0001",
      createdAt: NOW,
      kasirName: "Rina",
      total: 36_000,
      methodLabel: "Campuran",
      status: "selesai",
      shiftOpen: true,
    });
    // Riwayat seed: kemarin (4 Nov), semua shift sudah tutup, terbaru dulu.
    const yesterday = await list("?date=2026-11-04");
    expect(yesterday.length).toBeGreaterThanOrEqual(40);
    expect(yesterday.every((r) => r.number.startsWith("20261104-"))).toBe(true);
    expect(yesterday.every((r) => !r.shiftOpen)).toBe(true);
    const ats = yesterday.map((r) => r.createdAt);
    expect(ats).toEqual([...ats].sort((a, b) => b - a));
    const found = await list("?date=2026-11-04&q=0003");
    expect(found.map((r) => r.number)).toEqual(["20261104-0003"]);
    expect(await list("?date=2026-11-04&q=20261105")).toEqual([]);
    // (fix 1) kontrak: q maksimal 20 karakter.
    const longQ = await get(`/api/owner/sales?q=${"1".repeat(21)}`);
    expect(longQ.status).toBe(422);
    expect((await json<Problem>(longQ)).code).toBe("VALIDATION");
    expect((await get(`/api/owner/sales?q=${"1".repeat(20)}`)).status).toBe(
      200,
    );
    for (const bad of ["2026-13-01", "kemarin", "2026-11-31"]) {
      const res = await get(`/api/owner/sales?date=${bad}`);
      expect(res.status, bad).toBe(422);
      expect((await json<Problem>(res)).code).toBe("VALIDATION");
    }
    expect((await get("/api/owner/sales/tidak-ada")).status).toBe(404);
  });

  test("(cek ulang) detail penjualan yang dibatalkan KASIR → voided {at: jam server, byId: Rina, byName: 'Rina', reason, channel: 'kasir'}; penjualan aktif → voided null", async () => {
    await loginWithShift();
    const active = await sell();
    const voided = await sell();
    vi.setSystemTime(NOW + 120_000);
    await voidSale(voided.id, { reason: "pelanggan batal" });
    await ownerLogin();
    expect(await detail(voided.id)).toMatchObject({
      id: voided.id,
      status: "dibatalkan",
      customerName: null,
      shiftOpen: true,
      voided: {
        at: NOW + 120_000,
        byId: userId("Rina"),
        byName: "Rina",
        reason: "pelanggan batal",
        channel: "kasir",
        drawerRefund: 0,
        qrisRefundSource: null,
      },
      creditOverLimit: null,
    });
    const body = await detail(active.id);
    expect(body).toMatchObject({ voided: null, status: "selesai" });
    expect(body).not.toHaveProperty("costTotal");
  });
});

test("(fix 1) rekaman batal tanpa pembatal/jalur tidak dilabeli diam-diam: detail → 500, bukan channel 'kasir'", async () => {
  await loginWithShift();
  const sale = await sell();
  mockDb.update((s) => {
    const x = s.sales.find((y) => y.id === sale.id);
    if (x) {
      x.status = "dibatalkan";
      x.voidedAt = NOW;
    }
  });
  await ownerLogin();
  const res = await get(`/api/owner/sales/${sale.id}`);
  expect(res.status).toBe(500);
});

describe("voidOwnerSale (jawaban pemilik Q1: laci tidak pernah dikoreksi)", () => {
  test("void pemilik penjualan shift tutup: stok kembali, kasbon −kredit (saleId), cashSales shift tutup & shift buka tidak berubah, stored voided* channel pemilik + voidedById pemilik; detail memuat voided", async () => {
    await loginWithShift();
    const before = stockOf(BIMOLI);
    const sari = customerBalance("Bu Sari") ?? 0;
    const sale = await sell({
      ...cashSale(),
      payments: [
        { method: "cash", amount: 20_000 },
        { method: "credit", amount: 16_000 },
      ],
      cashReceived: 20_000,
      customerId: customerId("Bu Sari"),
    });
    await nextShift();
    await sell();
    const closed = mockDb.get().closedShifts;
    const shift = mockDb.get().shift;
    await ownerLogin();
    vi.setSystemTime(NOW + 60_000);
    const res = await ownerVoid(sale.id, { reason: " barang rusak " });
    expect(res.status).toBe(200);
    const after = mockDb.get();
    expect(stockOf(BIMOLI)).toBe(before - 1);
    expect(customerBalance("Bu Sari")).toBe(sari);
    expect(after.creditLedger.at(-1)).toMatchObject({
      amount: -16_000,
      saleId: sale.id,
      at: NOW + 60_000,
    });
    expect(after.closedShifts).toEqual(closed);
    expect(after.shift).toEqual(shift);
    expect(stored(sale.id)).toMatchObject({
      status: "dibatalkan",
      voidedAt: NOW + 60_000,
      voidedById: userId("Pak Ahmad"),
      voidedByName: "Pak Ahmad",
      voidReason: "barang rusak",
      voidChannel: "pemilik",
      voidRefund: { cash: 20_000, qris: 0, qrisSource: null, drawer: 0 },
    });
    expect(await json<OwnerSale>(res)).toMatchObject({
      shiftOpen: false,
      customerName: "Bu Sari",
      voided: {
        at: NOW + 60_000,
        byId: userId("Pak Ahmad"),
        byName: "Pak Ahmad",
        reason: "barang rusak",
        channel: "pemilik",
        drawerRefund: 0,
        qrisRefundSource: null,
      },
    });
    expect((await detail(sale.id)).voided?.channel).toBe("pemilik");
    // Pembatalan oleh pemilik bukan pengecualian kasir.
    expect(cashierExceptions(mockDb.get(), "batal_transaksi")).toEqual([]);
  });

  test("void pemilik penjualan shift buka → 409 IN_OPEN_SHIFT; alasan kosong → 422; void ulang → 200", async () => {
    await loginWithShift();
    const open = await sell();
    await ownerLogin();
    const inOpen = await ownerVoid(open.id);
    expect(inOpen.status).toBe(409);
    expect(await json<Problem>(inOpen)).toMatchObject({
      code: "IN_OPEN_SHIFT",
      detail: "Masih di shift yang buka — batalkan dari kasir",
    });
    expect(stored(open.id)?.status).toBe("selesai");
    await post("/api/shifts/current/close", { countedCash: 0 });
    for (const reason of ["", "   ", undefined]) {
      expect((await ownerVoid(open.id, { reason })).status).toBe(422);
    }
    expect((await ownerVoid(open.id)).status).toBe(200);
    const again = await ownerVoid(open.id, { reason: "lagi" });
    expect(again.status).toBe(200);
    expect(stored(open.id)?.voidReason).toBe("salah input");
    expect((await ownerVoid("tidak-ada")).status).toBe(404);
  });

  test("tanpa sesi pemilik → 401 (sesi kasir tidak cukup)", async () => {
    await loginWithShift();
    const sale = await sell();
    expect((await ownerVoid(sale.id)).status).toBe(401);
    expect((await get(`/api/owner/sales/${sale.id}`)).status).toBe(401);
  });

  test("(jawaban pemilik Q8) void pemilik kasbon 100.000 yang sudah dicicil 60.000 → saldo −60.000, pelunasan tetap aktif; void 40 hari lalu boleh (tanpa batas umur), tanpa baris laci", async () => {
    const dewi = customerId("Mbak Dewi");
    vi.setSystemTime(NOW - 40 * DAY_MS);
    await loginWithShift();
    const kasbon = await sell({
      saleId: newId(),
      items: [saleItem(BERAS, { qtyBase: 2 }, 78_000)],
      payments: [
        { method: "cash", amount: 56_000 },
        { method: "credit", amount: 100_000 },
      ],
      cashReceived: 56_000,
      customerId: dewi,
      print: false,
    });
    expect(
      (
        await post("/api/credit-payments", {
          id: "cicil-q8",
          customerId: dewi,
          amount: 60_000,
          method: "tunai",
          cashReceived: 60_000,
          print: false,
        })
      ).status,
    ).toBe(201);
    await post("/api/shifts/current/close", { countedCash: 0 });
    vi.setSystemTime(NOW);
    await loginWithShift();
    await ownerLogin();
    const res = await ownerVoid(kasbon.id, { reason: "salah catat" });
    expect(res.status).toBe(200);
    expect(customerBalance("Mbak Dewi")).toBe(-60_000);
    const payment = mockDb
      .get()
      .creditPayments.find((p) => p.id === "cicil-q8");
    expect(payment?.cancelledAt).toBeNull();
    expect(mockDb.get().shift?.saleRefunds).toEqual([]);
    expect(stored(kasbon.id)?.voidRefund?.drawer).toBe(0);
  });
});
