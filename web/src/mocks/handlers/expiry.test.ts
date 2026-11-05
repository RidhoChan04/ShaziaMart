import { beforeEach, describe, expect, test, vi } from "vitest";
import type {
  OwnerExpiryList,
  StaffExpiryList,
  StaffLowStockItem,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { GetOwnerExpiryResponse } from "@/shared/api/gen/zod/owner/owner";
import {
  GetStaffExpiryResponse,
  ListStaffLowStockResponse,
} from "@/shared/api/gen/zod/staff/staff";
import { type MockProduct, mockDb } from "../db";
import { applySampleStock } from "../stock/sample";
import { TUNNEL_HEADERS } from "./staff-realm";
import {
  deepKeys,
  FORBIDDEN_STAFF_KEYS,
  get,
  json,
  ownerLogin,
  post,
  put,
  receiptInput,
  staffLogin,
} from "./test-helpers";

/** Senin 2 Nov 2026 10.00 WIB (hari mockup layar 8a). */
const NOW = Date.UTC(2026, 10, 2, 3);
const ROTI = "Sari Roti Tawar";
const SOBEK = "Sari Roti Sobek Coklat";
const SKM = "Susu Kental Manis Frisian Flag 370 g";
const SUSU_NAME = "Susu Bendera Kotak 200 ml";
/** Kiriman Susu Bendera: A 24 kotak (ED +18), B 12 kotak (ED +48); keduanya baris `l1`. */
const A = { receiptId: "contoh-stok-1", lineId: "l1" };
const B = { receiptId: "contoh-stok-5", lineId: "l1" };
const ROTI_LOT = { receiptId: "contoh-stok-3", lineId: "l1" };

const productOf = (name: string): MockProduct => {
  const p = mockDb.get().products.find((x) => x.name === name);
  if (!p) throw new Error(`tanpa ${name}`);
  return p;
};
const SUSU = (): string => productOf(SUSU_NAME).id;
const stockOf = (name: string) => mockDb.get().stock[productOf(name).id];

const staffList = async () => {
  const res = await get("/api/staff/expiry");
  expect(res.status).toBe(200);
  return GetStaffExpiryResponse.parse(await json<StaffExpiryList>(res));
};
const ownerList = async () => {
  const res = await get("/api/owner/expiry");
  expect(res.status).toBe(200);
  return GetOwnerExpiryResponse.parse(await json<OwnerExpiryList>(res));
};
const remove = (body: unknown) => post("/api/staff/expiry-removals", body);
const lineExpiry = (
  lot: { receiptId: string; lineId: string },
  expiryDate: unknown,
  realm: "staff" | "owner" = "staff",
) =>
  put(`/api/${realm}/receipts/${lot.receiptId}/lines/${lot.lineId}/expiry`, {
    expiryDate,
  });
const detailOf = async (res: Response) =>
  (await json<{ detail: string }>(res)).detail;
const codeOf = async (res: Response) =>
  (await json<{ code: string }>(res)).code;
const susuLots = (list: StaffExpiryList) =>
  list.lots.filter((l) => l.productName === SUSU_NAME);
const receiptOf = (id: string) => {
  const r = mockDb.get().receipts.find((x) => x.id === id);
  if (!r) throw new Error(`tanpa nota ${id}`);
  return r;
};

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  mockDb.update((s) => applySampleStock(s, NOW));
  expect((await staffLogin()).status).toBe(200);
  expect((await ownerLogin()).status).toBe(200);
});

describe("daftar kedaluwarsa orang toko", () => {
  test("daftar staf: lewat dulu lalu segera, perkiraan FIFO, tanpa key terlarang", async () => {
    // contoh K13: Roti tawar 3 (ED −2), Susu Bendera A 24 (ED +18), B 12 (ED +48); stok susu 14
    const body = await staffList();
    expect(body.soonDays).toBe(30);
    expect(body.lots[0]).toMatchObject({
      productName: ROTI,
      stage: "lewat",
      estimateQtyBase: 3,
    });
    // B (+48 hari) tidak tampil
    expect(susuLots(body).map((l) => l.estimateQtyBase)).toEqual([2]);
    expect(
      [...deepKeys(body)].filter((k) => FORBIDDEN_STAFF_KEYS.includes(k)),
    ).toEqual([]);
  });

  test("urutan & isi baris: tahap, ED naik, kapasitas kiriman, supplier, satuan eceran", async () => {
    const body = await staffList();
    expect(
      body.lots.map((l) => [
        l.productName,
        l.stage,
        l.expiryDate,
        l.estimateQtyBase,
        l.capacityQtyBase,
      ]),
    ).toEqual([
      [ROTI, "lewat", "2026-10-31", 3, 3],
      [SOBEK, "segera", "2026-11-04", 5, 5],
      [SKM, "segera", "2026-11-15", 6, 6],
      [SUSU_NAME, "segera", "2026-11-20", 2, 24],
    ]);
    expect(susuLots(body)[0]).toEqual({
      ...A,
      productId: SUSU(),
      productName: SUSU_NAME,
      unitName: "kotak",
      unitSize: 1,
      isCurah: false,
      estimateQtyBase: 2,
      capacityQtyBase: 24,
      expiryDate: "2026-11-20",
      stage: "segera",
      supplierName: "CV Sumber Rejeki",
      notaDate: "2026-10-03",
    });
    expect(body.recent).toEqual([]);
  });

  test("tanpa sesi orang toko → 401", async () => {
    await post("/api/staff/logout", {});
    expect((await get("/api/staff/expiry")).status).toBe(401);
    expect((await get("/api/staff/low-stock")).status).toBe(401);
    expect((await remove({ id: "x", ...A, qtyBase: 1 })).status).toBe(401);
    expect((await lineExpiry(A, "2026-12-01")).status).toBe(401);
  });
});

describe("keluarkan dari stok (J6)", () => {
  test("keluarkan 2 dari A: stok 12, A hilang dari daftar, log Rina, ledger keluar; kirim ulang id sama tidak dobel", async () => {
    for (const _ of [1, 2]) {
      expect((await remove({ id: "rm1", ...A, qtyBase: 2 })).status).toBe(204);
    }
    expect(mockDb.get().stock[SUSU()]).toBe(12);
    const out = mockDb
      .get()
      .stockEntries.filter((e) => e.kind === "keluar_kedaluwarsa");
    expect(out).toHaveLength(1);
    expect(out[0]).toMatchObject({
      productId: SUSU(),
      qtyBase: -2,
      ...A,
      at: NOW,
      effectiveAt: NOW,
      actorName: "Rina",
      opnameId: null,
      reason: null,
    });
    const list = await staffList();
    expect(susuLots(list)).toEqual([]);
    expect(list.recent).toHaveLength(1);
    expect(list.recent[0]).toMatchObject({
      actorName: "Rina",
      kind: "keluar",
      qtyBase: 2,
      ...A,
      productId: SUSU(),
      productName: SUSU_NAME,
      unitName: "kotak",
      fromDate: null,
      toDate: null,
      at: NOW,
    });
    // K28: nilai disimpan saat kejadian (HPP Susu Bendera Rp4.800/kotak)
    expect(mockDb.get().expiryLog[0]).toMatchObject({
      id: "rm1",
      lossValue: 9_600,
    });
  });

  test("kirim ulang id yang sama tetap 204 walau melebihi kapasitas sekarang", async () => {
    expect((await remove({ id: "rm2", ...A, qtyBase: 24 })).status).toBe(204);
    expect((await remove({ id: "rm2", ...A, qtyBase: 24 })).status).toBe(204);
    expect(mockDb.get().stock[SUSU()]).toBe(-10);
    expect(mockDb.get().expiryLog).toHaveLength(1);
  });

  test.each([
    [0, "Jumlah minimal 1"],
    [25, "Jumlah melebihi kiriman ini (24 kotak)"],
  ])("keluarkan %i → 422 %s", async (q, msg) =>
    expect(
      await json(await remove({ id: "x", ...A, qtyBase: q })),
    ).toMatchObject({ status: 422, code: "VALIDATION", detail: msg }),
  );

  test.each([
    ["bukan bilangan bulat", { id: "x", ...A, qtyBase: 1.5 }],
    ["tanpa id", { ...A, qtyBase: 1 }],
    ["id terlalu panjang", { id: "x".repeat(65), ...A, qtyBase: 1 }],
  ])("isian rusak (%s) → 422 tanpa perubahan", async (_, body) => {
    const before = mockDb.get().stockEntries.length;
    const res = await remove(body);
    expect(res.status).toBe(422);
    expect(await codeOf(res)).toBe("VALIDATION");
    expect(mockDb.get().stockEntries).toHaveLength(before);
  });

  test("nota/baris tidak ada atau nota dibatalkan → 404 Kiriman tidak ditemukan", async () => {
    for (const lot of [
      { receiptId: "tidak-ada", lineId: "l1" },
      { receiptId: A.receiptId, lineId: "l9" },
    ]) {
      const res = await remove({ id: "x", ...lot, qtyBase: 1 });
      expect(res.status).toBe(404);
      expect(await detailOf(res)).toBe("Kiriman tidak ditemukan");
    }
    mockDb.update((s) => {
      const r = s.receipts.find((x) => x.id === A.receiptId);
      if (r) r.status = "dibatalkan";
    });
    expect((await remove({ id: "x", ...A, qtyBase: 1 })).status).toBe(404);
    expect(mockDb.get().expiryLog).toEqual([]);
  });

  test("baris nota turun di bawah yang sudah dikeluarkan → kapasitas 0, hilang dari daftar, keluarkan → 422", async () => {
    expect((await remove({ id: "rm1", ...A, qtyBase: 20 })).status).toBe(204);
    mockDb.update((s) => {
      const line = s.receipts.find((x) => x.id === A.receiptId)?.lines[0];
      if (line) line.qty = 10;
      s.stock[SUSU()] = 40;
    });
    const lots = susuLots(await staffList());
    expect(lots.map((l) => [l.receiptId, l.capacityQtyBase])).toEqual([]);
    const res = await remove({ id: "rm9", ...A, qtyBase: 1 });
    expect(await detailOf(res)).toBe("Jumlah melebihi kiriman ini (0 kotak)");
  });

  test("lineId sama di dua nota berbeda (l1) → keluarkan/ubah ED hanya mengenai nota yang disebut", async () => {
    const indomie = productOf("Indomie Goreng").id;
    const res = await post(
      "/api/staff/receipts",
      receiptInput({
        payment: {
          timing: "sekarang",
          method: "transfer",
          cashSource: null,
          dueDate: null,
        },
      }),
    );
    expect(res.status).toBe(201);
    const indomieStock = mockDb.get().stock[indomie];
    expect((await remove({ id: "rm1", ...A, qtyBase: 3 })).status).toBe(204);
    expect(mockDb.get().stock[indomie]).toBe(indomieStock);
    expect(
      mockDb
        .get()
        .stockEntries.filter((e) => e.kind === "keluar_kedaluwarsa")
        .map((e) => [e.productId, e.receiptId, e.lineId, e.qtyBase]),
    ).toEqual([[SUSU(), A.receiptId, "l1", -3]]);
    // B tidak ikut berkurang: kapasitasnya tetap 12 (stok dinaikkan agar A tetap tampil).
    mockDb.update((s) => {
      s.stockRules.expirySoonDays = 60;
      s.stock[SUSU()] = 30;
    });
    expect(
      susuLots(await staffList()).map((l) => [l.receiptId, l.capacityQtyBase]),
    ).toEqual([
      [A.receiptId, 21],
      [B.receiptId, 12],
    ]);

    expect(
      (await lineExpiry({ receiptId: "draf-1", lineId: "l1" }, "2027-05-01"))
        .status,
    ).toBe(204);
    expect(receiptOf("draf-1").lines[0]?.expiryDate).toBe("2027-05-01");
    expect(receiptOf(A.receiptId).lines[0]?.expiryDate).toBe("2026-11-20");
    expect(receiptOf(B.receiptId).lines[0]?.expiryDate).toBe("2026-12-20");
  });
});

describe("ubah tanggal ED (K11)", () => {
  test("ubah ED: audit nota + editedByName + log; tanggal sama → tanpa entri; nota dibatalkan → 404; tanggal 2027-02-30 → 422", async () => {
    expect((await lineExpiry(ROTI_LOT, "2026-11-04")).status).toBe(204);
    const r = receiptOf(ROTI_LOT.receiptId);
    expect(r.lines[0]?.expiryDate).toBe("2026-11-04");
    expect(r).toMatchObject({ editedByName: "Rina", editedAt: NOW });
    const audit = mockDb
      .get()
      .receiptAudit.filter((e) => e.receiptId === ROTI_LOT.receiptId);
    expect(audit.at(-1)).toMatchObject({
      action: "ubah",
      actorName: "Rina",
      at: NOW,
      changes: ["Sari Roti Tawar: ED 31 Okt 2026 → 4 Nov 2026"],
    });
    const list = await staffList();
    expect(list.recent[0]).toMatchObject({
      kind: "ubah_ed",
      actorName: "Rina",
      ...ROTI_LOT,
      productName: ROTI,
      qtyBase: null,
      fromDate: "2026-10-31",
      toDate: "2026-11-04",
    });
    expect(list.lots.find((l) => l.productName === ROTI)).toMatchObject({
      stage: "segera",
      expiryDate: "2026-11-04",
    });

    const counts = () => {
      const s = mockDb.get();
      return [s.receiptAudit.length, s.expiryLog.length];
    };
    const before = counts();
    vi.setSystemTime(NOW + 60_000);
    expect((await lineExpiry(ROTI_LOT, "2026-11-04")).status).toBe(204);
    expect(counts()).toEqual(before);
    expect(receiptOf(ROTI_LOT.receiptId).editedAt).toBe(NOW);

    const bad = await lineExpiry(ROTI_LOT, "2027-02-30");
    expect(bad.status).toBe(422);
    expect(await detailOf(bad)).toBe("Tanggal kedaluwarsa tidak valid");
    for (const value of [null, "", "4 Nov 2026"]) {
      expect((await lineExpiry(ROTI_LOT, value)).status).toBe(422);
    }

    mockDb.update((s) => {
      const x = s.receipts.find((y) => y.id === ROTI_LOT.receiptId);
      if (x) x.status = "dibatalkan";
    });
    const gone = await lineExpiry(ROTI_LOT, "2026-11-10");
    expect(gone.status).toBe(404);
    expect(await detailOf(gone)).toBe("Kiriman tidak ditemukan");
    expect(
      (await lineExpiry({ ...A, lineId: "l9" }, "2026-11-10")).status,
    ).toBe(404);
    expect(counts()).toEqual(before);
  });

  test("ED kosong sebelumnya ditulis sebagai — di audit", async () => {
    mockDb.update((s) => {
      const line = s.receipts.find((x) => x.id === B.receiptId)?.lines[0];
      if (line) line.expiryDate = null;
    });
    expect((await lineExpiry(B, "2026-11-30")).status).toBe(204);
    expect(mockDb.get().receiptAudit.at(-1)?.changes).toEqual([
      "Susu Bendera Kotak 200 ml: ED — → 30 Nov 2026",
    ]);
    expect(mockDb.get().expiryLog.at(-1)).toMatchObject({
      fromDate: null,
      toDate: "2026-11-30",
      lossValue: null,
    });
  });
});

describe("kedaluwarsa pemilik (K20)", () => {
  test("pemilik: lossValue = perkiraan × HPP; expiredLossValue = Σ lewat; log keluar membawa lossValue saat kejadian", async () => {
    const before = await ownerList();
    expect(before.soonDays).toBe(30);
    expect(before.lots.map((l) => [l.productName, l.lossValue])).toEqual([
      [ROTI, 45_000], // 3 × 15.000
      [SOBEK, 62_500], // 5 × 12.500
      [SKM, 82_500], // 6 × 13.750 (HPP seed)
      [SUSU_NAME, 9_600], // 2 × 4.800
    ]);
    expect(before.expiredLossValue).toBe(45_000);

    const res = await post("/api/owner/expiry-removals", {
      id: "own1",
      ...ROTI_LOT,
      qtyBase: 1,
    });
    expect(res.status).toBe(204);
    mockDb.update((s) => {
      const p = s.products.find((x) => x.name === ROTI);
      if (p) p.cost = { amount: 20_000, qtyBase: 1 };
    });
    const after = await ownerList();
    expect(after.recent[0]).toMatchObject({
      id: "own1",
      kind: "keluar",
      actorName: "Pak Ahmad",
      qtyBase: 1,
      lossValue: 15_000,
    });
    expect(after.lots[0]).toMatchObject({
      productName: ROTI,
      estimateQtyBase: 2,
      lossValue: 40_000,
    });
    expect(after.expiredLossValue).toBe(40_000);
  });

  test("tanpa HPP: lossValue null dan tidak ikut expiredLossValue", async () => {
    mockDb.update((s) => {
      const p = s.products.find((x) => x.name === ROTI);
      if (p) p.cost = null;
    });
    const body = await ownerList();
    expect(body.lots[0]).toMatchObject({ productName: ROTI, lossValue: null });
    expect(body.expiredLossValue).toBe(0);
    expect(
      (
        await post("/api/owner/expiry-removals", {
          id: "own2",
          ...ROTI_LOT,
          qtyBase: 1,
        })
      ).status,
    ).toBe(204);
    expect((await ownerList()).recent[0]?.lossValue).toBeNull();
  });

  test("pemilik ubah ED: audit atas nama pemilik; galat sama dengan staf", async () => {
    expect((await lineExpiry(A, "2026-11-25", "owner")).status).toBe(204);
    expect(mockDb.get().receiptAudit.at(-1)).toMatchObject({
      receiptId: A.receiptId,
      actorName: "Pak Ahmad",
      changes: ["Susu Bendera Kotak 200 ml: ED 20 Nov 2026 → 25 Nov 2026"],
    });
    expect(receiptOf(A.receiptId).editedByName).toBe("Pak Ahmad");
    expect((await lineExpiry(A, "2026-13-01", "owner")).status).toBe(422);
    expect(
      await json(
        await post("/api/owner/expiry-removals", { id: "y", ...A, qtyBase: 0 }),
      ),
    ).toMatchObject({ detail: "Jumlah minimal 1" });
  });

  test("tanpa sesi pemilik → 401", async () => {
    await post("/api/owner/logout", {});
    expect((await get("/api/owner/expiry")).status).toBe(401);
    expect(
      (await post("/api/owner/expiry-removals", { id: "z", ...A, qtyBase: 1 }))
        .status,
    ).toBe(401);
    expect((await lineExpiry(A, "2026-11-25", "owner")).status).toBe(401);
  });
});

describe("realm & menipis orang toko", () => {
  test.each(TUNNEL_HEADERS)(
    "header terowongan %s → 403 STAFF_LAN_ONLY di keempat path staf baru",
    async (h) => {
      const tunnel = { [h]: "1" };
      const responses = [
        await get("/api/staff/expiry", tunnel),
        await post(
          "/api/staff/expiry-removals",
          { id: "t", ...A, qtyBase: 1 },
          tunnel,
        ),
        await put(
          `/api/staff/receipts/${A.receiptId}/lines/l1/expiry`,
          { expiryDate: "2026-12-01" },
          tunnel,
        ),
        await get("/api/staff/low-stock", tunnel),
      ];
      for (const res of responses) {
        expect(res.status).toBe(403);
        expect(await codeOf(res)).toBe("STAFF_LAN_ONLY");
      }
      expect(mockDb.get().expiryLog).toEqual([]);
    },
  );

  test("menipis staf: hanya stockAlert menipis, tanpa key stock", async () => {
    mockDb.update((s) => {
      // Bimoli menipis; Roti di bawah batas tapi langka, Sobek belum dihitung, SKM nonaktif.
      const set = (name: string, fn: (p: MockProduct) => void) => {
        const p = s.products.find((x) => x.name === name);
        if (p) fn(p);
      };
      for (const p of s.products) delete s.minStock[p.id];
      for (const name of [
        "Minyak Goreng Bimoli 2 L",
        ROTI,
        SOBEK,
        SKM,
        "Gula Pasir",
      ]) {
        set(name, (p) => {
          s.minStock[p.id] = 10 * (p.units[0]?.unitSize ?? 1);
          s.stock[p.id] = 2 * (p.units[0]?.unitSize ?? 1);
        });
      }
      set(ROTI, (p) => {
        p.scarce = true;
      });
      set(SOBEK, (p) => {
        p.stockCounted = false;
      });
      set(SKM, (p) => {
        p.status = "nonaktif";
      });
    });
    const res = await get("/api/staff/low-stock");
    expect(res.status).toBe(200);
    const body = ListStaffLowStockResponse.parse(
      await json<StaffLowStockItem[]>(res),
    );
    expect(body).toEqual([
      {
        productId: productOf("Gula Pasir").id,
        productName: "Gula Pasir",
        unitName: "kg",
        unitSize: 1000,
        isCurah: true,
        minQtyBase: 10_000,
      },
      {
        productId: productOf("Minyak Goreng Bimoli 2 L").id,
        productName: "Minyak Goreng Bimoli 2 L",
        unitName: "pcs",
        unitSize: 1,
        isCurah: false,
        minQtyBase: 10,
      },
    ]);
    expect(
      [...deepKeys(body)].filter((k) => FORBIDDEN_STAFF_KEYS.includes(k)),
    ).toEqual([]);
  });
});

test("stok contoh tetap dari applySampleStock", () => {
  expect([stockOf(ROTI), stockOf(SOBEK), stockOf(SUSU_NAME)]).toEqual([
    3, 5, 14,
  ]);
});
