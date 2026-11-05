import { beforeEach, describe, expect, test, vi } from "vitest";
import type {
  OpnameScope,
  OwnerOpnameRow,
  OwnerOpnameSession,
  OwnerTodaySummary,
  StaffOpnameSession,
  StockMovement,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  ApproveOpnameItemResponse,
  GetOwnerOpnameSessionResponse,
  ListOwnerOpnameSessionsResponse,
  RecountOpnameItemResponse,
  ReviewOpnameSessionResponse,
} from "@/shared/api/gen/zod/owner/owner";
import { newId } from "@/shared/lib/id";
import { type MockProduct, mockDb } from "../db";
import {
  BIMOLI,
  get,
  json,
  loginWithShift,
  ownerLogin,
  post,
  receiptInput,
  saleItem,
  staffLogin,
} from "./test-helpers";

const INDOMIE = "Indomie Goreng";
const KOPI = "Kopi Kapal Api 165 g";
const BERAS5 = "Beras Pandan Wangi 5 kg";
const STAFF = "/api/staff/opname-sessions";
const OWNER = "/api/owner/opname-sessions";
// 5 Nov 2026, jam WIB "HH.MM" → epoch ms UTC.
const T = (hm: string): number => {
  const [h = 0, m = 0] = hm.split(".").map(Number);
  return Date.UTC(2026, 10, 5, h - 7, m);
};
const MI_INSTAN: OpnameScope = { kind: "kategori", category: "Mi Instan" };

const productOf = (name: string): MockProduct => {
  const p = mockDb.get().products.find((x) => x.name === name);
  if (!p) throw new Error(`seed tanpa ${name}`);
  return p;
};
const idOf = (name: string) => productOf(name).id;
const stockOf = (name: string) => mockDb.get().stock[idOf(name)];
function updateProduct(name: string, fn: (p: MockProduct) => void): void {
  mockDb.update((s) => {
    const p = s.products.find((x) => x.name === name);
    if (!p) throw new Error(`seed tanpa ${name}`);
    fn(p);
  });
}
function setStock(name: string, qty: number): void {
  const id = idOf(name);
  mockDb.update((s) => {
    s.stock[id] = qty;
  });
}
const setCost = (name: string, amount: number) =>
  updateProduct(name, (p) => {
    p.cost = { amount, qtyBase: 1 };
  });
const at = (hm: string) => vi.setSystemTime(T(hm));

const count = (name: string, qtyBase: number, hm = "10.00") => ({
  productId: idOf(name),
  qtyBase,
  countedAt: T(hm),
});
type Count = ReturnType<typeof count>;
async function submit(id: string, items: Count[]): Promise<void> {
  const res = await post(STAFF, {
    id,
    scope: MI_INSTAN,
    deviceNow: Date.now(),
    items,
  });
  expect(res.status).toBe(201);
}
async function finish(id: string, reasons: [string, string][]): Promise<void> {
  const res = await post(`${STAFF}/${id}/finish`, {
    reasons: reasons.map(([name, reason]) => ({
      productId: idOf(name),
      reason,
      receiptId: null,
    })),
  });
  expect(res.status).toBe(200);
}
async function switchStaff(name: string, pin: string): Promise<void> {
  await post("/api/staff/logout", {});
  expect((await staffLogin(name, pin)).status).toBe(200);
}

const approve = (sessionId: string, name: string) =>
  post(`${OWNER}/${sessionId}/items/${idOf(name)}/approve`, {});
const recount = (sessionId: string, name: string, body: unknown) =>
  post(`${OWNER}/${sessionId}/items/${idOf(name)}/recount`, body);
const review = (sessionId: string) => post(`${OWNER}/${sessionId}/review`, {});
async function detail(sessionId: string): Promise<OwnerOpnameSession> {
  const res = await get(`${OWNER}/${sessionId}`);
  expect(res.status).toBe(200);
  return GetOwnerOpnameSessionResponse.parse(await res.json());
}
async function rows(): Promise<OwnerOpnameRow[]> {
  const res = await get(OWNER);
  expect(res.status).toBe(200);
  return ListOwnerOpnameSessionsResponse.parse(await res.json());
}
const itemOf = (s: OwnerOpnameSession, name: string) => {
  const item = s.items.find((i) => i.productName === name);
  if (!item) throw new Error(`${name} tidak ada di sesi`);
  return item;
};
const codeOf = async (res: Response) =>
  (await json<{ code: string }>(res)).code;
const opnameEntries = () =>
  mockDb.get().stockEntries.filter((e) => e.kind === "opname");
/** Data tanpa sesi login: untuk membandingkan "tidak ada yang berubah". */
const dataOf = () => {
  const {
    staffSession: _a,
    session: _b,
    ownerSession: _c,
    ...rest
  } = mockDb.get();
  return rest;
};
async function attention() {
  const res = await get("/api/owner/summary/today");
  expect(res.status).toBe(200);
  const { opnameHeldCount, opnameFlags, opnameReplacedHeld } = (
    await json<OwnerTodaySummary>(res)
  ).attention;
  return { opnameHeldCount, opnameFlags, opnameReplacedHeld };
}
/** Indomie dihitung 20 dari 60 pukul 10.00 → −40 (Rp104.000) ditahan di sesi `id`. */
async function heldIndomie(id = "A"): Promise<void> {
  await submit(id, [count(INDOMIE, 20)]);
  at("10.05");
  await finish(id, [[INDOMIE, "hilang"]]);
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  at("09.00");
  expect((await staffLogin()).status).toBe(200);
  expect((await ownerLogin()).status).toBe(200);
  setStock(INDOMIE, 60);
  setStock(BIMOLI, 10);
  setStock(KOPI, 10);
  setStock(BERAS5, 10);
  at("10.00");
});

describe("setujui", () => {
  test("setujui setelah stok bergerak: koreksi = selisih asli (−40), sekali; setujui lagi → 409 OPNAME_NOT_HELD", async () => {
    await heldIndomie();
    at("10.30");
    setStock(INDOMIE, 55);
    at("11.00");
    const res = await approve("A", INDOMIE);
    expect(res.status).toBe(200);
    const body = ApproveOpnameItemResponse.parse(await res.json());
    expect(itemOf(body, INDOMIE)).toMatchObject({
      state: "disetujui",
      diffQtyBase: -40,
      value: 104_000,
      reason: "hilang",
      resolvedByName: "Pak Ahmad",
      resolvedAt: T("11.00"),
      recount: null,
    });
    expect(stockOf(INDOMIE)).toBe(15);
    expect(opnameEntries()).toEqual([
      {
        id: expect.any(String),
        productId: idOf(INDOMIE),
        at: T("11.00"),
        effectiveAt: T("10.00"),
        qtyBase: -40,
        actorName: "Pak Ahmad",
        kind: "opname",
        receiptId: null,
        lineId: null,
        opnameId: "A",
        reason: "hilang",
      },
    ]);

    const before = dataOf();
    at("11.05");
    const again = await approve("A", INDOMIE);
    expect(again.status).toBe(409);
    expect(await codeOf(again)).toBe("OPNAME_NOT_HELD");
    expect(dataOf()).toEqual(before);
    expect(stockOf(INDOMIE)).toBe(15);
  });

  test("K7/C1: setujui pukul 11.00 untuk hitungan 10.00 (effectiveAt 10.00); sesi B hitung 10.30 dikirim 11.30 → sistem B sudah memuat koreksi, tanpa hitung ganda", async () => {
    await loginWithShift(200_000);
    await heldIndomie();
    at("10.45");
    const sale = await post("/api/sales", {
      saleId: newId(),
      items: [saleItem(INDOMIE, { qtyBase: 3 }, 3100)],
      payments: [{ method: "cash", amount: 9300 }],
      cashReceived: 9300,
      print: false,
    });
    expect(sale.status).toBe(201);
    expect(stockOf(INDOMIE)).toBe(57);
    at("11.00");
    expect((await approve("A", INDOMIE)).status).toBe(200);
    expect(stockOf(INDOMIE)).toBe(17);

    await switchStaff("Budi", "654321");
    at("11.30");
    const res = await post(STAFF, {
      id: "B",
      scope: MI_INSTAN,
      deviceNow: Date.now(),
      items: [count(INDOMIE, 20, "10.30")],
    });
    const b = await json<StaffOpnameSession>(res);
    expect(b.items[0]).toMatchObject({
      systemQtyBase: 20,
      diffQtyBase: 0,
      state: "cocok",
    });
    expect(b.status).toBe("selesai");
    expect(stockOf(INDOMIE)).toBe(17);
    expect(opnameEntries()).toHaveLength(1);
  });
});

describe("hitung ulang", () => {
  test("hitung ulang pemilik: stok 50, hitung 48 → koreksi −2 sekarang, state dihitung_ulang, recount.value 5200", async () => {
    await heldIndomie();
    setStock(INDOMIE, 50);
    at("11.00");
    const res = await recount("A", INDOMIE, { qtyBase: 48 });
    expect(res.status).toBe(200);
    const body = RecountOpnameItemResponse.parse(await res.json());
    expect(itemOf(body, INDOMIE)).toMatchObject({
      state: "dihitung_ulang",
      diffQtyBase: -40,
      value: 104_000,
      resolvedByName: "Pak Ahmad",
      resolvedAt: T("11.00"),
      recount: {
        countedQtyBase: 48,
        countedAt: T("11.00"),
        systemQtyBase: 50,
        diffQtyBase: -2,
        value: 5200,
      },
    });
    expect(body).toMatchObject({ lossValue: 5200, gainValue: 0 });
    expect(stockOf(INDOMIE)).toBe(48);
    expect(opnameEntries()).toEqual([
      expect.objectContaining({
        at: T("11.00"),
        effectiveAt: T("11.00"),
        qtyBase: -2,
        actorName: "Pak Ahmad",
        opnameId: "A",
        reason: "hilang",
      }),
    ]);

    // K5: hitungan staf 10.30 kalah dari hitung ulang 11.00.
    at("11.30");
    await submit("B", [count(INDOMIE, 40, "10.30")]);
    const b = mockDb.get().opnameSessions.find((s) => s.id === "B");
    expect(b?.items[0]).toMatchObject({
      state: "diganti",
      replacedBySessionId: "A",
    });
    expect(stockOf(INDOMIE)).toBe(48);
  });

  test("hitung ulang hitungan sama dengan stok → tanpa entri ledger", async () => {
    await heldIndomie();
    at("11.00");
    const res = await recount("A", INDOMIE, { qtyBase: 60 });
    const body = RecountOpnameItemResponse.parse(await res.json());
    expect(itemOf(body, INDOMIE).recount).toEqual({
      countedQtyBase: 60,
      countedAt: T("11.00"),
      systemQtyBase: 60,
      diffQtyBase: 0,
      value: 0,
    });
    expect(stockOf(INDOMIE)).toBe(60);
    expect(opnameEntries()).toEqual([]);
  });

  test("hitung ulang barang yang sudah disesuaikan → 409; qtyBase −1 → 422", async () => {
    await submit("A", [count(INDOMIE, 53), count(KOPI, 9)]);
    updateProduct(KOPI, (p) => {
      p.cost = null;
    });
    at("10.05");
    await finish("A", [
      [INDOMIE, "rusak"],
      [KOPI, "hilang"],
    ]);
    const before = dataOf();
    at("11.00");

    const adjusted = await recount("A", INDOMIE, { qtyBase: 50 });
    expect(adjusted.status).toBe(409);
    expect(await codeOf(adjusted)).toBe("OPNAME_NOT_HELD");
    expect((await approve("A", INDOMIE)).status).toBe(409);

    for (const body of [
      { qtyBase: -1 },
      { qtyBase: 1.5 },
      { qtyBase: "9" },
      { qtyBase: 2 ** 53 },
      {},
      [9],
    ]) {
      const res = await recount("A", KOPI, body);
      expect({ body, status: res.status }).toEqual({ body, status: 422 });
      expect(await json<{ code: string; detail: string }>(res)).toMatchObject({
        code: "VALIDATION",
        detail: "Jumlah tidak valid",
      });
    }
    expect(dataOf()).toEqual(before);

    // Tanpa HPP: hitung ulang tetap langsung disesuaikan, nilai null.
    const ok = RecountOpnameItemResponse.parse(
      await (await recount("A", KOPI, { qtyBase: 7 })).json(),
    );
    expect(itemOf(ok, KOPI)).toMatchObject({
      state: "dihitung_ulang",
      recount: { systemQtyBase: 10, diffQtyBase: -3, value: null },
    });
    expect(stockOf(KOPI)).toBe(7);
    expect((await recount("A", KOPI, { qtyBase: 7 })).status).toBe(409);
  });
});

describe("nilai sesi & daftar", () => {
  test("nilai sesi: loss 18.200 + gain 10.400 → total 28.600; stok awal tidak dihitung", async () => {
    setCost(BIMOLI, 2600);
    updateProduct(KOPI, (p) => {
      p.stockCounted = false;
    });
    await submit("A", [
      count(INDOMIE, 53),
      count(BIMOLI, 14),
      count(KOPI, 15),
      count(BERAS5, 10),
    ]);
    at("10.05");
    await finish("A", [
      [INDOMIE, "rusak"],
      [BIMOLI, "salah_input"],
    ]);
    const s = await detail("A");
    expect(s).toMatchObject({
      id: "A",
      status: "selesai",
      createdByName: "Rina",
      lossValue: 18_200,
      gainValue: 10_400,
      totalValue: 28_600,
      flagged: false,
      reviewedByName: null,
      reviewedAt: null,
    });
    expect(s.items.map((i) => [i.productName, i.state, i.value])).toEqual([
      [BERAS5, "cocok", 0],
      [INDOMIE, "disesuaikan", 18_200],
      [KOPI, "stok_awal", null],
      [BIMOLI, "disesuaikan", 10_400],
    ]);
    expect(itemOf(s, INDOMIE).units.map((u) => [u.name, u.unitSize])).toEqual([
      ["pcs", 1],
      ["dus", 40],
    ]);
    expect(itemOf(s, INDOMIE).units[0]).not.toHaveProperty("price");

    at("10.30");
    await switchStaff("Budi", "654321");
    await submit("B", [count(INDOMIE, 53, "10.20")]);
    expect(await rows()).toEqual([
      {
        id: "B",
        scope: MI_INSTAN,
        status: "selesai",
        createdByName: "Budi",
        submittedAt: T("10.30"),
        finishedAt: T("10.30"),
        itemCount: 1,
        diffCount: 0,
        heldCount: 0,
        totalValue: 0,
        flagged: false,
        reviewed: false,
      },
      {
        id: "A",
        scope: MI_INSTAN,
        status: "selesai",
        createdByName: "Rina",
        submittedAt: T("10.00"),
        finishedAt: T("10.05"),
        itemCount: 4,
        diffCount: 2,
        heldCount: 0,
        totalValue: 28_600,
        flagged: false,
        reviewed: false,
      },
    ]);
  });

  test("K26: loss/gain memakai recount.value untuk dihitung_ulang; diganti/stok awal/cocok tidak dihitung; flagged tetap", async () => {
    setCost(KOPI, 1000);
    setCost(BERAS5, 1000);
    setStock(KOPI, 300);
    updateProduct(BIMOLI, (p) => {
      p.stockCounted = false;
    });
    await submit("A", [
      count(INDOMIE, 53), // −7 → Rp18.200 disesuaikan
      count(KOPI, 60), // −240 → Rp240.000 ditahan
      count(BERAS5, 130), // +120 → Rp120.000 ditahan, lalu diganti
      count(BIMOLI, 14), // stok awal
    ]);
    at("10.05");
    await finish("A", [
      [INDOMIE, "rusak"],
      [KOPI, "hilang"],
      [BERAS5, "salah_input"],
    ]);
    expect(await detail("A")).toMatchObject({
      lossValue: 258_200,
      gainValue: 120_000,
      totalValue: 378_200,
      flagged: true,
    });

    at("10.30");
    await submit("B", [count(BERAS5, 130, "10.25")]);
    at("11.00");
    expect((await recount("A", KOPI, { qtyBase: 310 })).status).toBe(200);
    const s = await detail("A");
    expect(s.items.map((i) => [i.productName, i.state])).toEqual([
      [BERAS5, "diganti"],
      [INDOMIE, "disesuaikan"],
      [KOPI, "dihitung_ulang"],
      [BIMOLI, "stok_awal"],
    ]);
    expect(itemOf(s, BERAS5).replacedBySessionId).toBe("B");
    expect(itemOf(s, KOPI).recount?.value).toBe(10_000);
    expect(s).toMatchObject({
      lossValue: 18_200,
      gainValue: 10_000,
      totalValue: 28_200,
      flagged: true,
    });
  });
});

describe("perhatian & tinjau", () => {
  test("perhatian: opnameHeldCount = barang ditahan; opnameFlags hanya sesi flagged yang belum ditinjau; tinjau → hilang", async () => {
    setCost(KOPI, 1000);
    setStock(KOPI, 300);
    expect(await attention()).toEqual({
      opnameHeldCount: 0,
      opnameFlags: [],
      opnameReplacedHeld: 0,
    });
    await submit("A", [count(INDOMIE, 20), count(KOPI, 100)]);
    at("10.05");
    await finish("A", [
      [INDOMIE, "hilang"],
      [KOPI, "rusak"],
    ]);
    at("10.10");
    await submit("C", [count(BIMOLI, 9)]);
    at("10.15");
    await finish("C", [[BIMOLI, "rusak"]]);
    expect(await attention()).toEqual({
      opnameHeldCount: 2,
      opnameFlags: [
        {
          sessionId: "A",
          scope: MI_INSTAN,
          finishedAt: T("10.05"),
          totalValue: 304_000,
        },
      ],
      opnameReplacedHeld: 0,
    });

    at("11.00");
    expect((await approve("A", KOPI)).status).toBe(200);
    expect((await attention()).opnameHeldCount).toBe(1);

    at("11.10");
    const res = await review("A");
    expect(res.status).toBe(200);
    const reviewed = ReviewOpnameSessionResponse.parse(await res.json());
    expect(reviewed).toMatchObject({
      flagged: true,
      reviewedByName: "Pak Ahmad",
      reviewedAt: T("11.10"),
    });
    expect(await attention()).toEqual({
      opnameHeldCount: 1,
      opnameFlags: [],
      opnameReplacedHeld: 0,
    });
    expect((await rows()).find((r) => r.id === "A")?.reviewed).toBe(true);

    at("11.20");
    const again = await review("A");
    expect(again.status).toBe(200);
    expect(await json<OwnerOpnameSession>(again)).toEqual(reviewed);
  });
});

describe("I2: selisih tertahan yang diganti hitungan baru", () => {
  test("aturan 1: Rina mengganti hitungan tertahannya sendiri (cocok) → hitungan baru ditahan, lama diganti tetap terlihat; stok tetap; tinjau → perhatian hilang", async () => {
    await heldIndomie();
    at("10.30");
    const res = await post(STAFF, {
      id: "B",
      scope: MI_INSTAN,
      deviceNow: Date.now(),
      items: [count(INDOMIE, 60, "10.30")],
    });
    expect(res.status).toBe(201);
    const b = await json<StaffOpnameSession>(res);
    expect(b.items[0]).toMatchObject({
      systemQtyBase: 60,
      diffQtyBase: 0,
      state: "ditahan",
    });
    expect(b.status).toBe("selesai");
    expect(stockOf(INDOMIE)).toBe(60);
    expect(opnameEntries()).toEqual([]);

    const a = await detail("A");
    expect(itemOf(a, INDOMIE)).toMatchObject({
      state: "diganti",
      replacedBySessionId: "B",
      replacedByName: "Rina",
      value: 104_000,
    });
    // K26: diganti tidak dihitung di total sesi.
    expect(a).toMatchObject({ lossValue: 0, totalValue: 0 });
    expect(itemOf(await detail("B"), INDOMIE)).toMatchObject({
      state: "ditahan",
      value: 0,
      replacedByName: null,
    });
    expect(await attention()).toEqual({
      opnameHeldCount: 1,
      opnameFlags: [],
      opnameReplacedHeld: 1,
    });

    // Setujui selisih 0 → tanpa entri ledger.
    at("11.00");
    expect((await approve("B", INDOMIE)).status).toBe(200);
    expect(opnameEntries()).toEqual([]);
    expect(stockOf(INDOMIE)).toBe(60);
    expect((await attention()).opnameReplacedHeld).toBe(1);

    at("11.10");
    expect((await review("A")).status).toBe(200);
    expect(await attention()).toEqual({
      opnameHeldCount: 0,
      opnameFlags: [],
      opnameReplacedHeld: 0,
    });
  });

  test("aturan 1: selisih kecil oleh orang yang sama → menunggu alasan, lalu ditahan (≤ Rp100.000); setujui menerapkan selisih baru", async () => {
    await heldIndomie();
    at("10.30");
    await submit("B", [count(INDOMIE, 55, "10.30")]);
    expect(itemOf(await detail("B"), INDOMIE).state).toBe("menunggu_alasan");
    at("10.35");
    await finish("B", [[INDOMIE, "rusak"]]);
    expect(itemOf(await detail("B"), INDOMIE)).toMatchObject({
      state: "ditahan",
      diffQtyBase: -5,
      value: 13_000,
      reason: "rusak",
    });
    expect(stockOf(INDOMIE)).toBe(60);
    expect(await attention()).toMatchObject({
      opnameHeldCount: 1,
      opnameReplacedHeld: 1,
    });
    at("11.00");
    expect((await approve("B", INDOMIE)).status).toBe(200);
    expect(stockOf(INDOMIE)).toBe(55);
    expect(opnameEntries()).toEqual([
      expect.objectContaining({
        qtyBase: -5,
        effectiveAt: T("10.30"),
        opnameId: "B",
        reason: "rusak",
      }),
    ]);
  });

  test("J5: orang lain mengganti → aturan biasa (cocok); hitungan lama tetap terlihat 'oleh Budi'; diganti saat menunggu alasan tidak dihitung", async () => {
    await heldIndomie();
    at("10.10");
    await submit("C", [count(KOPI, 9, "10.10")]);
    await switchStaff("Budi", "654321");
    at("10.30");
    await submit("B", [count(INDOMIE, 60, "10.30"), count(KOPI, 9, "10.30")]);
    expect(itemOf(await detail("B"), INDOMIE).state).toBe("cocok");
    expect(itemOf(await detail("A"), INDOMIE)).toMatchObject({
      state: "diganti",
      replacedByName: "Budi",
    });
    expect(itemOf(await detail("C"), KOPI)).toMatchObject({
      state: "diganti",
      replacedByName: null,
    });
    expect(await attention()).toEqual({
      opnameHeldCount: 0,
      opnameFlags: [],
      opnameReplacedHeld: 1,
    });
    expect((await review("A")).status).toBe(200);
    expect((await attention()).opnameReplacedHeld).toBe(0);
  });
});

describe("I2: rantai hitungan oleh orang yang sama", () => {
  test("A ditahan → Rina B (menunggu alasan) → Rina C sebelum B disimpan: C tetap ditahan, stok tetap, A & B terlihat pemilik", async () => {
    await heldIndomie();
    at("10.30");
    await submit("B", [count(INDOMIE, 55, "10.30")]);
    at("10.40");
    await submit("C", [count(INDOMIE, 57, "10.40")]);
    expect(itemOf(await detail("B"), INDOMIE)).toMatchObject({
      state: "diganti",
      replacedBySessionId: "C",
      replacedByName: "Rina",
    });
    at("10.45");
    await finish("C", [[INDOMIE, "rusak"]]);
    expect(itemOf(await detail("C"), INDOMIE)).toMatchObject({
      state: "ditahan",
      diffQtyBase: -3,
      value: 7800,
    });
    expect(stockOf(INDOMIE)).toBe(60);
    expect(opnameEntries()).toEqual([]);
    expect(await attention()).toEqual({
      opnameHeldCount: 1,
      opnameFlags: [],
      opnameReplacedHeld: 2,
    });

    // Hitungan cocok di ujung rantai juga langsung ditahan.
    at("10.50");
    await submit("D", [count(INDOMIE, 60, "10.50")]);
    expect(itemOf(await detail("D"), INDOMIE).state).toBe("ditahan");
    expect(stockOf(INDOMIE)).toBe(60);
  });

  test("rantai yang sama, C oleh orang lain → J5 (disesuaikan); B tetap terlihat 'oleh Budi'", async () => {
    await heldIndomie();
    at("10.30");
    await submit("B", [count(INDOMIE, 55, "10.30")]);
    await switchStaff("Budi", "654321");
    at("10.40");
    await submit("C", [count(INDOMIE, 57, "10.40")]);
    at("10.45");
    await finish("C", [[INDOMIE, "rusak"]]);
    expect(itemOf(await detail("C"), INDOMIE).state).toBe("disesuaikan");
    expect(stockOf(INDOMIE)).toBe(57);
    expect(itemOf(await detail("B"), INDOMIE)).toMatchObject({
      state: "diganti",
      replacedByName: "Budi",
    });
    expect(await attention()).toEqual({
      opnameHeldCount: 0,
      opnameFlags: [],
      opnameReplacedHeld: 2,
    });
  });
});

describe("batas sesi", () => {
  test("M3: sessionLimit dari stockRules", async () => {
    await heldIndomie();
    expect((await detail("A")).sessionLimit).toBe(250_000);
    mockDb.update((s) => {
      s.stockRules.opnameSessionLimit = 300_000;
    });
    expect((await detail("A")).sessionLimit).toBe(300_000);
  });
});

describe("riwayat stok & akses", () => {
  test("riwayat stok (movementsOf) memuat opname/stok_awal/keluar_kedaluwarsa dengan nama pencatat", async () => {
    await loginWithShift(1_500_000);
    expect((await post("/api/staff/receipts", receiptInput())).status).toBe(
      201,
    );
    updateProduct(INDOMIE, (p) => {
      p.stockCounted = false;
    });
    at("10.05");
    await submit("A", [count(INDOMIE, 100, "10.05")]);
    at("10.10");
    await submit("B", [count(INDOMIE, 60, "10.10")]);
    at("10.15");
    await finish("B", [[INDOMIE, "hilang"]]);
    at("10.20");
    expect((await approve("B", INDOMIE)).status).toBe(200);
    at("10.25");
    const removed = await post("/api/owner/expiry-removals", {
      id: "keluar-1",
      receiptId: "draf-1",
      lineId: "l1",
      qtyBase: 2,
    });
    expect(removed.status).toBe(204);

    const moves = await json<StockMovement[]>(
      await get(`/api/owner/products/${idOf(INDOMIE)}/movements`),
    );
    expect(moves.slice(0, 3)).toEqual([
      {
        id: expect.any(String),
        at: T("10.25"),
        kind: "keluar_kedaluwarsa",
        qtyBase: -2,
        kasirName: "Pak Ahmad",
        reason: null,
      },
      {
        id: expect.any(String),
        at: T("10.20"),
        kind: "opname",
        qtyBase: -40,
        kasirName: "Pak Ahmad",
        reason: "hilang",
      },
      {
        id: expect.any(String),
        at: T("10.05"),
        kind: "stok_awal",
        qtyBase: -40, // 100 − (60 + 2 dus dari nota)
        kasirName: "Rina",
        reason: null,
      },
    ]);
  });

  test("tanpa sesi pemilik → 401; sesi tidak ada → 404", async () => {
    await heldIndomie();
    for (const res of [
      await get(`${OWNER}/tidak-ada`),
      await approve("tidak-ada", INDOMIE),
      await recount("tidak-ada", INDOMIE, { qtyBase: 1 }),
      await review("tidak-ada"),
      await approve("A", KOPI),
      await recount("A", KOPI, { qtyBase: 1 }),
    ]) {
      expect(res.status).toBe(404);
      expect(await codeOf(res)).toBe("NOT_FOUND");
    }

    await post("/api/owner/logout", {});
    const before = dataOf();
    for (const res of [
      await get(OWNER),
      await get(`${OWNER}/A`),
      await approve("A", INDOMIE),
      await recount("A", INDOMIE, { qtyBase: 1 }),
      await review("A"),
    ]) {
      expect(res.status).toBe(401);
    }
    expect(dataOf()).toEqual(before);
  });
});
