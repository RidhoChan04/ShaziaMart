import { beforeEach, describe, expect, test, vi } from "vitest";
import type {
  CreditLimitProblem,
  KasirLookupSale,
  Problem,
  Sale,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { newId } from "@/shared/lib/id";
import { mockDb } from "../db";
import { cashierExceptions } from "../exceptions";
import {
  cashSale,
  customerBalance,
  customerId,
  deepKeys,
  FORBIDDEN_KASIR_KEYS,
  get,
  json,
  login,
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
const GULA = "Gula Pasir";
const BERAS = "Beras Pandan Wangi 5 kg";

/** Jam dinding WIB → epoch UTC. */
const wib = (y: number, m: number, d: number, h: number, min = 0) =>
  Date.UTC(y, m - 1, d, h - 7, min);

type Pay = { method: "cash" | "qris" | "credit"; amount: number };

/** Gula curah per nominal = total persis; pembayaran bebas (tunai butuh `cashReceived`). */
const gulaSale = (
  payments: Pay[],
  extra: Record<string, unknown> = {},
): Record<string, unknown> => ({
  saleId: newId(),
  items: [
    saleItem(
      GULA,
      { amount: payments.reduce((a, p) => a + p.amount, 0) },
      18000,
    ),
  ],
  payments,
  print: false,
  ...extra,
});

/** Campuran contoh brief: tunai 30.000 (diterima 50.000) + QRIS 20.000 + kasbon 10.000 Bu Sari. */
const MIXED: Pay[] = [
  { method: "cash", amount: 30_000 },
  { method: "qris", amount: 20_000 },
  { method: "credit", amount: 10_000 },
];
const mixedSale = () =>
  gulaSale(MIXED, { cashReceived: 50_000, customerId: customerId("Bu Sari") });
const cashQrisSale = () =>
  gulaSale(MIXED.slice(0, 2), { cashReceived: 50_000 });
const qrisSale = () => gulaSale([{ method: "qris", amount: 20_000 }]);

const sell = async (body: Record<string, unknown>) => {
  const res = await post("/api/sales", body);
  if (res.status !== 201) throw new Error(`jual gagal ${res.status}`);
  return json<Sale>(res);
};
const closeShift = () => post("/api/shifts/current/close", { countedCash: 0 });
/** Tutup shift A lalu buka shift B (Rina lagi). */
const nextShift = async () => {
  await closeShift();
  await loginWithShift();
};
const stored = (id: string) => mockDb.get().sales.find((s) => s.id === id);
const shift = () => mockDb.get().shift;
const refunds = () => (shift()?.saleRefunds ?? []).map((r) => r.amount);
const code = async (res: Response) => (await json<Problem>(res)).code;
const stockOf = (name: string) =>
  mockDb.get().stock[unitOf(name).productId] ?? Number.NaN;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
});

describe("voidSale kasir tanpa PIN (ruling R4/R5)", () => {
  test("void kasir tanpa PIN: alasan kosong → 422; benar → 200, stored {voidedAt: jam server, voidedById: Rina, voidedByName: 'Rina', voidReason, voidChannel: 'kasir'}", async () => {
    await loginWithShift();
    const sale = await sell(cashSale(2));
    for (const reason of [" ", "", undefined, "x".repeat(201)]) {
      const res = await voidSale(sale.id, { reason });
      expect(res.status).toBe(422);
      expect(await code(res)).toBe("VALIDATION");
    }
    expect(stored(sale.id)?.status).toBe("selesai");
    vi.setSystemTime(NOW + 60_000);
    const ok = await voidSale(sale.id, { reason: "  salah input " });
    expect(ok.status).toBe(200);
    expect((await json<Sale>(ok)).status).toBe("dibatalkan");
    expect(stored(sale.id)).toMatchObject({
      status: "dibatalkan",
      voidedAt: NOW + 60_000,
      voidedById: userId("Rina"),
      voidedByName: "Rina",
      voidReason: "salah input",
      voidChannel: "kasir",
      voidRefund: { cash: 72_000, qris: 0, qrisSource: null, drawer: 0 },
    });
    expect(shift()).toMatchObject({ cashSales: 0, salesCount: 0 });
    expect(refunds()).toEqual([]);
  });

  test("(cek ulang) body lama {ownerPin: '000000', reason} → 200 (ownerPin diabaikan, tidak ada jalur PIN); respons kasir tanpa voidReason/voidedById/voidedByName/voidChannel/creditOverLimit/costTotal", async () => {
    await loginWithShift();
    const sale = await sell(cashSale());
    const res = await voidSale(sale.id, {
      ownerPin: "000000",
      reason: "salah input",
    });
    expect(res.status).toBe(200);
    const keys = deepKeys(await res.json());
    for (const key of [
      ...FORBIDDEN_KASIR_KEYS,
      "voidedAt",
      "voidedById",
      "voidedByName",
      "voidChannel",
      "voidRefund",
    ]) {
      expect(keys, key).not.toContain(key);
    }
    expect(keys).toContain("shiftId");
  });

  test("void tanpa sesi → 401; saleId tak dikenal → 404 (sebelum alasan)", async () => {
    expect((await voidSale("x", { reason: "x" })).status).toBe(401);
    await loginWithShift();
    expect((await voidSale("x", { reason: "" })).status).toBe(404);
  });
});

describe("(koreksi mockup M1) pengembalian QRIS", () => {
  test("kasir void berbagian QRIS tanpa qrisRefundSource → 422 'Pilih cara mengembalikan QRIS' tanpa perubahan; tanpa bagian QRIS → nilai diabaikan; void pemilik → drawerRefund 0, qrisRefundSource pemilik", async () => {
    await loginWithShift();
    const qris = await sell(qrisSale());
    const before = mockDb.get();
    for (const source of [undefined, null, "transfer"]) {
      const res = await voidSale(qris.id, {
        reason: "batal",
        qrisRefundSource: source,
      });
      expect(res.status).toBe(422);
      expect(await json<Problem>(res)).toMatchObject({
        code: "VALIDATION",
        detail: "Pilih cara mengembalikan QRIS",
      });
    }
    expect(mockDb.get().sales).toEqual(before.sales);
    expect(mockDb.get().shift).toEqual(before.shift);

    const cash = await sell(cashSale());
    expect(
      (await voidSale(cash.id, { reason: "x", qrisRefundSource: "laci" }))
        .status,
    ).toBe(200);
    expect(stored(cash.id)?.voidRefund).toEqual({
      cash: 36_000,
      qris: 0,
      qrisSource: null,
      drawer: 0,
    });
    expect(refunds()).toEqual([]);

    await nextShift();
    await ownerLogin();
    const owner = await post(`/api/owner/sales/${qris.id}/void`, {
      reason: "dari pemilik",
    });
    expect(owner.status).toBe(200);
    expect(stored(qris.id)?.voidRefund).toEqual({
      cash: 0,
      qris: 20_000,
      qrisSource: "pemilik",
      drawer: 0,
    });
  });

  test("(cek ulang M1) shift ini campuran tunai 30.000 (diterima 50.000) + QRIS 20.000 + laci → B.cashSales −30.000, B.saleRefunds [{20.000}] (bukan 50.000), drawer 20.000; pemilik → B.cashSales −30.000, saleRefunds []", async () => {
    await loginWithShift();
    const laci = await sell(cashQrisSale());
    const pemilik = await sell(cashQrisSale());
    expect(shift()).toMatchObject({ cashSales: 60_000, salesCount: 2 });
    await voidSale(laci.id, { reason: "batal", qrisRefundSource: "laci" });
    expect(shift()).toMatchObject({ cashSales: 30_000, salesCount: 1 });
    expect(refunds()).toEqual([20_000]);
    expect(shift()?.saleRefunds[0]).toMatchObject({
      saleId: laci.id,
      at: NOW,
    });
    expect(stored(laci.id)?.voidRefund).toEqual({
      cash: 30_000,
      qris: 20_000,
      qrisSource: "laci",
      drawer: 20_000,
    });
    await voidSale(pemilik.id, {
      reason: "batal",
      qrisRefundSource: "pemilik",
    });
    expect(shift()).toMatchObject({ cashSales: 0, salesCount: 0 });
    expect(refunds()).toEqual([20_000]);
    expect(stored(pemilik.id)?.voidRefund).toMatchObject({ drawer: 0 });
  });

  test("(koreksi mockup M1) shift ini QRIS-saja 20.000 + laci → B.saleRefunds [{20.000}], cashSales tetap & salesCount turun, drawer 20.000; pemilik → tanpa baris", async () => {
    await loginWithShift();
    const laci = await sell(qrisSale());
    const pemilik = await sell(qrisSale());
    await voidSale(laci.id, { reason: "batal", qrisRefundSource: "laci" });
    expect(shift()).toMatchObject({ cashSales: 0, salesCount: 1 });
    expect(refunds()).toEqual([20_000]);
    expect(stored(laci.id)?.voidRefund?.drawer).toBe(20_000);
    await voidSale(pemilik.id, {
      reason: "batal",
      qrisRefundSource: "pemilik",
    });
    expect(shift()).toMatchObject({ cashSales: 0, salesCount: 0 });
    expect(refunds()).toEqual([20_000]);
  });

  test("(cek ulang M1) void pemilik shift tutup QRIS 20.000 dengan body qrisRefundSource 'laci' → shift buka saleRefunds [] & cashSales tetap, voidRefund {0, 20.000, pemilik, drawer 0}; void kasir ulang dengan sumber lain → 200 rekaman asli, saleRefunds tetap", async () => {
    await loginWithShift();
    const byOwner = await sell(qrisSale());
    const byKasir = await sell(qrisSale());
    await nextShift();
    await sell(cashSale());
    await ownerLogin();
    const res = await post(`/api/owner/sales/${byOwner.id}/void`, {
      reason: "pemilik",
      qrisRefundSource: "laci",
    });
    expect(res.status).toBe(200);
    expect(shift()).toMatchObject({ cashSales: 36_000, salesCount: 1 });
    expect(refunds()).toEqual([]);
    expect(stored(byOwner.id)?.voidRefund).toEqual({
      cash: 0,
      qris: 20_000,
      qrisSource: "pemilik",
      drawer: 0,
    });
    const again = await voidSale(byOwner.id, {
      reason: "kasir",
      qrisRefundSource: "laci",
    });
    expect(again.status).toBe(200);
    expect(refunds()).toEqual([]);
    expect(stored(byOwner.id)).toMatchObject({
      voidChannel: "pemilik",
      voidReason: "pemilik",
    });

    await voidSale(byKasir.id, { reason: "kasir", qrisRefundSource: "laci" });
    expect(refunds()).toEqual([20_000]);
    const replay = await voidSale(byKasir.id, {
      reason: "lagi",
      qrisRefundSource: "pemilik",
    });
    expect(replay.status).toBe(200);
    expect(refunds()).toEqual([20_000]);
    expect(stored(byKasir.id)?.voidRefund).toMatchObject({
      qrisSource: "laci",
      drawer: 20_000,
    });
  });
});

describe("(ruling R12) void kasir transaksi shift lama ≤ 7 hari", () => {
  test("void kasir penjualan shift A (ditutup) saat shift B buka: campuran tunai 30.000 (diterima 50.000, kembalian 20.000) + QRIS 20.000 + kasbon 10.000 → stok kembali, kasbon −10.000, B.saleRefunds [{30.000}], B.cashSales & salesCount tetap, closedShifts A tidak berubah, voidRefund {30.000, 20.000, pemilik, 30.000}", async () => {
    await loginWithShift();
    const stockBefore = stockOf(GULA);
    const sari = customerBalance("Bu Sari") ?? 0;
    const sale = await sell(mixedSale());
    expect(sale).toMatchObject({ cashReceived: 50_000, change: 20_000 });
    await nextShift();
    await sell(cashSale());
    const closedBefore = mockDb.get().closedShifts;
    const shiftBefore = shift();
    expect(customerBalance("Bu Sari")).toBe(sari + 10_000);

    const noSource = await voidSale(sale.id, { reason: "rusak" });
    expect(noSource.status).toBe(422);
    vi.setSystemTime(NOW + 3_600_000);
    const res = await voidSale(sale.id, {
      reason: "rusak",
      qrisRefundSource: "pemilik",
    });
    expect(res.status).toBe(200);
    const after = mockDb.get();
    expect(stockOf(GULA)).toBe(stockBefore);
    expect(customerBalance("Bu Sari")).toBe(sari);
    expect(after.creditLedger.at(-1)).toMatchObject({
      amount: -10_000,
      saleId: sale.id,
      at: NOW + 3_600_000,
    });
    expect(after.shift).toMatchObject({
      cashSales: shiftBefore?.cashSales,
      salesCount: shiftBefore?.salesCount,
    });
    expect(after.shift?.saleRefunds).toEqual([
      {
        id: expect.any(String),
        at: NOW + 3_600_000,
        amount: 30_000,
        saleId: sale.id,
      },
    ]);
    expect(after.closedShifts).toEqual(closedBefore);
    expect(stored(sale.id)?.voidRefund).toEqual({
      cash: 30_000,
      qris: 20_000,
      qrisSource: "pemilik",
      drawer: 30_000,
    });
  });

  test("(koreksi mockup M1) shift lama campuran tunai 30.000 + QRIS 20.000: laci → B.saleRefunds [{50.000}], voidRefund {30.000, 20.000, laci, 50.000}; pemilik → [{30.000}], drawer 30.000, pengecualian qrisToOwner 20.000", async () => {
    await loginWithShift();
    const laci = await sell(cashQrisSale());
    const pemilik = await sell(cashQrisSale());
    await nextShift();
    await voidSale(laci.id, { reason: "a", qrisRefundSource: "laci" });
    expect(refunds()).toEqual([50_000]);
    expect(stored(laci.id)?.voidRefund).toEqual({
      cash: 30_000,
      qris: 20_000,
      qrisSource: "laci",
      drawer: 50_000,
    });
    await voidSale(pemilik.id, { reason: "b", qrisRefundSource: "pemilik" });
    expect(refunds()).toEqual([50_000, 30_000]);
    expect(stored(pemilik.id)?.voidRefund?.drawer).toBe(30_000);
    const items = cashierExceptions(mockDb.get(), "batal_transaksi");
    expect(items.find((e) => e.saleId === pemilik.id)).toMatchObject({
      fromClosedShift: true,
      refund: 30_000,
      qrisToOwner: 20_000,
    });
  });

  test("(ruling R12, koreksi mockup M1) QRIS-saja 20.000 shift lama: pemilik → tanpa baris saleRefunds, voidRefund {0, 20.000, pemilik, 0}; laci → [{20.000}]; tanpa shift buka → 409 SHIFT_CLOSED; void ulang → 200 tanpa baris kedua", async () => {
    await loginWithShift();
    const pemilik = await sell(qrisSale());
    const laci = await sell(qrisSale());
    const noShift = await sell(qrisSale());
    await closeShift();
    await login("123456");
    const closed = await voidSale(noShift.id, {
      reason: "x",
      qrisRefundSource: "laci",
    });
    expect(closed.status).toBe(409);
    expect(await code(closed)).toBe("SHIFT_CLOSED");
    expect(stored(noShift.id)?.status).toBe("selesai");

    await loginWithShift();
    await voidSale(pemilik.id, { reason: "x", qrisRefundSource: "pemilik" });
    expect(refunds()).toEqual([]);
    expect(stored(pemilik.id)?.voidRefund).toEqual({
      cash: 0,
      qris: 20_000,
      qrisSource: "pemilik",
      drawer: 0,
    });
    await voidSale(laci.id, { reason: "x", qrisRefundSource: "laci" });
    expect(refunds()).toEqual([20_000]);
    const again = await voidSale(laci.id, {
      reason: "x",
      qrisRefundSource: "laci",
    });
    expect(again.status).toBe(200);
    expect(refunds()).toEqual([20_000]);
  });

  test("batas 7 hari kalender WIB (now Kamis 5 Nov 23.59 WIB): jual Kamis 29 Okt 00.00 WIB → boleh; jual Rabu 28 Okt 23.59 WIB → 409 VOID_TOO_OLD; tepi kedua: now Jumat 6 Nov 00.00 → jual 29 Okt 00.00 → 409", async () => {
    vi.setSystemTime(wib(2026, 10, 28, 23, 59));
    await loginWithShift();
    const old = await sell(cashSale());
    vi.setSystemTime(wib(2026, 10, 29, 0));
    const edge = await sell(cashSale());
    const edge2 = await sell(cashSale());
    await closeShift();

    vi.setSystemTime(wib(2026, 11, 5, 23, 59));
    await loginWithShift();
    const tooOld = await voidSale(old.id, { reason: "x" });
    expect(tooOld.status).toBe(409);
    expect(await json<Problem>(tooOld)).toMatchObject({
      code: "VOID_TOO_OLD",
      detail: "Transaksi lebih dari 7 hari — batalkan dari app pemilik",
    });
    expect(stored(old.id)?.status).toBe("selesai");
    expect((await voidSale(edge.id, { reason: "x" })).status).toBe(200);
    expect(refunds()).toEqual([36_000]);

    vi.setSystemTime(wib(2026, 11, 6, 0));
    const late = await voidSale(edge2.id, { reason: "x" });
    expect(late.status).toBe(409);
    expect(await code(late)).toBe("VOID_TOO_OLD");
    expect(refunds()).toEqual([36_000]);
  });

  // Angka brief "saldo −40.000 … kasbon 550.000" tidak cocok dengan 100.000 − 60.000 − 100.000; saldo = Σ buku = −60.000,
  // jadi kasbon 570.000 dipakai agar excess tetap 10.000 (= saldo + kasbon − limit).
  test("(cek ulang 2, Q8) void kasir shift lama berkasbon 100.000 yang sudah dicicil 60.000 → saldo −60.000, pelunasan tetap aktif; lalu kasbon 570.000 (limit 500.000) → 409 CREDIT_LIMIT, dengan alasan excess = 10.000 (= saldo + kasbon − limit)", async () => {
    const dewi = customerId("Mbak Dewi");
    expect(customerBalance("Mbak Dewi")).toBe(0);
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
    const paid = await post("/api/credit-payments", {
      id: "cicil-1",
      customerId: dewi,
      amount: 60_000,
      method: "tunai",
      cashReceived: 60_000,
      print: false,
    });
    expect(paid.status).toBe(201);
    await nextShift();
    const res = await voidSale(kasbon.id, { reason: "barang rusak" });
    expect(res.status).toBe(200);
    expect(customerBalance("Mbak Dewi")).toBe(-60_000);
    expect(
      mockDb.get().creditPayments.find((p) => p.id === "cicil-1")?.cancelledAt,
    ).toBeNull();
    expect(refunds()).toEqual([56_000]);

    const big = {
      saleId: newId(),
      items: [saleItem(BERAS, { qtyBase: 8 }, 78_000)],
      payments: [
        { method: "cash", amount: 54_000 },
        { method: "credit", amount: 570_000 },
      ],
      cashReceived: 54_000,
      customerId: dewi,
      print: false,
    };
    const blocked = await post("/api/sales", big);
    expect(blocked.status).toBe(409);
    expect(await json<CreditLimitProblem>(blocked)).toMatchObject({
      code: "CREDIT_LIMIT",
      balance: -60_000,
      creditLimit: 500_000,
      attempted: 570_000,
      excess: 10_000,
    });
    const ok = await post("/api/sales", {
      ...big,
      creditLimitReason: "hajatan",
    });
    expect(ok.status).toBe(201);
    expect(stored(big.saleId)?.creditOverLimit).toEqual({
      excess: 10_000,
      reason: "hajatan",
    });
    expect(customerBalance("Mbak Dewi")).toBe(510_000);
  });
});

describe("(jawaban pemilik J0, ruling R12) listShiftSales & lookupSales", () => {
  test("listShiftSales hanya shift buka (shift lewat tengah malam: jual 23.50 & 00.10 keduanya tampil; jual shift Rina pagi tidak tampil di shift Budi); tanpa shift → []; tanpa sesi → 401", async () => {
    expect((await get("/api/sales/shift")).status).toBe(401);
    vi.setSystemTime(wib(2026, 11, 4, 9));
    await loginWithShift();
    const morning = await sell(cashSale());
    await closeShift();
    await login("654321", "Budi");
    expect(await json<Sale[]>(await get("/api/sales/shift"))).toEqual([]);
    vi.setSystemTime(wib(2026, 11, 4, 13));
    expect((await post("/api/shifts", { openingCash: 0 })).status).toBe(201);
    vi.setSystemTime(wib(2026, 11, 4, 23, 50));
    const late = await sell(cashSale());
    vi.setSystemTime(wib(2026, 11, 5, 0, 10));
    const afterMidnight = await sell(cashSale());
    const rows = await json<Sale[]>(await get("/api/sales/shift"));
    expect(rows.map((s) => s.id)).toEqual([afterMidnight.id, late.id]);
    expect(rows.map((s) => s.id)).not.toContain(morning.id);
    expect(rows[0]?.shiftId).toBe(shift()?.id);
    const keys = deepKeys(rows);
    for (const key of FORBIDDEN_KASIR_KEYS) expect(keys).not.toContain(key);
  });

  test("lookupSales atas riwayat seed (now 5 Nov): maksimal 20, terbaru dulu, 28 Okt (8 hari) tidak ada, 29 Okt ada; customerName null tanpa pelanggan", async () => {
    await loginWithShift();
    const recent = await json<KasirLookupSale[]>(
      await get("/api/sales/lookup?q=2026110"),
    );
    expect(recent).toHaveLength(20);
    expect(recent.every((r) => r.number.startsWith("2026110"))).toBe(true);
    const ats = recent.map((r) => r.createdAt);
    expect(ats).toEqual([...ats].sort((a, b) => b - a));
    expect(recent[0]?.number.startsWith("20261104")).toBe(true);
    expect(recent.find((r) => r.customerId === null)?.customerName).toBeNull();
    expect(
      await json<KasirLookupSale[]>(await get("/api/sales/lookup?q=20261028")),
    ).toEqual([]);
    expect(
      (
        await json<KasirLookupSale[]>(
          await get("/api/sales/lookup?q=20261029-0001"),
        )
      ).map((r) => r.number),
    ).toEqual(["20261029-0001"]);
  });

  test("lookupSales q='0145' → shift lain ≤ 7 hari saja, tidak memuat shift buka; item membawa customerName (null bila tanpa pelanggan), key lain = allowlist kasir; q kosong → 422; tanpa shift → 409", async () => {
    // 8 hari lalu (ditolak), 4 Nov (boleh), lalu shift buka 5 Nov dengan nomor yang juga cocok.
    const at = async (ms: number) => {
      vi.setSystemTime(ms);
      mockDb.update((s) => {
        const key = new Intl.DateTimeFormat("en-CA", {
          timeZone: "Asia/Jakarta",
        })
          .format(ms)
          .replaceAll("-", "");
        s.saleSeq[key] = 144;
      });
    };
    await at(wib(2026, 10, 28, 10));
    await loginWithShift();
    const tooOld = await sell(cashSale());
    await at(wib(2026, 11, 4, 10));
    const withCustomer = await sell({
      ...cashSale(),
      payments: [
        { method: "cash", amount: 26_000 },
        { method: "credit", amount: 10_000 },
      ],
      cashReceived: 26_000,
      customerId: customerId("Bu Sari"),
    });
    await closeShift();
    await at(wib(2026, 11, 5, 10));
    await loginWithShift();
    const open = await sell(cashSale());
    expect([tooOld.number, withCustomer.number, open.number]).toEqual([
      "20261028-0145",
      "20261104-0145",
      "20261105-0145",
    ]);
    const res = await get("/api/sales/lookup?q=0145");
    expect(res.status).toBe(200);
    const rows = await json<KasirLookupSale[]>(res);
    expect(rows.map((r) => r.id)).toEqual([withCustomer.id]);
    expect(rows[0]).toMatchObject({ customerName: "Bu Sari" });
    expect(Object.keys(rows[0] ?? {}).sort()).toEqual(
      [
        "id",
        "number",
        "createdAt",
        "kasirName",
        "shiftId",
        "items",
        "total",
        "payments",
        "cashReceived",
        "change",
        "customerId",
        "status",
        "printStatus",
        "customerName",
      ].sort(),
    );
    for (const q of ["", "abc", "1".repeat(21)]) {
      expect((await get(`/api/sales/lookup?q=${q}`)).status).toBe(422);
    }
    expect((await get("/api/sales/lookup")).status).toBe(422);
    await closeShift();
    await login("123456");
    const closed = await get("/api/sales/lookup?q=0145");
    expect(closed.status).toBe(409);
    expect(await code(closed)).toBe("SHIFT_CLOSED");
  });
});
