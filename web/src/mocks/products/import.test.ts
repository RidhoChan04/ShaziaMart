import { beforeEach, describe, expect, test } from "vitest";
import type {
  ImportCheck,
  ImportResult,
  ImportRow,
  OwnerProduct,
  OwnerTodaySummary,
  Problem,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { IMPORT_ROWS, importRow } from "@/test/import-rows";
import { type MockProduct, mockDb } from "../db";
import {
  BIMOLI,
  cashSale,
  json,
  loginWithShift,
  ownerLogin,
  post,
  receiptInput,
  staffLogin,
} from "../handlers/test-helpers";
import { createSeedState } from "../seed-data";
import { checkImport, draftFromImportRow } from "./import";
import { soldUnitIds } from "./views";

const NOW = Date.UTC(2026, 10, 2, 7);
const CHECK = "/api/owner/product-imports/check";
const COMMIT = "/api/owner/product-imports";
const BIG_COST_NOTE = "Modal eceran diabaikan — memakai modal satuan besar";
const FROM_BIG_NOTE = "Modal dihitung dari modal satuan besar ÷ isi";

const check = async (rows: ImportRow[]) => {
  const res = await post(CHECK, { rows });
  expect(res.status).toBe(200);
  return json<ImportCheck>(res);
};
const commit = async (rows: ImportRow[]) => {
  const res = await post(COMMIT, { rows });
  expect(res.status).toBe(200);
  return json<ImportResult>(res);
};
const product = (name: string): MockProduct => {
  const p = mockDb.get().products.find((x) => x.name === name);
  if (!p) throw new Error(`tidak ada ${name}`);
  return p;
};
const costChanges = async () =>
  (await json<OwnerTodaySummary>(await fetch("/api/owner/summary/today")))
    .attention.costChanges;

const fix = (row: number, problems: string[]) => ({
  row,
  status: "perbaiki",
  problems,
  changes: [],
  notes: [],
});
const ok = (
  row: number,
  status: string,
  changes: string[] = [],
  notes: string[] = [],
) => ({ row, status, problems: [], changes, notes });

/** Barang baru yang valid; tiap kasus tabel menimpa satu atau dua sel. */
const NEW_ROW = importRow(3, {
  name: "Kacang Garuda 250 g",
  category: "Makanan Ringan",
  sellUnit: "pcs",
  cost: "3000",
  price: "4000",
});

describe("tanpa sesi pemilik", () => {
  test("Periksa dan Impor → 401", async () => {
    expect((await post(CHECK, { rows: IMPORT_ROWS })).status).toBe(401);
    expect((await post(COMMIT, { rows: IMPORT_ROWS })).status).toBe(401);
  });
});

describe("impor barang", () => {
  beforeEach(async () => {
    expect((await ownerLogin()).status).toBe(200);
  });

  test("Periksa IMPORT_ROWS → summary {ready:3, update:1, unchanged:1, invalid:6} dan status/masalah per baris sesuai tabel", async () => {
    const result = await check(IMPORT_ROWS);
    expect(result.summary).toEqual({
      ready: 3,
      update: 1,
      unchanged: 1,
      invalid: 6,
    });
    expect(result.rows).toEqual([
      ok(3, "baru", [], [BIG_COST_NOTE]),
      ok(4, "diperbarui", ["Harga modal Rp16.500 → Rp17.000"]),
      fix(5, ["Harga jual di bawah modal (Rp34.000)"]),
      fix(6, ["Barcode sudah dipakai: Indomie Goreng"]),
      fix(7, ["'Dijual per' belum diisi"]),
      ok(8, "tidak_berubah"),
      ok(10, "baru"),
      fix(11, ["Harga grosir harus lebih murah"]),
      fix(12, ["Nama sama dengan baris lain"]),
      fix(13, ["Nama sama dengan baris lain"]),
      ok(14, "baru", [], [BIG_COST_NOTE, "Kategori baru: Beras Lokal"]),
    ]);
  });

  test("Periksa tidak mengubah state (kategori, barang, peringatan)", async () => {
    const before = mockDb.get();
    await check(IMPORT_ROWS);
    const after = mockDb.get();
    expect(after.categories).not.toContain("Beras Lokal");
    expect(after.products).toHaveLength(60);
    expect(after.costAlerts).toEqual({});
    expect(after).toEqual(before);

    // Langsung ke fungsi: state masukan tidak dimutasi walau baris siap diterapkan ke salinan kerja.
    const state = createSeedState(NOW);
    const snapshot = structuredClone(state);
    const { plans } = checkImport(state, IMPORT_ROWS, NOW);
    expect([...plans.keys()]).toEqual([3, 4, 10, 14]);
    expect(state).toEqual(snapshot);
  });

  test("Impor → {created:3, updated:1, skipped:7}; Gula cost {17000,1000}; costChanges memuat Gula 16500→17000 source 'impor'; Teh Kotak stok 0 stockCounted false; Beras Cianjur cost {300000,25000}", async () => {
    expect(await commit(IMPORT_ROWS)).toEqual({
      created: 3,
      updated: 1,
      skipped: 7,
    });
    const s = mockDb.get();
    expect(s.products).toHaveLength(63);
    expect(product("Gula Pasir").cost).toEqual({
      amount: 17000,
      qtyBase: 1000,
    });
    expect(await costChanges()).toEqual([
      expect.objectContaining({
        productName: "Gula Pasir",
        unitName: "kg",
        oldCost: 16500,
        newCost: 17000,
        source: "impor",
      }),
    ]);

    const teh = product("Teh Kotak Jasmine 300 ml");
    expect(s.stock[teh.id]).toBe(0);
    expect(teh.stockCounted).toBe(false);
    expect(teh.cost).toEqual({ amount: 70000, qtyBase: 24 });
    expect(
      teh.units.map((u) => [u.name, u.unitSize, u.price, u.barcodes]),
    ).toEqual([
      ["botol", 1, 4000, ["8996001600276"]],
      ["dus", 24, 84000, []],
    ]);
    expect(s.minStock[teh.id]).toBe(24);

    const beras = product("Beras Cianjur");
    expect(beras.cost).toEqual({ amount: 300000, qtyBase: 25000 });
    expect(beras).toMatchObject({ baseUnit: "gram", isCurah: true });
    expect(s.minStock[beras.id]).toBe(50000);
    expect(s.categories.at(-1)).toBe("Beras Lokal");
    expect(product("Gas Elpiji 3 kg").category).toBe("Gas & Air Galon");
    // Baris bermasalah dilewati.
    expect(s.products.some((p) => p.name === "Kecap Bango 220 ml")).toBe(false);
    expect(s.products.some((p) => p.name.startsWith("Sabun Batang"))).toBe(
      false,
    );
  });

  test("impor file yang sama lagi → semua baris lama 'tidak_berubah'; {created:0, updated:0, skipped:11}; tetap satu butir modal Gula", async () => {
    await commit(IMPORT_ROWS);
    const again = await check(IMPORT_ROWS);
    expect(again.summary).toEqual({
      ready: 0,
      update: 0,
      unchanged: 5,
      invalid: 6,
    });
    expect(
      again.rows.filter((r) => r.status === "tidak_berubah").map((r) => r.row),
    ).toEqual([3, 4, 8, 10, 14]);
    expect(again.rows.find((r) => r.row === 14)?.notes).toEqual([
      BIG_COST_NOTE,
    ]);

    expect(await commit(IMPORT_ROWS)).toEqual({
      created: 0,
      updated: 0,
      skipped: 11,
    });
    const s = mockDb.get();
    expect(s.products).toHaveLength(63);
    expect(
      s.products.filter((p) => p.name === "Teh Kotak Jasmine 300 ml"),
    ).toHaveLength(1);
    expect((await costChanges()).map((c) => c.productName)).toEqual([
      "Gula Pasir",
    ]);
    expect(Object.keys(s.costAlerts)).toEqual([product("Gula Pasir").id]);
  });

  test("baris semua null diabaikan; 5001 baris → 422", async () => {
    const rows = [...IMPORT_ROWS, importRow(9, {}), importRow(15, {})];
    const result = await check(rows);
    expect(result.rows.map((r) => r.row)).toEqual([
      3, 4, 5, 6, 7, 8, 10, 11, 12, 13, 14,
    ]);
    expect(result.summary).toEqual({
      ready: 3,
      update: 1,
      unchanged: 1,
      invalid: 6,
    });
    expect((await commit(rows)).skipped).toBe(7);

    const many = Array.from({ length: 5001 }, (_, i) =>
      importRow(i + 3, { name: `Barang ${i}` }),
    );
    for (const path of [CHECK, COMMIT]) {
      const res = await post(path, { rows: many });
      expect(res.status).toBe(422);
      expect((await json<Problem>(res)).code).toBe("VALIDATION");
    }
    const invalidBodies = [
      {},
      { rows: [] },
      { rows: [{ row: 3, name: 5 }] },
      { rows: [{ row: 2, name: "Judul" }] },
      { rows: [NEW_ROW, NEW_ROW] },
    ];
    for (const body of invalidBodies) {
      expect((await post(CHECK, body)).status).toBe(422);
    }
    expect(mockDb.get().products).toHaveLength(63);
  });

  test.each<[Partial<ImportRow>, string | null]>([
    [{ price: "Rp3.500" }, null],
    [{ price: "3500.0" }, null],
    [{ price: "3500.5" }, "Harga jual: ketik angka saja, mis. 3500"],
    [{ barcode: "89686010947" }, "Barcode salah, scan ulang"],
    [{ barcode: "8.99269640444E+12" }, "Barcode salah, scan ulang"],
    [{ sellUnit: "kg", minStock: "2,5" }, null],
    [{ minStock: "dua" }, "Batas stok menipis: isi angka, mis. 20"],
  ])("sel %o → masalah %s", async (cells, problem) => {
    const [row] = (await check([{ ...NEW_ROW, ...cells }])).rows;
    expect(row).toEqual(problem === null ? ok(3, "baru") : fix(3, [problem]));
  });

  test("nama barang terjual dengan Dijual per lain → perbaiki \"'Dijual per' tidak bisa diubah — barang sudah terjual\"", async () => {
    await loginWithShift();
    expect((await post("/api/sales", cashSale())).status).toBe(201);
    const bimoli = product(BIMOLI);
    expect(soldUnitIds(mockDb.get()).has(bimoli.units[0]?.id ?? "")).toBe(true);
    // Stok 0 agar yang mengunci hanya penjualan (C11 juga mengunci stok ≠ 0).
    mockDb.update((s) => {
      s.stock[bimoli.id] = 0;
    });
    const [row] = (
      await check([
        importRow(3, { name: ` ${BIMOLI.toUpperCase()} `, sellUnit: "kg" }),
      ])
    ).rows;
    expect(row).toEqual(
      fix(3, ["'Dijual per' tidak bisa diubah — barang sudah terjual"]),
    );
  });

  test("ubah harga jual lewat impor → diperbarui, riwayat harga sumber 'impor'; sel kosong mempertahankan data lama (K4)", async () => {
    const before = product("Indomie Goreng");
    const rows = [
      importRow(3, { name: "indomie goreng", price: "3300" }),
      importRow(4, { name: "Kopi Kapal Api 165 g", price: "15.000" }),
    ];
    expect((await check(rows)).rows).toEqual([
      ok(3, "diperbarui", ["Harga jual Rp3.100 → Rp3.300"], [FROM_BIG_NOTE]),
      ok(4, "diperbarui", ["Harga jual Rp14.500 → Rp15.000"]),
    ]);
    expect(await commit(rows)).toEqual({ created: 0, updated: 2, skipped: 0 });

    const indomie = product("Indomie Goreng");
    const [eceran, ...rest] = before.units;
    expect(indomie).toEqual({
      ...before,
      units: [{ ...eceran, price: 3300 }, ...rest],
    });
    expect(mockDb.get().priceHistory).toEqual([
      expect.objectContaining({
        productId: indomie.id,
        oldPrice: 3100,
        newPrice: 3300,
        source: "impor",
      }),
      expect.objectContaining({
        productId: product("Kopi Kapal Api 165 g").id,
        oldPrice: 14500,
        newPrice: 15000,
        source: "impor",
      }),
    ]);
    expect(await costChanges()).toEqual([]);
  });

  test("modal dus 104000 → 104010 (isi 40, eceran tetap Rp2.600) → diperbarui dengan baris modal dus; satu butir modal 'impor'; impor ulang → tidak_berubah", async () => {
    const rows = [
      importRow(3, { name: "Indomie Goreng", bigCost: "104010" }),
      importRow(4, {
        name: "Gas Elpiji 3 kg",
        sellUnit: "buah",
        price: "22000",
        bigName: "slop",
        bigSize: "10",
        bigCost: "190000",
        bigPrice: "220000",
      }),
    ];
    expect((await check(rows)).rows).toEqual([
      ok(
        3,
        "diperbarui",
        ["Harga modal dus Rp104.000 → Rp104.010"],
        [FROM_BIG_NOTE],
      ),
      ok(4, "baru", [], [FROM_BIG_NOTE]),
    ]);
    expect(await commit(rows)).toEqual({ created: 1, updated: 1, skipped: 0 });
    const indomie = product("Indomie Goreng");
    expect(indomie.cost).toEqual({ amount: 104010, qtyBase: 40 });
    expect(mockDb.get().costAlerts).toEqual({
      [indomie.id]: {
        fromCost: { amount: 104000, qtyBase: 40 },
        changedAt: expect.any(Number),
        source: "impor",
      },
    });

    expect((await check(rows)).rows).toEqual([
      ok(3, "tidak_berubah", [], [FROM_BIG_NOTE]),
      ok(4, "tidak_berubah", [], [FROM_BIG_NOTE]),
    ]);

    // C12: butir tampil di Beranda walau modal eceran terbulatkan sama; detail sepakat.
    const [item, ...others] = await costChanges();
    expect(others).toEqual([]);
    expect(item).toMatchObject({
      productId: indomie.id,
      oldCost: 2600,
      newCost: 2600,
      source: "impor",
    });
    const detail = await json<OwnerProduct>(
      await fetch(`/api/owner/products/${indomie.id}`),
    );
    expect(detail.costAlert).toEqual({
      fromCost: { amount: 104000, qtyBase: 40 },
      changedAt: item?.changedAt,
      source: "impor",
    });

    // Modal kembali ke semula → butir dihapus, tidak tampil di mana pun.
    await commit([importRow(3, { name: "Indomie Goreng", bigCost: "104000" })]);
    expect(mockDb.get().costAlerts).toEqual({});
    expect(await costChanges()).toEqual([]);
    const back = await json<OwnerProduct>(
      await fetch(`/api/owner/products/${indomie.id}`),
    );
    expect(back.costAlert).toBeNull();
  });

  test("barcode bentrok: dua pemilik → nama pertama yang bukan bernama sama; barcode dobel di file (E ∪ L)", async () => {
    const rows = [
      importRow(3, {
        name: "Indomie Goreng",
        barcode: "089686010947",
        bigBarcode: "8992696404441",
      }),
      { ...NEW_ROW, row: 4, name: "Roti Tawar", barcode: "8996001600276" },
      {
        ...NEW_ROW,
        row: 5,
        name: "Susu Kotak",
        bigName: "dus",
        bigSize: "24",
        bigPrice: "90000",
        bigBarcode: "8996001600276",
      },
    ];
    expect((await check(rows)).rows).toEqual([
      fix(3, ["Barcode sudah dipakai: Minyak Goreng Bimoli 2 L"]),
      fix(4, ["Barcode sudah dipakai barang lain"]),
      fix(5, ["Barcode satuan besar sudah dipakai"]),
    ]);
  });

  test("Impor memvalidasi ulang: barcode yang dipakai barang lain setelah Periksa membuat baris itu dilewati", async () => {
    const row = { ...NEW_ROW, barcode: "8996001600276" };
    expect((await check([row])).summary.ready).toBe(1);
    const res = await post("/api/owner/products", {
      name: "Roti Sobek Cokelat",
      category: null,
      sellUnit: "pcs",
      barcode: "8996001600276",
      cost: null,
      price: 5000,
      tier: null,
      bigUnit: null,
      minStock: null,
    });
    expect(res.status).toBe(201);
    expect(await commit([row])).toEqual({ created: 0, updated: 0, skipped: 1 });
    expect(mockDb.get().products.some((p) => p.name === NEW_ROW.name)).toBe(
      false,
    );
  });
});

describe("impor barang yang punya barang masuk (K16)", () => {
  const RECEIPT_NOTE = "Modal diabaikan — mengikuti barang masuk";

  beforeEach(async () => {
    expect((await ownerLogin()).status).toBe(200);
    expect((await staffLogin()).status).toBe(200);
    mockDb.update((s) => {
      s.stock[product("Indomie Goreng").id] = 60;
    });
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
  });

  test("impor modal Indomie → notes memuat 'Modal diabaikan — mengikuti barang masuk'; HPP tetap {380000,140}", async () => {
    const rows = [
      importRow(3, { name: "Indomie Goreng", bigCost: "120000" }),
      importRow(4, { name: "Indomie Goreng ", cost: "2700", price: "3200" }),
    ];
    expect((await check(rows.slice(0, 1))).rows).toEqual([
      ok(3, "tidak_berubah", [], [RECEIPT_NOTE]),
    ]);
    expect((await check(rows.slice(1))).rows).toEqual([
      ok(4, "diperbarui", ["Harga jual Rp3.100 → Rp3.200"], [RECEIPT_NOTE]),
    ]);
    const alerts = mockDb.get().costAlerts;
    expect(await commit(rows.slice(1))).toEqual({
      created: 0,
      updated: 1,
      skipped: 0,
    });
    const indomie = product("Indomie Goreng");
    expect(indomie.cost).toEqual({ amount: 380_000, qtyBase: 140 });
    expect(indomie.units[0]?.price).toBe(3200);
    expect(mockDb.get().costAlerts).toEqual(alerts);
  });

  test("impor harga jual barang menunggu → diperbarui 'Harga jual — → Rp4.000'; status aktif; riwayat harga tanpa harga lama", async () => {
    const res = await post(
      "/api/staff/receipts",
      receiptInput({
        id: "draf-2",
        lines: [
          {
            lineId: "l1",
            productId: null,
            unitId: null,
            newProduct: {
              name: "Teh Pucuk Harum 350 ml",
              sellUnit: "botol",
              notaUnit: "botol",
              notaUnitSize: 1,
              barcode: null,
            },
            qty: 24,
            unitCost: 3000,
            expiryDate: null,
          },
        ],
        payment: {
          timing: "sekarang",
          method: "transfer",
          cashSource: null,
          dueDate: null,
        },
      }),
    );
    expect(res.status).toBe(201);
    const row = importRow(3, { name: "Teh Pucuk Harum 350 ml", price: "4000" });
    expect((await check([row])).rows).toEqual([
      ok(3, "diperbarui", ["Harga jual — → Rp4.000"]),
    ]);
    await commit([row]);
    const teh = product("Teh Pucuk Harum 350 ml");
    expect(teh.status).toBe("aktif");
    expect(teh.cost).toEqual({ amount: 72_000, qtyBase: 24 });
    expect(
      mockDb
        .get()
        .priceHistory.filter((e) => e.productId === teh.id)
        .map((e) => [e.oldPrice, e.newPrice, e.source]),
    ).toEqual([[null, 4000, "impor"]]);
  });

  test("impor tanpa sel modal → tanpa catatan", async () => {
    expect(
      (await check([importRow(3, { name: "Indomie Goreng", price: "3200" })]))
        .rows,
    ).toEqual([ok(3, "diperbarui", ["Harga jual Rp3.100 → Rp3.200"])]);
  });
});

describe("draftFromImportRow", () => {
  test("uang Rp/titik ribuan/.0 → bulat; isi & grosir bulat; batas koma/titik; teks di-trim, '' → null", () => {
    const { draft, problems } = draftFromImportRow(
      importRow(3, {
        name: "  Gula  Merah ",
        category: "",
        sellUnit: " kg ",
        barcode: " 8996001600276 ",
        cost: "Rp 12.000",
        price: "13500.00",
        tierMinQty: "5",
        tierPrice: "13.000",
        bigName: "karung",
        bigSize: "25.0",
        bigCost: "300000",
        bigPrice: "Rp330.000",
        minStock: "2.5",
      }),
    );
    expect(problems).toEqual([]);
    expect(draft).toEqual({
      name: "Gula  Merah",
      category: null,
      sellUnit: "kg",
      barcode: "8996001600276",
      cost: 12000,
      price: 13500,
      tierMinQty: 5,
      tierPrice: 13000,
      bigName: "karung",
      bigSize: 25,
      bigBarcode: null,
      bigCost: 300000,
      bigPrice: 330000,
      minStock: 2.5,
    });
  });

  test("sel salah → pesan per kolom berurutan, nilainya kosong", () => {
    const { draft, problems } = draftFromImportRow(
      importRow(3, {
        cost: "3,5rb",
        price: "-100",
        tierMinQty: "2.5",
        tierPrice: "abc",
        bigSize: "dua",
        bigCost: "1e5",
        bigPrice: "12.50",
        minStock: "-1",
      }),
    );
    expect(problems).toEqual([
      "Harga modal: ketik angka saja, mis. 3500",
      "Harga jual: ketik angka saja, mis. 3500",
      "Grosir: beli minimal 2 ke atas",
      "Harga grosir: ketik angka saja, mis. 3500",
      "Satuan besar: isi berapa? (min. 2)",
      "Harga modal satuan besar: ketik angka saja, mis. 3500",
      "Harga jual satuan besar: ketik angka saja, mis. 3500",
      "Batas stok menipis: isi angka, mis. 20",
    ]);
    expect(Object.values(draft).every((v) => v === null)).toBe(true);
  });
});
