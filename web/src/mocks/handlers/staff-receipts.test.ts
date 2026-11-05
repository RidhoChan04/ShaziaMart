import { beforeEach, describe, expect, test, vi } from "vitest";
import type {
  ReceiptError,
  ReceiptInput,
  StaffReceipt,
  StaffReceiptRow,
  StockMovement,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { RECEIPT_TOO_LARGE } from "@/shared/lib/receipt-rules";
import { type MockProduct, mockDb } from "../db";
import { mockPhotos } from "../photos";
import {
  BIMOLI,
  deepKeys,
  FORBIDDEN_STAFF_KEYS,
  get,
  jpegBytes,
  json,
  login,
  loginWithShift,
  ownerLogin,
  post,
  receiptInput,
  staffLogin,
  unitOf,
} from "./test-helpers";

const INDOMIE = "Indomie Goreng";
const GULA = "Gula Pasir";
const BASE = "/api/staff/receipts";
const NOW = Date.UTC(2026, 10, 3, 3); // 3 Nov 2026 10.00 WIB

const productOf = (name: string): MockProduct => {
  const p = mockDb.get().products.find((x) => x.name === name);
  if (!p) throw new Error(`seed tanpa ${name}`);
  return p;
};
const stockOf = (name: string) => mockDb.get().stock[productOf(name).id];
const costOf = (name: string) => productOf(name).cost;

function updateProduct(name: string, fn: (p: MockProduct) => void): void {
  mockDb.update((s) => {
    const p = s.products.find((x) => x.name === name);
    if (!p) throw new Error(`seed tanpa ${name}`);
    fn(p);
  });
}
function setStock(name: string, qty: number): void {
  const id = productOf(name).id;
  mockDb.update((s) => {
    s.stock[id] = qty;
  });
}

const send = (body: ReceiptInput | unknown) => post(BASE, body);
const errorsOf = async (res: Response) =>
  (await json<{ errors: ReceiptError[] }>(res)).errors;
const codeOf = async (res: Response) =>
  (await json<{ code: string }>(res)).code;

const putPhoto = (id: string, bytes: Uint8Array) =>
  fetch(`/api/staff/receipt-photos/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "image/jpeg" },
    body: bytes.slice(),
  });
/** Byte respons sama persis dengan `bytes` (toEqual pada 1 MB terlalu lambat). */
const sameBytes = async (res: Response | Uint8Array, bytes: Uint8Array) => {
  const got =
    res instanceof Uint8Array ? res : new Uint8Array(await res.arrayBuffer());
  return got.length === bytes.length && got.every((b, i) => b === bytes[i]);
};

/** Ganti sesi orang toko (logout lalu login pengguna lain). */
async function switchStaff(name: string, pin: string): Promise<void> {
  await post("/api/staff/logout", {});
  expect((await staffLogin(name, pin)).status).toBe(200);
}

/** State tanpa sesi: untuk membandingkan "tidak ada yang berubah". */
const dataOf = () => {
  const {
    staffSession: _a,
    session: _b,
    ownerSession: _c,
    ...rest
  } = mockDb.get();
  return rest;
};

beforeEach(async () => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(NOW);
  await loginWithShift(1_500_000);
  expect((await staffLogin()).status).toBe(200);
  setStock(INDOMIE, 60);
  setStock(BIMOLI, 4);
  setStock(GULA, 20_000);
  updateProduct(BIMOLI, (p) => {
    p.cost = { amount: 34000, qtyBase: 1 };
  });
});

describe("terima barang masuk", () => {
  test("nota mockup → 201 total 1442000; stok 140 / 16 / 70000; HPP Indomie {380000,140}, Gula {1140000,70000}, Bimoli tetap {34000,1}", async () => {
    const res = await send(receiptInput());
    expect(res.status).toBe(201);
    const body = await json<StaffReceipt>(res);
    expect(body.total).toBe(1_442_000);
    expect(body.lines.map((l) => l.subtotal)).toEqual([
      224_000, 408_000, 810_000,
    ]);
    expect(body).toMatchObject({
      id: "draf-1",
      supplierName: "CV Sumber Rejeki",
      notaDate: "2026-11-02",
      status: "aktif",
      paymentEditable: false,
      createdAt: NOW,
      createdByName: "Rina",
      editedAt: null,
      editedByName: null,
    });
    expect(body.lines[0]).toEqual({
      lineId: "l1",
      productId: productOf(INDOMIE).id,
      productName: INDOMIE,
      unitId: unitOf(INDOMIE, "dus").id,
      unitName: "dus",
      unitSize: 40,
      qty: 2,
      unitCost: 112_000,
      subtotal: 224_000,
      expiryDate: "2027-04-20",
      newProduct: false,
    });
    expect([stockOf(INDOMIE), stockOf(BIMOLI), stockOf(GULA)]).toEqual([
      140, 16, 70_000,
    ]);
    expect(costOf(INDOMIE)).toEqual({ amount: 380_000, qtyBase: 140 });
    expect(costOf(GULA)).toEqual({ amount: 1_140_000, qtyBase: 70_000 });
    // R10: dibandingkan menurut nilai — {544000,16} ≡ {34000,1}.
    const bimoli = costOf(BIMOLI);
    expect(bimoli && bimoli.amount / bimoli.qtyBase).toBe(34_000);
  });

  test("butir modal: Indomie fromCost {104000,40} & Gula {16500,1000} bersumber barang_masuk; Bimoli tanpa butir", async () => {
    expect((await send(receiptInput())).status).toBe(201);
    const alerts = mockDb.get().costAlerts;
    expect(alerts[productOf(INDOMIE).id]).toEqual({
      fromCost: { amount: 104_000, qtyBase: 40 },
      changedAt: NOW,
      source: "barang_masuk",
    });
    expect(alerts[productOf(GULA).id]).toEqual({
      fromCost: { amount: 16_500, qtyBase: 1000 },
      changedAt: NOW,
      source: "barang_masuk",
    });
    expect(alerts[productOf(BIMOLI).id]).toBeUndefined();
  });

  test("uang keluar: shift.cashOuts = [{amount:1442000, kind:'bayar'}]; supplier 'CV Sumber Rejeki' tercatat", async () => {
    expect((await send(receiptInput())).status).toBe(201);
    const s = mockDb.get();
    expect(s.shift?.cashOuts).toEqual([
      {
        id: expect.any(String),
        at: NOW,
        amount: 1_442_000,
        receiptId: "draf-1",
        kind: "bayar",
      },
    ]);
    expect(s.suppliers).toEqual([
      { id: expect.any(String), name: "CV Sumber Rejeki", lastUsedAt: NOW },
    ]);
    expect(s.receiptAudit).toEqual([
      {
        id: expect.any(String),
        receiptId: "draf-1",
        at: NOW,
        actorName: "Rina",
        action: "buat",
        changes: [],
      },
    ]);
    // Supplier lama dengan ejaan lain tidak membuat supplier baru.
    const again = receiptInput({
      id: "draf-2",
      supplierName: " cv sumber REJEKI ",
    });
    const second = await json<StaffReceipt>(await send(again));
    expect(second.supplierName).toBe("CV Sumber Rejeki");
    expect(mockDb.get().suppliers).toHaveLength(1);
  });

  test("kirim ulang id sama → 200 nota yang sama; stok Indomie tetap 140; tetap satu cashOut dan satu audit 'buat'", async () => {
    const first = await json<StaffReceipt>(await send(receiptInput()));
    vi.setSystemTime(NOW + 60_000);
    // Isi berbeda pun tidak divalidasi/dicatat ulang: nota lama dikembalikan.
    const replay = await send(receiptInput({ supplierName: "" }));
    expect(replay.status).toBe(200);
    expect(await json<StaffReceipt>(replay)).toEqual(first);
    const s = mockDb.get();
    expect(stockOf(INDOMIE)).toBe(140);
    expect(s.shift?.cashOuts).toHaveLength(1);
    expect(s.receiptAudit).toHaveLength(1);
    expect(s.receipts).toHaveLength(1);
    expect(s.stockEntries).toHaveLength(3);
  });

  test("R7: id sama dari orang toko lain → 409 ID_TAKEN tanpa isi nota; nota Rina tidak berubah", async () => {
    expect((await send(receiptInput())).status).toBe(201);
    const before = dataOf();
    await switchStaff("Budi", "654321");
    const res = await send(receiptInput());
    expect(res.status).toBe(409);
    const body = await json<Record<string, unknown>>(res);
    expect(body.code).toBe("ID_TAKEN");
    expect(Object.keys(body)).not.toContain("lines");
    expect(JSON.stringify(body)).not.toContain("CV Sumber Rejeki");
    expect(dataOf()).toEqual(before);
  });

  test("mutasi Indomie[0] = {kind:'masuk', qtyBase:80, kasirName:'Rina', reason:null}", async () => {
    expect((await send(receiptInput())).status).toBe(201);
    expect((await ownerLogin()).status).toBe(200);
    const res = await get(`/api/owner/products/${productOf(INDOMIE).id}`);
    const movements = (await json<{ recentMovements: StockMovement[] }>(res))
      .recentMovements;
    expect(movements[0]).toEqual({
      id: expect.any(String),
      at: NOW,
      kind: "masuk",
      qtyBase: 80,
      kasirName: "Rina",
      reason: null,
    });
    expect(mockDb.get().stockEntries.map((e) => e.qtyBase)).toEqual([
      80, 12, 50_000,
    ]);
  });

  test("Sedang langka dihapus; barang 'Stok belum dihitung' tetap stockCounted false setelah barang masuk", async () => {
    updateProduct(INDOMIE, (p) => {
      p.scarce = true;
    });
    updateProduct(GULA, (p) => {
      p.stockCounted = false;
    });
    expect((await send(receiptInput())).status).toBe(201);
    expect(productOf(INDOMIE).scarce).toBe(false);
    expect(productOf(GULA).stockCounted).toBe(false);
    expect(productOf(GULA).scarce).toBe(false);
  });

  test("stok −2 → HPP {408000,12}; HPP null → {30000,10} tanpa butir modal", async () => {
    setStock(BIMOLI, -2);
    const bimoliLine = receiptInput().lines[1];
    if (!bimoliLine) throw new Error("tanpa baris Bimoli");
    const only = (id: string, patch: object) =>
      receiptInput({ id, lines: [{ ...bimoliLine, ...patch }] });
    expect((await send(only("draf-a", {}))).status).toBe(201);
    expect(costOf(BIMOLI)).toEqual({ amount: 408_000, qtyBase: 12 });
    expect(stockOf(BIMOLI)).toBe(10);

    updateProduct(BIMOLI, (p) => {
      p.cost = null;
    });
    setStock(BIMOLI, 7);
    const res = await send(only("draf-b", { qty: 10, unitCost: 3000 }));
    expect(res.status).toBe(201);
    expect(costOf(BIMOLI)).toEqual({ amount: 30_000, qtyBase: 10 });
    expect(mockDb.get().costAlerts[productOf(BIMOLI).id]).toBeUndefined();
  });

  test("barang baru Teh Botol Sosro 450 ml (botol, dus isi 24, 8996001600269) 2 dus × 96.000", async () => {
    // Katalog seed acak memuat nama mockup ini; ganti namanya agar barangnya benar-benar baru.
    mockDb.update((s) => {
      for (const p of s.products) {
        if (p.name === "Teh Botol Sosro 450 ml") p.name = "Teh Botol Sosro 1 L";
      }
    });
    const input = receiptInput({
      lines: [
        {
          lineId: "l9",
          productId: null,
          unitId: null,
          newProduct: {
            name: " Teh Botol Sosro 450 ml ",
            sellUnit: "botol",
            notaUnit: "dus",
            notaUnitSize: 24,
            barcode: "8996001600269",
          },
          qty: 2,
          unitCost: 96_000,
          expiryDate: null,
        },
      ],
    });
    const res = await send(input);
    expect(res.status).toBe(201);
    const body = await json<StaffReceipt>(res);
    const product = productOf("Teh Botol Sosro 450 ml");
    expect(product).toMatchObject({
      status: "menunggu_harga",
      storeCode: "2006",
      stockCounted: true,
      scarce: false,
      category: null,
      isCurah: false,
      baseUnit: "pcs",
      cost: { amount: 192_000, qtyBase: 48 },
    });
    expect(
      product.units.map(({ name, unitSize, price, barcodes, active }) => ({
        name,
        unitSize,
        price,
        barcodes,
        active,
      })),
    ).toEqual([
      { name: "botol", unitSize: 1, price: 0, barcodes: [], active: true },
      {
        name: "dus",
        unitSize: 24,
        price: 0,
        barcodes: ["8996001600269"],
        active: true,
      },
    ]);
    expect(stockOf("Teh Botol Sosro 450 ml")).toBe(48);
    const s = mockDb.get();
    expect(s.minStock[product.id]).toBeUndefined();
    expect(s.costAlerts[product.id]).toBeUndefined();
    expect(body.lines[0]).toMatchObject({
      productId: product.id,
      productName: "Teh Botol Sosro 450 ml",
      unitId: product.units[1]?.id,
      unitName: "dus",
      unitSize: 24,
      newProduct: true,
    });
  });

  test("barang baru curah (kg, karung isi 50) → satuan dasar gram", async () => {
    const res = await send(
      receiptInput({
        lines: [
          {
            lineId: "l1",
            productId: null,
            unitId: null,
            newProduct: {
              name: "Gula Merah",
              sellUnit: "kg",
              notaUnit: "karung",
              notaUnitSize: 50,
              barcode: null,
            },
            qty: 1,
            unitCost: 600_000,
            expiryDate: null,
          },
        ],
      }),
    );
    expect(res.status).toBe(201);
    const p = productOf("Gula Merah");
    expect(p).toMatchObject({ isCurah: true, baseUnit: "gram" });
    expect(p.units.map((u) => [u.name, u.unitSize])).toEqual([
      ["kg", 1000],
      ["karung", 50_000],
    ]);
    expect(stockOf("Gula Merah")).toBe(50_000);
    expect(p.cost).toEqual({ amount: 600_000, qtyBase: 50_000 });
  });
});

describe("penolakan atomik (422)", () => {
  test("Bimoli nonaktif → 422 errors [{lineId:'l2', field:'product', message:'Barang ini tidak dijual lagi'}]; stok Indomie tetap 60; tanpa nota, supplier, cashOut", async () => {
    updateProduct(BIMOLI, (p) => {
      p.status = "nonaktif";
    });
    const before = dataOf();
    const res = await send(receiptInput());
    expect(res.status).toBe(422);
    const body = await json<{ code: string; errors: ReceiptError[] }>(res);
    expect(body.code).toBe("VALIDATION");
    expect(body.errors).toEqual([
      {
        lineId: "l2",
        field: "product",
        message: "Barang ini tidak dijual lagi",
      },
    ]);
    expect(stockOf(INDOMIE)).toBe(60);
    expect(dataOf()).toEqual(before);
    const s = mockDb.get();
    expect(s.receipts).toEqual([]);
    expect(s.suppliers).toEqual([]);
    expect(s.shift?.cashOuts).toEqual([]);
  });

  test("barang tidak ada → product 'Barang tidak ditemukan'; satuan nonaktif/milik barang lain → unit 'Satuan ini tidak dipakai lagi'", async () => {
    updateProduct(INDOMIE, (p) => {
      const dus = p.units[1];
      if (dus) dus.active = false;
    });
    const base = receiptInput();
    const [l1, l2, l3] = base.lines;
    if (!l1 || !l2 || !l3) throw new Error("nota mockup tanpa 3 baris");
    const res = await send({
      ...base,
      lines: [
        l1,
        { ...l2, unitId: unitOf(INDOMIE, "pcs").id },
        { ...l3, productId: "tidak-ada" },
      ],
    });
    expect(res.status).toBe(422);
    expect(await errorsOf(res)).toEqual([
      { lineId: "l1", field: "unit", message: "Satuan ini tidak dipakai lagi" },
      { lineId: "l2", field: "unit", message: "Satuan ini tidak dipakai lagi" },
      { lineId: "l3", field: "product", message: "Barang tidak ditemukan" },
    ]);
  });

  test("barang menunggu harga jual tetap bisa menerima barang masuk", async () => {
    updateProduct(BIMOLI, (p) => {
      p.status = "menunggu_harga";
    });
    expect((await send(receiptInput())).status).toBe(201);
    expect(stockOf(BIMOLI)).toBe(16);
  });

  test("laci tanpa shift → 422 [{lineId:null, field:'cashSource', message:'Tidak ada shift kasir yang buka — pilih Uang pemilik atau Transfer'}]", async () => {
    mockDb.update((s) => {
      s.shift = null;
    });
    const before = dataOf();
    const res = await send(receiptInput());
    expect(res.status).toBe(422);
    expect(await errorsOf(res)).toEqual([
      {
        lineId: null,
        field: "cashSource",
        message:
          "Tidak ada shift kasir yang buka — pilih Uang pemilik atau Transfer",
      },
    ]);
    // R8: tidak pernah diam-diam diubah menjadi uang pemilik.
    expect(dataOf()).toEqual(before);
  });

  test("barang baru ' indomie goreng ' → newName 'Nama sudah dipakai barang lain'; barcode 089686010947 → newBarcode 'Barcode sudah dipakai: Indomie Goreng'", async () => {
    const res = await send(
      receiptInput({
        lines: [
          {
            lineId: "l1",
            productId: null,
            unitId: null,
            newProduct: {
              name: " indomie goreng ",
              sellUnit: "pcs",
              notaUnit: "pcs",
              notaUnitSize: 1,
              barcode: "089686010947",
            },
            qty: 1,
            unitCost: 2500,
            expiryDate: null,
          },
        ],
      }),
    );
    expect(res.status).toBe(422);
    expect(await errorsOf(res)).toEqual([
      {
        lineId: "l1",
        field: "newName",
        message: "Nama sudah dipakai barang lain",
      },
      {
        lineId: "l1",
        field: "newBarcode",
        message: "Barcode sudah dipakai: Indomie Goreng",
      },
    ]);
  });

  test("barcode satuan nonaktif tetap terpakai; galat kembar antar baris tidak digandakan", async () => {
    updateProduct(INDOMIE, (p) => {
      const dus = p.units[1];
      if (dus) dus.active = false;
    });
    const fresh = {
      productId: null,
      unitId: null,
      qty: 1,
      unitCost: 2500,
      expiryDate: null,
    };
    const res = await send(
      receiptInput({
        lines: [
          {
            ...fresh,
            lineId: "l1",
            newProduct: {
              name: "Kecap Bango",
              sellUnit: "botol",
              notaUnit: "botol",
              notaUnitSize: 1,
              barcode: "189686010944",
            },
          },
          {
            ...fresh,
            lineId: "l2",
            newProduct: {
              name: "kecap bango",
              sellUnit: "botol",
              notaUnit: "botol",
              notaUnitSize: 1,
              barcode: null,
            },
          },
        ],
      }),
    );
    expect(await errorsOf(res)).toEqual([
      {
        lineId: "l2",
        field: "newName",
        message: "Nama sama dengan baris lain",
      },
      {
        lineId: "l1",
        field: "newBarcode",
        message: "Barcode sudah dipakai: Indomie Goreng",
      },
    ]);
  });

  test("Bayar nanti jatuh tempo 2026-11-16 → tanpa cashOut; payment tersimpan", async () => {
    const payment = {
      timing: "nanti",
      method: null,
      cashSource: null,
      dueDate: "2026-11-16",
    } as const;
    const res = await send(receiptInput({ payment }));
    expect(res.status).toBe(201);
    const body = await json<StaffReceipt>(res);
    expect(body.payment).toEqual(payment);
    expect(body.paymentEditable).toBe(true);
    const s = mockDb.get();
    expect(s.shift?.cashOuts).toEqual([]);
    expect(s.receipts[0]?.payment).toEqual(payment);
    expect(s.receipts[0]?.paid).toBeNull();
  });

  test("tunai uang pemilik dan transfer → tanpa cashOut", async () => {
    const pemilik = {
      timing: "sekarang",
      method: "tunai",
      cashSource: "pemilik",
      dueDate: null,
    } as const;
    const transfer = {
      ...pemilik,
      method: "transfer",
      cashSource: null,
    } as const;
    expect((await send(receiptInput({ payment: pemilik }))).status).toBe(201);
    const second = receiptInput({ id: "draf-2", payment: transfer });
    expect((await send(second)).status).toBe(201);
    expect(mockDb.get().shift?.cashOuts).toEqual([]);
  });

  test("galat aturan bersama (validateReceipt) diteruskan: supplier kosong, tanggal setelah hari ini", async () => {
    const res = await send(
      receiptInput({ supplierName: " ", notaDate: "2026-11-04" }),
    );
    expect(await errorsOf(res)).toEqual([
      { lineId: null, field: "supplierName", message: "Supplier belum diisi" },
      {
        lineId: null,
        field: "notaDate",
        message: "Tanggal nota tidak boleh setelah hari ini",
      },
    ]);
  });

  test("R13: subtotal/total di luar batas aman → 422 unitCost; qtyBase di luar batas → 422 qty; tidak pernah 500", async () => {
    const [l1] = receiptInput().lines;
    if (!l1) throw new Error("tanpa baris");
    const huge = await send(
      receiptInput({ lines: [{ ...l1, unitCost: Number.MAX_SAFE_INTEGER }] }),
    );
    expect(huge.status).toBe(422);
    expect(await errorsOf(huge)).toEqual([
      { lineId: "l1", field: "unitCost", message: RECEIPT_TOO_LARGE },
    ]);
    // Bonus (harga 0) dengan jumlah raksasa: subtotal aman, qtyBase (× 40) tidak.
    const qty = Math.floor(Number.MAX_SAFE_INTEGER / 10);
    const bonus = await send(
      receiptInput({ lines: [{ ...l1, qty, unitCost: 0 }] }),
    );
    expect(bonus.status).toBe(422);
    expect(await errorsOf(bonus)).toEqual([
      { lineId: "l1", field: "qty", message: RECEIPT_TOO_LARGE },
    ]);
    // Nilai stok × HPP lama melewati batas → galat, bukan 500.
    setStock(INDOMIE, Number.MAX_SAFE_INTEGER - 100);
    const value = await send(receiptInput({ lines: [{ ...l1, qty: 1 }] }));
    expect(value.status).toBe(422);
    expect((await errorsOf(value))[0]?.field).toBe("qty");
    expect(mockDb.get().receipts).toEqual([]);
  });

  test("HPP lama rusak (qtyBase 0) → dianggap belum ada, tidak membagi nol", async () => {
    updateProduct(BIMOLI, (p) => {
      p.cost = { amount: 1000, qtyBase: 0 };
    });
    expect((await send(receiptInput())).status).toBe(201);
    expect(costOf(BIMOLI)).toEqual({ amount: 408_000, qtyBase: 12 });
  });

  test.each<[string, unknown]>([
    ["bukan objek", [1, 2]],
    ["tanpa id", { ...receiptInput(), id: "" }],
    ["id terlalu panjang", { ...receiptInput(), id: "x".repeat(65) }],
    ["lines bukan array", { ...receiptInput(), lines: "x" }],
    ["qty teks", { ...receiptInput(), lines: [{ lineId: "l1", qty: "2" }] }],
    ["payment kosong", { ...receiptInput(), payment: null }],
  ])(
    "body rusak (%s) → 422 VALIDATION tanpa galat baris, state tetap",
    async (_, body) => {
      const before = dataOf();
      const res = await send(body);
      expect(res.status).toBe(422);
      expect(
        await json<{ code: string; errors: unknown[] }>(res),
      ).toMatchObject({
        code: "VALIDATION",
        errors: [],
      });
      expect(dataOf()).toEqual(before);
    },
  );

  test("lineId kembar → 422 VALIDATION", async () => {
    const [l1] = receiptInput().lines;
    const res = await send(receiptInput({ lines: [l1, l1] as never }));
    expect(res.status).toBe(422);
    expect(mockDb.get().receipts).toEqual([]);
  });
});

describe("foto nota", () => {
  test("foto: PUT 200 KB JPEG → 204; GET staf & pemilik mengembalikan byte sama (image/jpeg); 1,1 MB → 422; PNG → 422; tanpa sesi → 401", async () => {
    const bytes = jpegBytes(200_000);
    expect((await putPhoto("f1", bytes)).status).toBe(204);

    const staff = await get("/api/staff/receipt-photos/f1");
    expect(staff.status).toBe(200);
    expect(staff.headers.get("Content-Type")).toBe("image/jpeg");
    expect(await sameBytes(staff, bytes)).toBe(true);

    expect((await get("/api/owner/receipt-photos/f1")).status).toBe(401);
    expect((await ownerLogin()).status).toBe(200);
    const owner = await get("/api/owner/receipt-photos/f1");
    expect(owner.status).toBe(200);
    expect(owner.headers.get("Content-Type")).toBe("image/jpeg");
    expect(await sameBytes(owner, bytes)).toBe(true);
    expect((await get("/api/owner/receipt-photos/tidak-ada")).status).toBe(404);

    const tooBig = await putPhoto("f2", jpegBytes(1_100_000));
    expect(tooBig.status).toBe(422);
    expect(await json<{ detail: string }>(tooBig)).toMatchObject({
      code: "VALIDATION",
      detail: "Foto nota terlalu besar (maks. 1 MB)",
    });
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]);
    const notJpeg = await putPhoto("f3", png);
    expect(notJpeg.status).toBe(422);
    expect(await json<{ detail: string }>(notJpeg)).toMatchObject({
      code: "VALIDATION",
      detail: "Foto nota harus JPEG",
    });
    expect((await get("/api/staff/receipt-photos/f2")).status).toBe(404);

    await post("/api/staff/logout", {});
    expect((await putPhoto("f4", bytes)).status).toBe(401);
    expect((await get("/api/staff/receipt-photos/f1")).status).toBe(401);
    expect(mockPhotos.load("f4")).toBeUndefined();
  });

  test("tepat 1 MB lolos; unggah ulang oleh pengunggah sama → 204 tanpa mengubah foto", async () => {
    const exact = jpegBytes(1024 * 1024);
    expect((await putPhoto("f1", exact)).status).toBe(204);
    expect((await putPhoto("f1", jpegBytes(10))).status).toBe(204);
    const res = await get("/api/staff/receipt-photos/f1");
    expect(await sameBytes(res, exact)).toBe(true);
  });

  test("foto terikat pengunggah: Budi GET foto Rina → 404; PUT id sama → 409 ID_TAKEN tanpa menimpa; nota Budi dengan foto Rina → 422 photoId", async () => {
    const bytes = jpegBytes(5000);
    expect((await putPhoto("f1", bytes)).status).toBe(204);
    await switchStaff("Budi", "654321");
    expect((await get("/api/staff/receipt-photos/f1")).status).toBe(404);
    const taken = await putPhoto("f1", jpegBytes(10));
    expect(taken.status).toBe(409);
    expect(await codeOf(taken)).toBe("ID_TAKEN");
    const kept = mockPhotos.load("f1");
    expect(kept && (await sameBytes(kept.bytes, bytes))).toBe(true);
    const res = await send(receiptInput({ photoId: "f1" }));
    expect(res.status).toBe(422);
    expect(await errorsOf(res)).toEqual([
      { lineId: null, field: "photoId", message: "Foto nota belum terkirim" },
    ]);
  });

  test("photoId belum di-PUT → 422 photoId 'Foto nota belum terkirim'", async () => {
    const res = await send(receiptInput({ photoId: "f-belum" }));
    expect(res.status).toBe(422);
    expect(await errorsOf(res)).toEqual([
      { lineId: null, field: "photoId", message: "Foto nota belum terkirim" },
    ]);
    expect((await putPhoto("f-belum", jpegBytes(100))).status).toBe(204);
    const ok = await send(receiptInput({ photoId: "f-belum" }));
    expect(ok.status).toBe(201);
    expect((await json<StaffReceipt>(ok)).photoId).toBe("f-belum");
  });

  test("mockDb.reset juga menghapus foto", async () => {
    expect((await putPhoto("f1", jpegBytes(100))).status).toBe(204);
    mockDb.reset();
    expect(mockPhotos.load("f1")).toBeUndefined();
  });
});

describe("daftar & detail nota staf", () => {
  test("daftar & detail: Rina melihat notanya (unitCost 112000); Budi → [] dan GET nota Rina → 404", async () => {
    expect((await send(receiptInput())).status).toBe(201);
    vi.setSystemTime(NOW + 1000);
    const later = receiptInput({ id: "draf-2", supplierName: "Toko Makmur" });
    expect((await send(later)).status).toBe(201);

    const rows = await json<StaffReceiptRow[]>(await get(BASE));
    expect(rows).toEqual([
      {
        id: "draf-2",
        supplierName: "Toko Makmur",
        notaDate: "2026-11-02",
        total: 1_442_000,
        lineCount: 3,
        status: "aktif",
        createdAt: NOW + 1000,
      },
      expect.objectContaining({ id: "draf-1", createdAt: NOW }),
    ]);
    const detail = await get(`${BASE}/draf-1`);
    expect(detail.status).toBe(200);
    expect((await json<StaffReceipt>(detail)).lines[0]?.unitCost).toBe(112_000);
    expect((await get(`${BASE}/tidak-ada`)).status).toBe(404);

    await switchStaff("Budi", "654321");
    expect(await json<StaffReceiptRow[]>(await get(BASE))).toEqual([]);
    expect((await get(`${BASE}/draf-1`)).status).toBe(404);
  });

  test("tanpa sesi orang toko (sesi kasir saja) → 401; lewat terowongan → 403 STAFF_LAN_ONLY", async () => {
    await post("/api/staff/logout", {});
    expect((await login("123456")).status).toBe(200);
    expect((await send(receiptInput())).status).toBe(401);
    expect((await get(BASE)).status).toBe(401);
    expect((await get(`${BASE}/draf-1`)).status).toBe(401);
    expect(mockDb.get().receipts).toEqual([]);
    await staffLogin();
    const tunnel = await post(BASE, receiptInput(), { "Cf-Ray": "x" });
    expect(tunnel.status).toBe(403);
    expect(await codeOf(tunnel)).toBe("STAFF_LAN_ONLY");
  });

  test("respons nota staf tidak memuat FORBIDDEN_STAFF_KEYS", async () => {
    const bodies = [
      await json(await send(receiptInput())),
      await json(await send(receiptInput())),
      await json(await get(BASE)),
      await json(await get(`${BASE}/draf-1`)),
    ];
    for (const body of bodies) {
      const keys = deepKeys(body);
      expect(FORBIDDEN_STAFF_KEYS.filter((k) => keys.has(k))).toEqual([]);
    }
  });
});
