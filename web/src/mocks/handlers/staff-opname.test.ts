import { beforeEach, describe, expect, test, vi } from "vitest";
import type {
  OpnameError,
  OpnameScope,
  StaffOpnameCategories,
  StaffOpnameRow,
  StaffOpnameSession,
  StaffProduct,
  StockMovement,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  CreateStaffOpnameSessionResponse,
  FinishStaffOpnameSessionResponse,
  ListStaffOpnameCategoriesResponse,
  ListStaffOpnameSessionsResponse,
} from "@/shared/api/gen/zod/staff/staff";
import { type MockProduct, mockDb } from "../db";
import {
  BIMOLI,
  deepKeys,
  FORBIDDEN_STAFF_KEYS,
  get,
  json,
  loginWithShift,
  ownerLogin,
  post,
  receiptInput,
  staffLogin,
} from "./test-helpers";

const INDOMIE = "Indomie Goreng";
const KOPI = "Kopi Kapal Api 165 g";
const BERAS5 = "Beras Pandan Wangi 5 kg";
const BASE = "/api/staff/opname-sessions";
const MIN = 60_000;
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
const at = (hm: string) => vi.setSystemTime(T(hm));

const count = (
  name: string,
  qtyBase: unknown,
  countedAt: unknown = T("10.00"),
) => ({
  productId: idOf(name),
  qtyBase,
  countedAt,
});
type Count = ReturnType<typeof count>;
const submit = (
  id: string,
  items: Count[],
  extra: Record<string, unknown> = {},
) =>
  post(BASE, {
    id,
    scope: MI_INSTAN,
    deviceNow: Date.now(),
    items,
    ...extra,
  });
const finish = (id: string, reasons: unknown[]) =>
  post(`${BASE}/${id}/finish`, { reasons });
const reason = (name: string, r: string, receiptId: string | null = null) => ({
  productId: idOf(name),
  reason: r,
  receiptId,
});
const itemOf = (s: StaffOpnameSession, name: string) => {
  const item = s.items.find((i) => i.productName === name);
  if (!item) throw new Error(`${name} tidak ada di sesi`);
  return item;
};
const errorsOf = async (res: Response) =>
  (await json<{ errors: OpnameError[] }>(res)).errors;
const codeOf = async (res: Response) =>
  (await json<{ code: string }>(res)).code;
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
async function switchStaff(name: string, pin: string): Promise<void> {
  await post("/api/staff/logout", {});
  expect((await staffLogin(name, pin)).status).toBe(200);
}

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  at("09.00");
  expect((await staffLogin()).status).toBe(200);
  setStock(INDOMIE, 60);
  setStock(BIMOLI, 10);
  setStock(KOPI, 10);
  setStock(BERAS5, 10);
  at("10.00");
});

describe("lingkup & daftar hitung", () => {
  test("kategori & daftar barang tanpa stok; lingkup tanpa_kategori memuat barang baru dari nota (kategori null); lingkup=kategori tanpa kategori → 422", async () => {
    await loginWithShift(1_500_000);
    await staffLogin();
    const nota = receiptInput({
      id: "nota-teh",
      payment: {
        timing: "sekarang",
        method: "transfer",
        cashSource: null,
        dueDate: null,
      },
      lines: [
        {
          lineId: "l1",
          productId: null,
          unitId: null,
          newProduct: {
            name: "Teh Pucuk Harum 350 ml",
            sellUnit: "botol",
            notaUnit: "dus",
            notaUnitSize: 24,
            barcode: null,
          },
          qty: 2,
          unitCost: 80_000,
          expiryDate: null,
        },
      ],
    });
    expect((await post("/api/staff/receipts", nota)).status).toBe(201);

    const cats = await json<StaffOpnameCategories>(
      await get("/api/staff/opname/categories"),
    );
    expect(ListStaffOpnameCategoriesResponse.safeParse(cats).success).toBe(
      true,
    );
    const none = cats.categories.find((c) => c.scope.kind === "tanpa_kategori");
    expect(none).toEqual({
      scope: { kind: "tanpa_kategori", category: null },
      productCount: 1,
      lastCountedAt: null,
    });
    expect(cats.suggested).toEqual(cats.categories[0]?.scope);

    const res = await get("/api/staff/opname/products?lingkup=tanpa_kategori");
    expect(res.status).toBe(200);
    const list = await json<StaffProduct[]>(res);
    expect(list.map((p) => [p.name, p.category, p.status])).toEqual([
      ["Teh Pucuk Harum 350 ml", null, "menunggu_harga"],
    ]);
    const mi = await json<StaffProduct[]>(
      await get(
        `/api/staff/opname/products?lingkup=kategori&kategori=${encodeURIComponent("Mi Instan")}`,
      ),
    );
    expect(mi.map((p) => p.name)).toContain(INDOMIE);
    expect(mi.every((p) => p.category === "Mi Instan")).toBe(true);
    for (const bad of [
      "lingkup=kategori",
      "lingkup=kategori&kategori=",
      "lingkup=semua&kategori=Beras",
      "lingkup=rak",
      "",
    ]) {
      const r = await get(`/api/staff/opname/products?${bad}`);
      expect({ bad, status: r.status }).toEqual({ bad, status: 422 });
      expect(await codeOf(r)).toBe("VALIDATION");
    }
  });
});

describe("kirim hitungan", () => {
  test("kirim: cocok & stok awal langsung beres (stockCounted jadi true, entri stok_awal), sesi tanpa selisih langsung selesai", async () => {
    updateProduct(BIMOLI, (p) => {
      p.stockCounted = false;
    });
    const res = await submit("sesi-1", [count(INDOMIE, 60), count(BIMOLI, 14)]);
    expect(res.status).toBe(201);
    const body = await json<StaffOpnameSession>(res);
    expect(CreateStaffOpnameSessionResponse.safeParse(body).success).toBe(true);
    expect(body).toMatchObject({
      id: "sesi-1",
      scope: MI_INSTAN,
      status: "selesai",
      createdByName: "Rina",
      submittedAt: T("10.00"),
      finishedAt: T("10.00"),
    });
    expect(itemOf(body, INDOMIE)).toMatchObject({
      state: "cocok",
      systemQtyBase: 60,
      diffQtyBase: 0,
    });
    expect(itemOf(body, BIMOLI)).toMatchObject({
      state: "stok_awal",
      systemQtyBase: 10,
      countedQtyBase: 14,
      diffQtyBase: 4,
      reason: null,
    });
    expect(productOf(BIMOLI).stockCounted).toBe(true);
    expect(stockOf(BIMOLI)).toBe(14);
    expect(mockDb.get().stockEntries.map((e) => [e.kind, e.qtyBase])).toEqual([
      ["stok_awal", 4],
    ]);
  });

  test("kirim ulang id sama → 200 sesi sama, stok tidak berubah; id milik Budi → 409 ID_TAKEN", async () => {
    const first = await json<StaffOpnameSession>(
      await submit("sesi-1", [count(INDOMIE, 53)]),
    );
    const before = dataOf();
    at("10.05");
    const again = await submit("sesi-1", [count(INDOMIE, 1)]);
    expect(again.status).toBe(200);
    expect(await json<StaffOpnameSession>(again)).toEqual(first);
    expect(dataOf()).toEqual(before);

    await switchStaff("Budi", "654321");
    const taken = await submit("sesi-1", [count(INDOMIE, 53)]);
    expect(taken.status).toBe(409);
    expect(await codeOf(taken)).toBe("ID_TAKEN");
    expect((await get(`${BASE}/sesi-1`)).status).toBe(404);
    expect(dataOf()).toEqual(before);
  });

  test("422 atomik: satu barang nonaktif → tidak ada sesi, stok & stockCounted tidak berubah, errors per productId", async () => {
    updateProduct(BERAS5, (p) => {
      p.status = "nonaktif";
    });
    updateProduct(BIMOLI, (p) => {
      p.stockCounted = false;
    });
    const before = dataOf();
    const res = await submit("sesi-1", [
      count(INDOMIE, 50),
      count(BIMOLI, 3),
      count(BERAS5, 9),
    ]);
    expect(res.status).toBe(422);
    expect(await errorsOf(res)).toEqual([
      { productId: idOf(BERAS5), message: "Barang ini tidak dijual lagi" },
    ]);
    expect(dataOf()).toEqual(before);

    const many = await submit("sesi-1", [
      { productId: "tidak-ada", qtyBase: 1, countedAt: T("10.00") },
      count(INDOMIE, 1),
      count(INDOMIE, 2),
      count(BIMOLI, -1),
      count(KOPI, 1.5, "10.00"),
    ]);
    expect(many.status).toBe(422);
    const body = await json<{ code: string; errors: OpnameError[] }>(many);
    expect(body.code).toBe("VALIDATION");
    expect(body.errors).toEqual([
      { productId: "tidak-ada", message: "Barang tidak ditemukan" },
      { productId: idOf(INDOMIE), message: "Barang dihitung dua kali" },
      { productId: idOf(BIMOLI), message: "Jumlah tidak valid" },
      { productId: idOf(KOPI), message: "Jumlah tidak valid" },
    ]);
    const clock = await submit("sesi-1", [count(KOPI, 1, "10.00")]);
    expect(await errorsOf(clock)).toEqual([
      { productId: idOf(KOPI), message: "Jam hitung tidak valid" },
    ]);
    const empty = await submit("sesi-1", []);
    expect(await errorsOf(empty)).toEqual([
      { productId: null, message: "Belum ada barang yang dihitung" },
    ]);
    for (const bad of [
      {
        id: "",
        scope: MI_INSTAN,
        deviceNow: T("10.00"),
        items: [count(INDOMIE, 1)],
      },
      {
        id: "x".repeat(65),
        scope: MI_INSTAN,
        deviceNow: T("10.00"),
        items: [count(INDOMIE, 1)],
      },
      {
        id: "s",
        scope: { kind: "kategori", category: null },
        deviceNow: T("10.00"),
        items: [count(INDOMIE, 1)],
      },
      {
        id: "s",
        scope: { kind: "semua", category: "Beras" },
        deviceNow: T("10.00"),
        items: [count(INDOMIE, 1)],
      },
      {
        id: "s",
        scope: MI_INSTAN,
        deviceNow: "kemarin",
        items: [count(INDOMIE, 1)],
      },
      {
        id: "s",
        scope: MI_INSTAN,
        deviceNow: T("10.00"),
        items: [{ qtyBase: 1 }],
      },
    ]) {
      const r = await post(BASE, bad);
      expect(r.status).toBe(422);
    }
    expect(dataOf()).toEqual(before);
  });

  test("K6 lewat HTTP: deviceNow telat 6 menit → countedAt digeser +6 menit + clockEstimated", async () => {
    at("10.30");
    const res = await submit("sesi-1", [count(INDOMIE, 60, T("10.10"))], {
      deviceNow: T("10.30") - 6 * MIN,
    });
    const body = await json<StaffOpnameSession>(res);
    expect(itemOf(body, INDOMIE)).toMatchObject({
      countedAt: T("10.16"),
      clockEstimated: true,
    });
  });
});

describe("simpan alasan", () => {
  test("simpan alasan: −7 Indomie Goreng (Rp18.200) disesuaikan; −40 (Rp104.000) ditahan; tanpa HPP ditahan (J3)", async () => {
    updateProduct(KOPI, (p) => {
      p.cost = null;
    });
    await submit("sesi-1", [count(INDOMIE, 53), count(KOPI, 9)]);
    at("10.10");
    const res = await finish("sesi-1", [
      reason(INDOMIE, "rusak"),
      reason(KOPI, "hilang"),
    ]);
    expect(res.status).toBe(200);
    const body = await json<StaffOpnameSession>(res);
    expect(FinishStaffOpnameSessionResponse.safeParse(body).success).toBe(true);
    expect(body).toMatchObject({ status: "selesai", finishedAt: T("10.10") });
    expect(itemOf(body, INDOMIE)).toMatchObject({
      state: "disesuaikan",
      reason: "rusak",
      diffQtyBase: -7,
    });
    expect(itemOf(body, KOPI)).toMatchObject({
      state: "ditahan",
      reason: "hilang",
    });
    const saved = mockDb.get().opnameSessions[0];
    expect(saved?.items.map((i) => [i.state, i.value])).toEqual([
      ["disesuaikan", 18_200],
      ["ditahan", null],
    ]);
    expect(stockOf(INDOMIE)).toBe(53);
    expect(stockOf(KOPI)).toBe(10);

    setStock(INDOMIE, 60);
    await submit("sesi-2", [count(INDOMIE, 20, T("10.10"))]);
    const held = await json<StaffOpnameSession>(
      await finish("sesi-2", [reason(INDOMIE, "hilang")]),
    );
    expect(itemOf(held, INDOMIE).state).toBe("ditahan");
    expect(mockDb.get().opnameSessions[1]?.items[0]?.value).toBe(104_000);
    expect(stockOf(INDOMIE)).toBe(60);
  });

  test("J2: lebih +40 (Rp104.000) juga ditahan; sesi 90rb+90rb+80rb → flagged", async () => {
    await submit("lebih", [count(INDOMIE, 100)]);
    const over = await json<StaffOpnameSession>(
      await finish("lebih", [reason(INDOMIE, "salah_input")]),
    );
    expect(itemOf(over, INDOMIE)).toMatchObject({
      state: "ditahan",
      diffQtyBase: 40,
    });
    expect(mockDb.get().opnameSessions[0]?.flagged).toBe(false);

    for (const name of [BIMOLI, KOPI, BERAS5]) {
      updateProduct(name, (p) => {
        p.cost = { amount: 1000, qtyBase: 1 };
      });
      setStock(name, 100);
    }
    await submit("besar", [
      count(BIMOLI, 10),
      count(KOPI, 10),
      count(BERAS5, 20),
    ]);
    const done = await json<StaffOpnameSession>(
      await finish("besar", [
        reason(BIMOLI, "hilang"),
        reason(KOPI, "hilang"),
        reason(BERAS5, "rusak"),
      ]),
    );
    expect(done.items.every((i) => i.state === "disesuaikan")).toBe(true);
    const saved = mockDb.get().opnameSessions.find((s) => s.id === "besar");
    expect(saved?.items.map((i) => i.value)).toEqual([90_000, 90_000, 80_000]);
    expect(saved?.flagged).toBe(true);
    expect([stockOf(BIMOLI), stockOf(KOPI), stockOf(BERAS5)]).toEqual([
      10, 10, 20,
    ]);
  });

  test("K4: salah_input + nota di daftar → receiptRef; null → tidak_diketahui; nota lain → 422 Nota rujukan tidak cocok", async () => {
    await loginWithShift(1_500_000);
    await staffLogin();
    expect((await post("/api/staff/receipts", receiptInput())).status).toBe(
      201,
    );
    at("10.05");
    setStock(INDOMIE, 60);
    setStock(BIMOLI, 10);
    const sent = await json<StaffOpnameSession>(
      await submit("sesi-1", [
        count(INDOMIE, 59, T("10.04")),
        count(KOPI, 9, T("10.04")),
      ]),
    );
    const option = {
      receiptId: "draf-1",
      supplierName: "CV Sumber Rejeki",
      notaDate: "2026-11-02",
    };
    expect(itemOf(sent, INDOMIE).receiptOptions).toEqual([option]);
    expect(itemOf(sent, KOPI).receiptOptions).toEqual([]);

    const before = dataOf();
    const wrong = await finish("sesi-1", [
      reason(INDOMIE, "salah_input", "nota-lain"),
      reason(KOPI, "rusak", "draf-1"),
    ]);
    expect(wrong.status).toBe(422);
    expect(await errorsOf(wrong)).toEqual([
      { productId: idOf(INDOMIE), message: "Nota rujukan tidak cocok" },
      { productId: idOf(KOPI), message: "Nota rujukan tidak cocok" },
    ]);
    expect(dataOf()).toEqual(before);

    const ok = await json<StaffOpnameSession>(
      await finish("sesi-1", [
        reason(INDOMIE, "salah_input", "draf-1"),
        reason(KOPI, "salah_input", null),
      ]),
    );
    expect(itemOf(ok, INDOMIE)).toMatchObject({
      reason: "salah_input",
      receiptRef: option,
      receiptOptions: [],
    });
    expect(itemOf(ok, KOPI)).toMatchObject({
      reason: "tidak_diketahui",
      receiptRef: null,
    });
  });

  test("alasan kurang → 422 Pilih alasan; simpan dua kali → stok disesuaikan sekali", async () => {
    await submit("sesi-1", [
      count(INDOMIE, 55),
      count(BIMOLI, 9),
      count(KOPI, 10),
    ]);
    const before = dataOf();
    const missing = await finish("sesi-1", [
      reason(INDOMIE, "rusak"),
      reason(KOPI, "rusak"),
    ]);
    expect(missing.status).toBe(422);
    expect(await errorsOf(missing)).toEqual([
      { productId: idOf(KOPI), message: "Barang ini tidak perlu alasan" },
      { productId: idOf(BIMOLI), message: "Pilih alasan" },
    ]);
    const unknown = await finish("sesi-1", [
      reason(INDOMIE, "rusak"),
      reason(BIMOLI, "dicuri"),
    ]);
    expect(unknown.status).toBe(422);
    expect(dataOf()).toEqual(before);

    const reasons = [reason(INDOMIE, "rusak"), reason(BIMOLI, "kedaluwarsa")];
    const first = await finish("sesi-1", reasons);
    expect(first.status).toBe(200);
    const firstBody = await json<StaffOpnameSession>(first);
    at("10.20");
    const second = await finish("sesi-1", [reason(INDOMIE, "hilang")]);
    expect(second.status).toBe(200);
    expect(await json<StaffOpnameSession>(second)).toEqual(firstBody);
    expect([stockOf(INDOMIE), stockOf(BIMOLI)]).toEqual([55, 9]);
    expect(mockDb.get().stockEntries).toHaveLength(2);
  });

  test("riwayat stok: entri opname membawa reason (K27)", async () => {
    await submit("sesi-1", [count(INDOMIE, 57)]);
    at("10.10");
    await finish("sesi-1", [reason(INDOMIE, "kedaluwarsa")]);
    expect((await ownerLogin()).status).toBe(200);
    const moves = await json<StockMovement[]>(
      await get(`/api/owner/products/${idOf(INDOMIE)}/movements`),
    );
    expect(moves[0]).toEqual({
      id: expect.any(String),
      at: T("10.10"),
      kind: "opname",
      qtyBase: -3,
      kasirName: "Rina",
      reason: "kedaluwarsa",
    });
  });
});

describe("hitung buta & akses", () => {
  test("respons staf tanpa key terlarang (value, cost, stock, …) di sesi & riwayat; sesi orang lain → 404; terowongan → 403", async () => {
    const bodies: unknown[] = [];
    const take = async (res: Response) => {
      expect(res.status).toBeLessThan(300);
      const body: unknown = await res.json();
      bodies.push(body);
      return body;
    };
    await take(await get("/api/staff/opname/categories"));
    await take(await get("/api/staff/opname/products?lingkup=semua"));
    await take(await submit("sesi-1", [count(INDOMIE, 50), count(BIMOLI, 10)]));
    await take(await get(`${BASE}/sesi-1`));
    await take(await finish("sesi-1", [reason(INDOMIE, "hilang")]));
    const rows = await take(await get(BASE));
    expect(ListStaffOpnameSessionsResponse.safeParse(rows).success).toBe(true);
    expect(rows).toEqual([
      {
        id: "sesi-1",
        scope: MI_INSTAN,
        status: "selesai",
        submittedAt: T("10.00"),
        finishedAt: T("10.00"),
        itemCount: 2,
        diffCount: 1,
        heldCount: 0,
      } satisfies StaffOpnameRow,
    ]);
    for (const body of bodies) {
      const keys = deepKeys(body);
      expect(FORBIDDEN_STAFF_KEYS.filter((k) => keys.has(k))).toEqual([]);
    }

    // Sesi Budi tidak terlihat dan tidak bisa diberi alasan oleh Rina; riwayat hanya milik sendiri.
    await switchStaff("Budi", "654321");
    expect((await submit("sesi-budi", [count(KOPI, 1)])).status).toBe(201);
    await switchStaff("Rina", "123456");
    expect((await get(`${BASE}/sesi-budi`)).status).toBe(404);
    expect((await finish("sesi-budi", [reason(KOPI, "hilang")])).status).toBe(
      404,
    );
    expect(
      (await json<StaffOpnameRow[]>(await get(BASE))).map((r) => r.id),
    ).toEqual(["sesi-1"]);

    // Riwayat 30 hari terakhir.
    vi.setSystemTime(T("10.00") + 31 * 86_400_000);
    expect(await json<StaffOpnameRow[]>(await get(BASE))).toEqual([]);

    const tunnel = { "cf-ray": "abc" };
    for (const res of [
      await get("/api/staff/opname/categories", tunnel),
      await get("/api/staff/opname/products?lingkup=semua", tunnel),
      await get(BASE, tunnel),
      await get(`${BASE}/sesi-1`, tunnel),
      await post(BASE, {}, tunnel),
      await post(`${BASE}/sesi-1/finish`, { reasons: [] }, tunnel),
    ]) {
      expect(res.status).toBe(403);
      expect(await codeOf(res)).toBe("STAFF_LAN_ONLY");
    }
  });

  test("tanpa sesi orang toko → 401", async () => {
    await post("/api/staff/logout", {});
    for (const res of [
      await get("/api/staff/opname/categories"),
      await get("/api/staff/opname/products?lingkup=semua"),
      await get(BASE),
      await get(`${BASE}/sesi-1`),
      await submit("sesi-1", [count(INDOMIE, 1)]),
      await finish("sesi-1", []),
    ]) {
      expect(res.status).toBe(401);
    }
  });
});
