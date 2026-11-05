import { describe, expect, test } from "vitest";
import type { OpnameScope } from "@/shared/api/gen/shaziaMartAPI.schemas";
import type {
  MockOpnameSession,
  MockProduct,
  MockReceipt,
  MockSale,
  MockState,
  MockUser,
} from "../db";
import { createSeedState } from "../seed-data";
import { applyDiff, submitSession } from "./opname";
import { finishSession } from "./opname-finish";
import {
  opnameCategories,
  opnameProducts,
  receiptOptionsOf,
  toStaffOpnameRow,
  toStaffOpnameSession,
} from "./opname-views";

// 5 Nov 2026, jam WIB "HH.MM" → epoch ms UTC.
const T = (hm: string): number => {
  const [h = 0, m = 0] = hm.split(".").map(Number);
  return Date.UTC(2026, 10, 5, h - 7, m);
};
const SEED = createSeedState(T("06.00"));
const MIN = 60_000;
const MI_INSTAN: OpnameScope = { kind: "kategori", category: "Mi Instan" };
const SEMUA: OpnameScope = { kind: "semua", category: null };

const fresh = (): MockState => structuredClone(SEED);
const userOf = (s: MockState, name: string): MockUser => {
  const u = s.users.find((x) => x.name === name);
  if (!u) throw new Error(`seed tanpa ${name}`);
  return u;
};
const productOf = (s: Readonly<MockState>, name: string): MockProduct => {
  const p = s.products.find((x) => x.name === name);
  if (!p) throw new Error(`seed tanpa ${name}`);
  return p;
};
const INDOMIE = productOf(SEED, "Indomie Goreng").id;
const BIMOLI = productOf(SEED, "Minyak Goreng Bimoli 2 L").id;

let saleSeq = 0;
/** Penjualan Indomie pcs pada jam `at`; stok ikut turun seperti penjualan sungguhan. */
function sell(s: MockState, at: number, qtyBase: number): void {
  const p = productOf(s, "Indomie Goreng");
  saleSeq += 1;
  const sale: MockSale = {
    id: `sale-x-${saleSeq}`,
    number: `X${saleSeq}`,
    createdAt: at,
    kasirName: "Rina",
    items: [
      {
        unitId: p.units[0]?.id ?? "",
        productName: p.name,
        unitName: "pcs",
        isCurah: false,
        baseUnit: "pcs",
        unitSize: 1,
        qtyBase,
        unitPrice: 3100,
        subtotal: 3100 * qtyBase,
        wholesale: false,
      },
    ],
    total: 3100 * qtyBase,
    payments: [],
    cashReceived: 0,
    change: 0,
    customerId: null,
    status: "selesai",
    printStatus: "tercetak",
    costTotal: 0,
    voidedAt: null,
  };
  s.sales.push(sale);
  s.stock[p.id] = (s.stock[p.id] ?? 0) - qtyBase;
}

type Count = { productId: string; qtyBase: unknown; countedAt: unknown };
/** Kirim hitungan; jam HP = jam server kecuali `deviceNow` diberikan. */
function submit(
  s: MockState,
  id: string,
  items: Count[],
  now: number,
  opts: { user?: string; deviceNow?: number; scope?: OpnameScope } = {},
): MockOpnameSession {
  const res = submitSession(
    s,
    userOf(s, opts.user ?? "Rina"),
    {
      id,
      scope: opts.scope ?? MI_INSTAN,
      deviceNow: opts.deviceNow ?? now,
      items,
    },
    now,
  );
  if (res instanceof Response) throw new Error(`kirim ${id} gagal`);
  return res.session;
}
function finish(
  s: MockState,
  id: string,
  reasons: unknown[],
  now: number,
): MockOpnameSession {
  const res = finishSession(s, userOf(s, "Rina"), id, { reasons }, now);
  if (res instanceof Response) throw new Error(`simpan ${id} gagal`);
  return res;
}
const itemOf = (s: MockState, sessionId: string, productId: string) => {
  const item = s.opnameSessions
    .find((x) => x.id === sessionId)
    ?.items.find((i) => i.productId === productId);
  if (!item) throw new Error("barang tidak ada di sesi");
  return item;
};
const hilang = (productId: string) => ({
  productId,
  reason: "hilang",
  receiptId: null,
});

describe("contoh spec & jam hitung", () => {
  test("contoh spec: hitung 10 pukul 10.05 (sistem 12), terjual 3, simpan 10.20 → koreksi −2, stok 7", () => {
    const s = fresh();
    s.stock[INDOMIE] = 12;
    sell(s, T("10.10"), 3);
    const session = submit(
      s,
      "sesi-1",
      [{ productId: INDOMIE, qtyBase: 10, countedAt: T("10.05") }],
      T("10.15"),
    );
    expect(session.items[0]).toMatchObject({
      countedAt: T("10.05"),
      clockEstimated: false,
      systemQtyBase: 12,
      diffQtyBase: -2,
      value: 5200,
      state: "menunggu_alasan",
    });
    expect(session.status).toBe("menunggu_alasan");
    expect(s.stock[INDOMIE]).toBe(9);
    const done = finish(s, "sesi-1", [hilang(INDOMIE)], T("10.20"));
    expect(done).toMatchObject({ status: "selesai", finishedAt: T("10.20") });
    expect(itemOf(s, "sesi-1", INDOMIE)).toMatchObject({
      state: "disesuaikan",
      reason: "hilang",
    });
    expect(s.stock[INDOMIE]).toBe(7);
    expect(s.stockEntries.at(-1)).toEqual({
      id: expect.any(String),
      productId: INDOMIE,
      at: T("10.20"),
      effectiveAt: T("10.05"),
      qtyBase: -2,
      actorName: "Rina",
      kind: "opname",
      receiptId: null,
      lineId: null,
      opnameId: "sesi-1",
      reason: "hilang",
    });
  });

  test("K7/C1: A hitung 10 pukul 10.00 (sistem 12) disesuaikan 10.30 → stok 10; B hitung 10 pukul 10.20 dikirim 11.00 tanpa penjualan → selisih B 0, stok tetap 10", () => {
    const s = fresh();
    s.stock[INDOMIE] = 12;
    submit(
      s,
      "A",
      [{ productId: INDOMIE, qtyBase: 10, countedAt: T("10.00") }],
      T("10.01"),
    );
    finish(s, "A", [hilang(INDOMIE)], T("10.30"));
    expect(s.stock[INDOMIE]).toBe(10);
    const b = submit(
      s,
      "B",
      [{ productId: INDOMIE, qtyBase: 10, countedAt: T("10.20") }],
      T("11.00"),
      { user: "Budi" },
    );
    expect(b.items[0]).toMatchObject({
      systemQtyBase: 10,
      diffQtyBase: 0,
      state: "cocok",
    });
    expect(b.status).toBe("selesai");
    expect(b.finishedAt).toBe(T("11.00"));
    expect(s.stock[INDOMIE]).toBe(10);
    expect(s.stockEntries.filter((e) => e.kind === "opname")).toHaveLength(1);
  });

  test("K6: deviceNow telat 6 menit → semua countedAt digeser +6 menit + clockEstimated; hasil di masa depan dijepit", () => {
    const s = fresh();
    const now = T("10.30");
    const session = submit(
      s,
      "sesi-1",
      [
        {
          productId: INDOMIE,
          qtyBase: s.stock[INDOMIE],
          countedAt: T("10.10"),
        },
        { productId: BIMOLI, qtyBase: s.stock[BIMOLI], countedAt: T("10.28") },
      ],
      now,
      { deviceNow: now - 6 * MIN },
    );
    expect(itemOf(s, session.id, INDOMIE)).toMatchObject({
      countedAt: T("10.16"),
      clockEstimated: true,
    });
    // 10.28 + 6 menit = 10.34 > jam server → dijepit ke 10.30.
    expect(itemOf(s, session.id, BIMOLI)).toMatchObject({
      countedAt: now,
      clockEstimated: true,
    });

    // Jam HP hanya melenceng 2 menit: tidak diperkirakan, kecuali hasilnya di masa depan.
    const t = fresh();
    const near = submit(
      t,
      "sesi-2",
      [
        { productId: INDOMIE, qtyBase: 1, countedAt: T("10.10") },
        { productId: BIMOLI, qtyBase: 1, countedAt: T("10.31") },
      ],
      now,
      { deviceNow: now - 2 * MIN },
    );
    expect(itemOf(t, near.id, INDOMIE)).toMatchObject({
      countedAt: T("10.12"),
      clockEstimated: false,
    });
    expect(itemOf(t, near.id, BIMOLI)).toMatchObject({
      countedAt: now,
      clockEstimated: true,
    });
  });

  test("K6: draf offline dikirim 3 jam kemudian, jam HP telat 10 menit — hitung 12 pukul 08.00 (HP 07.50), terjual 3 pukul 10.00, kirim 11.00 → countedAt 08.00, sistem 12, selisih 0 (tanpa selisih palsu), clockEstimated", () => {
    const s = fresh();
    s.stock[INDOMIE] = 12;
    sell(s, T("10.00"), 3);
    const session = submit(
      s,
      "draf-pagi",
      [{ productId: INDOMIE, qtyBase: 12, countedAt: T("07.50") }],
      T("11.00"),
      { deviceNow: T("10.50") },
    );
    expect(session.items[0]).toMatchObject({
      countedAt: T("08.00"),
      clockEstimated: true,
      systemQtyBase: 12,
      diffQtyBase: 0,
      state: "cocok",
    });
    expect(session.status).toBe("selesai");
    expect(s.stock[INDOMIE]).toBe(9);
  });
});

describe("K5: hitungan terbaru yang berlaku", () => {
  test("K5: barang ditahan di sesi A, dihitung lagi di sesi B → A diganti (A otomatis selesai bila tak ada lagi yang menunggu); draf offline lebih lama dikirim setelah B → diganti", () => {
    const s = fresh();
    s.stock[INDOMIE] = 60;
    s.stock[BIMOLI] = 10;
    // A: Indomie kurang 40 (Rp104.000) → ditahan.
    submit(
      s,
      "A",
      [{ productId: INDOMIE, qtyBase: 20, countedAt: T("09.00") }],
      T("09.05"),
    );
    finish(s, "A", [hilang(INDOMIE)], T("09.10"));
    expect(itemOf(s, "A", INDOMIE).state).toBe("ditahan");
    expect(s.stock[INDOMIE]).toBe(60);

    // C: Bimoli kurang 2 menunggu alasan; satu-satunya yang menunggu di C.
    submit(
      s,
      "C",
      [{ productId: BIMOLI, qtyBase: 8, countedAt: T("09.20") }],
      T("09.25"),
    );

    // B menghitung keduanya lagi: hitungan lama yang ditahan / menunggu alasan diganti.
    const b = submit(
      s,
      "B",
      [
        { productId: INDOMIE, qtyBase: 58, countedAt: T("10.00") },
        { productId: BIMOLI, qtyBase: 9, countedAt: T("10.01") },
      ],
      T("10.05"),
    );
    expect(itemOf(s, "A", INDOMIE)).toMatchObject({
      state: "diganti",
      replacedBySessionId: "B",
    });
    expect(itemOf(s, "C", BIMOLI)).toMatchObject({
      state: "diganti",
      replacedBySessionId: "B",
    });
    const c = s.opnameSessions.find((x) => x.id === "C");
    expect(c).toMatchObject({ status: "selesai", finishedAt: T("10.05") });
    expect(itemOf(s, "B", INDOMIE)).toMatchObject({
      systemQtyBase: 60,
      diffQtyBase: -2,
      state: "menunggu_alasan",
    });
    expect(b.status).toBe("menunggu_alasan");

    // Draf offline D dihitung 09.30 (lebih lama dari B) dikirim 10.40 → diganti, B tetap berlaku.
    const d = submit(
      s,
      "D",
      [{ productId: INDOMIE, qtyBase: 50, countedAt: T("09.30") }],
      T("10.40"),
      { user: "Budi" },
    );
    expect(d.items[0]).toMatchObject({
      state: "diganti",
      replacedBySessionId: "B",
    });
    expect(d.status).toBe("selesai");
    expect(itemOf(s, "B", INDOMIE).state).toBe("menunggu_alasan");
    // finish mengabaikan barang diganti; stok hanya dikoreksi oleh B. Indomie B menggantikan
    // hitungan tertahan milik Rina sendiri → tetap ditahan walau kecil (I2); Bimoli disesuaikan.
    finish(s, "B", [hilang(INDOMIE), hilang(BIMOLI)], T("10.45"));
    expect(itemOf(s, "B", INDOMIE)).toMatchObject({
      state: "ditahan",
      value: 5200,
    });
    expect(itemOf(s, "A", INDOMIE).replacedByName).toBe("Rina");
    expect(itemOf(s, "C", BIMOLI).replacedByName).toBeNull();
    expect(s.stock[INDOMIE]).toBe(60);
    expect(s.stock[BIMOLI]).toBe(9);
  });
  test("K5: hitungan staf sebelum hitung ulang pemilik kalah (jam hitung ulang yang berlaku)", () => {
    const s = fresh();
    s.stock[INDOMIE] = 60;
    submit(
      s,
      "A",
      [{ productId: INDOMIE, qtyBase: 20, countedAt: T("10.00") }],
      T("10.01"),
    );
    finish(s, "A", [hilang(INDOMIE)], T("10.02"));
    // Pemilik menghitung ulang pukul 11.00 (diterapkan T6 dengan waktu efektif = saat itu).
    const held = itemOf(s, "A", INDOMIE);
    held.state = "dihitung_ulang";
    held.recount = {
      countedQtyBase: 58,
      countedAt: T("11.00"),
      systemQtyBase: 60,
      diffQtyBase: -2,
      value: 5200,
    };
    applyDiff(
      s,
      {
        productId: INDOMIE,
        diffQtyBase: -2,
        kind: "opname",
        sessionId: "A",
        actorName: "Pak Ahmad",
        reason: null,
        effectiveAt: T("11.00"),
      },
      T("11.00"),
    );
    const late = submit(
      s,
      "B",
      [{ productId: INDOMIE, qtyBase: 58, countedAt: T("10.30") }],
      T("11.30"),
    );
    expect(late.items[0]).toMatchObject({
      state: "diganti",
      replacedBySessionId: "A",
    });
    expect(s.stock[INDOMIE]).toBe(58);
  });
});

describe("stok awal, cocok, dan ledger", () => {
  test("kirim: cocok & stok awal langsung beres (stockCounted jadi true, entri stok_awal), sesi tanpa selisih langsung selesai", () => {
    const s = fresh();
    s.stock[INDOMIE] = 30;
    s.stock[BIMOLI] = 7;
    productOf(s, "Minyak Goreng Bimoli 2 L").stockCounted = false;
    const session = submit(
      s,
      "sesi-1",
      [
        { productId: INDOMIE, qtyBase: 30, countedAt: T("10.00") },
        { productId: BIMOLI, qtyBase: 12, countedAt: T("10.01") },
      ],
      T("10.02"),
    );
    expect(session).toMatchObject({
      status: "selesai",
      finishedAt: T("10.02"),
    });
    expect(itemOf(s, "sesi-1", INDOMIE)).toMatchObject({
      state: "cocok",
      diffQtyBase: 0,
    });
    expect(itemOf(s, "sesi-1", BIMOLI)).toMatchObject({
      state: "stok_awal",
      systemQtyBase: 7,
      diffQtyBase: 5,
      value: null,
    });
    expect(productOf(s, "Minyak Goreng Bimoli 2 L").stockCounted).toBe(true);
    expect(s.stock[BIMOLI]).toBe(12);
    expect(s.stockEntries).toEqual([
      expect.objectContaining({
        productId: BIMOLI,
        kind: "stok_awal",
        qtyBase: 5,
        at: T("10.02"),
        effectiveAt: T("10.01"),
        opnameId: "sesi-1",
        reason: null,
      }),
    ]);
  });

  test("applyDiff selisih 0 → tanpa entri", () => {
    const s = fresh();
    const before = s.stock[INDOMIE];
    applyDiff(
      s,
      {
        productId: INDOMIE,
        diffQtyBase: 0,
        kind: "opname",
        sessionId: "x",
        actorName: "Rina",
        reason: "rusak",
        effectiveAt: T("10.00"),
      },
      T("10.00"),
    );
    expect(s.stockEntries).toEqual([]);
    expect(s.stock[INDOMIE]).toBe(before);
  });

  test("422 jumlah di luar batas aman (nilai rupiah meluap) → Jumlah tidak valid, tanpa perubahan", () => {
    const s = fresh();
    const before = structuredClone(s);
    const res = submitSession(
      s,
      userOf(s, "Rina"),
      {
        id: "besar",
        scope: MI_INSTAN,
        deviceNow: T("10.00"),
        items: [
          {
            productId: INDOMIE,
            qtyBase: Number.MAX_SAFE_INTEGER,
            countedAt: T("10.00"),
          },
        ],
      },
      T("10.00"),
    );
    expect(res).toBeInstanceOf(Response);
    expect(s).toEqual(before);
  });
});

describe("lingkup & daftar hitung", () => {
  test("daftar hitung & kategori tanpa stok; kategori tertua/null di atas; suggested = pertama", () => {
    const s = fresh();
    productOf(s, "Beras Pandan Wangi 5 kg").status = "nonaktif";
    submit(
      s,
      "mi",
      [{ productId: INDOMIE, qtyBase: 1, countedAt: T("08.00") }],
      T("08.00"),
    );
    submit(
      s,
      "minyak",
      [{ productId: BIMOLI, qtyBase: 1, countedAt: T("09.00") }],
      T("09.00"),
      { scope: { kind: "kategori", category: "Minyak Goreng" } },
    );
    const { categories, allCount, suggested } = opnameCategories(s);
    const active = s.products.filter((p) => p.status !== "nonaktif");
    expect(allCount).toBe(active.length);
    const names = categories.map((c) => c.scope.category);
    // Belum pernah dihitung dulu (urut nama), lalu Mi Instan (08.00), Minyak Goreng (09.00).
    expect(names.slice(-2)).toEqual(["Mi Instan", "Minyak Goreng"]);
    expect(categories.slice(-2).map((c) => c.lastCountedAt)).toEqual([
      T("08.00"),
      T("09.00"),
    ]);
    const unseen = categories.slice(0, -2);
    expect(unseen.every((c) => c.lastCountedAt === null)).toBe(true);
    expect(unseen.map((c) => c.scope.category)).toEqual(
      [...new Set(active.map((p) => p.category))]
        .filter(
          (c): c is string =>
            c !== null && c !== "Mi Instan" && c !== "Minyak Goreng",
        )
        .sort((a, b) => a.localeCompare(b, "id")),
    );
    expect(suggested).toEqual(categories[0]?.scope);
    const beras = categories.find((c) => c.scope.category === "Beras");
    expect(beras?.productCount).toBe(
      active.filter((p) => p.category === "Beras").length,
    );

    // Sesi "semua" menghitung ulang semua lingkup.
    submit(
      s,
      "semua",
      [{ productId: INDOMIE, qtyBase: 1, countedAt: T("10.00") }],
      T("10.00"),
      {
        scope: SEMUA,
      },
    );
    expect(
      opnameCategories(s).categories.every(
        (c) => c.lastCountedAt === T("10.00"),
      ),
    ).toBe(true);

    const list = opnameProducts(s, { kind: "kategori", category: "Beras" });
    expect(list.map((p) => p.name)).toEqual(
      active
        .filter((p) => p.category === "Beras")
        .map((p) => p.name)
        .sort((a, b) => a.localeCompare(b, "id")),
    );
    expect(list.some((p) => p.name === "Beras Pandan Wangi 5 kg")).toBe(false);
    expect(opnameProducts(s, SEMUA)).toHaveLength(active.length);
  });

  test("tanpa_kategori: barang berkategori null jadi lingkup sendiri", () => {
    const s = fresh();
    productOf(s, "Indomie Goreng").category = null;
    const { categories } = opnameCategories(s);
    expect(categories.find((c) => c.scope.kind === "tanpa_kategori")).toEqual({
      scope: { kind: "tanpa_kategori", category: null },
      productCount: 1,
      lastCountedAt: null,
    });
    expect(
      opnameProducts(s, { kind: "tanpa_kategori", category: null }).map(
        (p) => p.id,
      ),
    ).toEqual([INDOMIE]);
  });
});

describe("rujukan nota & tampilan staf", () => {
  const receipt = (
    id: string,
    notaDate: string,
    createdAt: number,
    productId: string,
  ): MockReceipt => ({
    id,
    supplierId: "sup-1",
    notaDate,
    photoId: null,
    lines: [
      {
        lineId: "l1",
        productId,
        productName: "x",
        unitId: "u",
        unitName: "pcs",
        unitSize: 1,
        qty: 1,
        unitCost: 1,
        subtotal: 1,
        expiryDate: null,
        newProduct: false,
      },
    ],
    payment: {
      timing: "sekarang",
      method: "transfer",
      cashSource: null,
      dueDate: null,
    },
    paid: null,
    status: "aktif",
    createdById: "u1",
    createdByName: "Rina",
    createdAt,
    editedByName: null,
    editedAt: null,
    cancelledAt: null,
  });

  test("K4: maks. 5 nota aktif terakhir yang memuat barang (notaDate lalu createdAt terbaru dulu)", () => {
    const s = fresh();
    s.suppliers.push({ id: "sup-1", name: "CV Sumber Rejeki", lastUsedAt: 0 });
    s.receipts.push(
      receipt("r1", "2026-11-01", 1, INDOMIE),
      receipt("r2", "2026-11-03", 1, INDOMIE),
      receipt("r3", "2026-11-03", 2, INDOMIE),
      receipt("r4", "2026-10-30", 1, INDOMIE),
      receipt("r5", "2026-10-29", 1, INDOMIE),
      receipt("r6", "2026-10-28", 1, INDOMIE),
      { ...receipt("r7", "2026-11-04", 1, INDOMIE), status: "dibatalkan" },
      receipt("r8", "2026-11-04", 1, BIMOLI),
    );
    expect(receiptOptionsOf(s, INDOMIE)).toEqual([
      {
        receiptId: "r3",
        supplierName: "CV Sumber Rejeki",
        notaDate: "2026-11-03",
      },
      {
        receiptId: "r2",
        supplierName: "CV Sumber Rejeki",
        notaDate: "2026-11-03",
      },
      {
        receiptId: "r1",
        supplierName: "CV Sumber Rejeki",
        notaDate: "2026-11-01",
      },
      {
        receiptId: "r4",
        supplierName: "CV Sumber Rejeki",
        notaDate: "2026-10-30",
      },
      {
        receiptId: "r5",
        supplierName: "CV Sumber Rejeki",
        notaDate: "2026-10-29",
      },
    ]);
  });

  test("sesi staf: barang urut nama, rujukan hanya untuk barang menunggu alasan; baris riwayat menghitung selisih & ditahan", () => {
    const s = fresh();
    s.stock[INDOMIE] = 60;
    s.stock[BIMOLI] = 5;
    const session = submit(
      s,
      "sesi-1",
      [
        { productId: INDOMIE, qtyBase: 50, countedAt: T("10.00") },
        { productId: BIMOLI, qtyBase: 5, countedAt: T("10.01") },
      ],
      T("10.02"),
    );
    const view = toStaffOpnameSession(s, session);
    expect(view.items.map((i) => i.productName)).toEqual([
      "Indomie Goreng",
      "Minyak Goreng Bimoli 2 L",
    ]);
    expect(view.items[1]).toMatchObject({
      state: "cocok",
      receiptOptions: [],
      receiptRef: null,
    });
    expect(toStaffOpnameRow(session)).toEqual({
      id: "sesi-1",
      scope: MI_INSTAN,
      status: "menunggu_alasan",
      submittedAt: T("10.02"),
      finishedAt: null,
      itemCount: 2,
      diffCount: 1,
      heldCount: 0,
    });
  });
});
