import { expect, expectTypeOf, test } from "vitest";
import type { z } from "zod";
import * as ownerApi from "./gen/owner/owner";
import type {
  Attention,
  CostChangeItem,
  CreditLimitProblem,
  ExpiryAttention,
  ImportRowResult,
  OpnameFlag,
  OpnameReason,
  OwnerExpiryList,
  OwnerOpnameItem,
  OwnerOpnameSession,
  OwnerProduct,
  OwnerProductRow,
  OwnerProductUnit,
  OwnerTodaySummary,
  PriceChangedProblem,
  Product,
  ProductInput,
  ShiftClosure,
  StockMovement,
  StockOutItem,
  SupplierDebtAttention,
} from "./gen/shaziaMartAPI.schemas";
import {
  ErrorCode,
  PriceSource,
  ProductStatus,
} from "./gen/shaziaMartAPI.schemas";
import * as staffApi from "./gen/staff/staff";
import { LookupCatalogResponse } from "./gen/zod/catalog/catalog";
import {
  CheckOwnerProductImportBody,
  CreateOwnerProductBody,
  GetOwnerTodaySummaryResponse,
  OwnerLoginBody,
  RecountOpnameItemBody,
  UpdateOwnerProductPricesBody,
} from "./gen/zod/owner/owner";
import { CreateSaleBody, VoidSaleBody } from "./gen/zod/sales/sales";
import {
  CreateStaffExpiryRemovalBody,
  CreateStaffOpnameSessionBody,
  FinishStaffOpnameSessionBody,
  ListStaffOpnameProductsQueryParams,
  PutStaffLineExpiryBody,
} from "./gen/zod/staff/staff";
import { creditLimitProblemSchema, priceChangedProblemSchema } from "./problem";

test("skema zod createSale menolak body tanpa saleId", () => {
  expect(
    CreateSaleBody.safeParse({ items: [], payments: [], print: true }).success,
  ).toBe(false);
});

test("skema zod createSale menolak items kosong", () => {
  const body = {
    saleId: "s1",
    items: [],
    payments: [{ method: "cash", amount: 1000 }],
    print: true,
  };
  expect(CreateSaleBody.safeParse(body).success).toBe(false);
});

test("priceChangedProblemSchema cocok dengan tipe hasil generate", () => {
  expectTypeOf<
    z.infer<typeof priceChangedProblemSchema>
  >().toMatchTypeOf<PriceChangedProblem>();
  const ok = priceChangedProblemSchema.safeParse({
    type: "about:blank",
    title: "Harga berubah",
    status: 409,
    code: "PRICE_CHANGED",
    changes: [
      {
        unitId: "u1",
        oldUnitPrice: 1000,
        newUnitPrice: 1200,
        newNormalPrice: 1200,
        newWholesaleTiers: [{ minQty: 10, price: 1100 }],
      },
    ],
  });
  expect(ok.success).toBe(true);
});

test("creditLimitProblemSchema cocok dengan tipe hasil generate", () => {
  expectTypeOf<
    z.infer<typeof creditLimitProblemSchema>
  >().toMatchTypeOf<CreditLimitProblem>();
  const ok = creditLimitProblemSchema.safeParse({
    type: "about:blank",
    title: "Batas kasbon terlampaui",
    status: 409,
    code: "CREDIT_LIMIT",
    balance: 10000,
    creditLimit: 50000,
    attempted: 60000,
  });
  expect(ok.success).toBe(true);
});

test("ErrorCode 22 nilai termasuk OPNAME_NOT_HELD", () => {
  expect(Object.values(ErrorCode)).toHaveLength(22);
  expect(Object.values(ErrorCode)).toEqual(
    expect.arrayContaining([
      "PRODUCT_INACTIVE",
      "PRODUCT_HAS_SALES",
      "STAFF_LAN_ONLY",
      "PRODUCT_NO_PRICE",
      "RECEIPT_CANCELLED",
      "DEBT_ALREADY_PAID",
      "ID_TAKEN",
      "OPNAME_NOT_HELD",
    ]),
  );
  expect(ErrorCode.LOGIN_INVALID).toBe("LOGIN_INVALID");
});

test("enum diperluas", () => {
  expect(Object.values(ProductStatus)).toEqual([
    "aktif",
    "tidak_diambil",
    "nonaktif",
    "menunggu_harga",
  ]);
  expect(Object.values(PriceSource)).toEqual([
    "pemilik",
    "impor",
    "barang_masuk",
    "ubah_nota",
  ]);
  expectTypeOf<StockMovement["kind"]>().toEqualTypeOf<
    | "jual"
    | "batal"
    | "masuk"
    | "koreksi_masuk"
    | "batal_masuk"
    | "opname"
    | "stok_awal"
    | "keluar_kedaluwarsa"
  >();
  expectTypeOf<StockMovement["reason"]>().toEqualTypeOf<OpnameReason | null>();
  expectTypeOf<Required<StockMovement>>().toEqualTypeOf<StockMovement>();
});

test("ShiftClosure.supplierPayments, Attention.supplierDebts/awaitingPriceCount, OwnerProduct.hasReceipts", () => {
  expectTypeOf<ShiftClosure["supplierPayments"]>().toEqualTypeOf<number>();
  expectTypeOf<
    Attention["supplierDebts"]
  >().toEqualTypeOf<SupplierDebtAttention>();
  expectTypeOf<Attention["awaitingPriceCount"]>().toEqualTypeOf<number>();
  expectTypeOf<OwnerProduct["hasReceipts"]>().toEqualTypeOf<boolean>();
  expectTypeOf<keyof SupplierDebtAttention>().toEqualTypeOf<
    "overdueCount" | "overdueTotal" | "dueSoonCount" | "dueSoonTotal"
  >();
  expectTypeOf<Required<ShiftClosure>>().toEqualTypeOf<ShiftClosure>();
});

test("Product kasir tanpa field pemilik; OwnerProductUnit punya cost", () => {
  expectTypeOf<keyof Product>().toEqualTypeOf<
    "id" | "name" | "storeCode" | "isCurah" | "baseUnit" | "units"
  >();
  expectTypeOf<OwnerProductUnit["cost"]>().toEqualTypeOf<number | null>();
});

test("CreateOwnerProductBody menolak price 0 dan menerima contoh Teh Pucuk", () => {
  const teh = {
    name: "Teh Pucuk Harum 350 ml",
    category: "Minuman",
    sellUnit: "botol",
    barcode: "8996001600269",
    cost: 3000,
    price: 4000,
    tier: { minQty: 12, price: 3750 },
    bigUnit: {
      unitId: null,
      name: "dus",
      size: 24,
      barcode: null,
      cost: 70000,
      price: 84000,
    },
    minStock: 24,
  };
  expect(CreateOwnerProductBody.safeParse(teh).success).toBe(true);
  expect(CreateOwnerProductBody.safeParse({ ...teh, price: 0 }).success).toBe(
    false,
  );
  const minimal = {
    ...teh,
    category: null,
    barcode: null,
    cost: null,
    tier: null,
    bigUnit: null,
    minStock: 2.5,
  };
  expect(CreateOwnerProductBody.safeParse(minimal).success).toBe(true);
  expect(CreateOwnerProductBody.safeParse({ ...teh, name: "" }).success).toBe(
    false,
  );
  expect(
    CreateOwnerProductBody.safeParse({
      ...teh,
      bigUnit: { ...teh.bigUnit, size: 1 },
    }).success,
  ).toBe(false);
});

test("CheckOwnerProductImportBody menolak rows kosong; menerima baris semua null", () => {
  const empty = {
    row: 3,
    name: null,
    category: null,
    sellUnit: null,
    barcode: null,
    cost: null,
    price: null,
    tierMinQty: null,
    tierPrice: null,
    bigName: null,
    bigSize: null,
    bigBarcode: null,
    bigCost: null,
    bigPrice: null,
    minStock: null,
  };
  expect(CheckOwnerProductImportBody.safeParse({ rows: [] }).success).toBe(
    false,
  );
  expect(CheckOwnerProductImportBody.safeParse({ rows: [empty] }).success).toBe(
    true,
  );
  expect(
    CheckOwnerProductImportBody.safeParse({ rows: [{ ...empty, row: 2 }] })
      .success,
  ).toBe(false);
});

test("UpdateOwnerProductPricesBody menolak lines kosong dan harga 0", () => {
  const line = { unitId: "u1", tierMinQty: null, price: 3500 };
  expect(
    UpdateOwnerProductPricesBody.safeParse({ lines: [line] }).success,
  ).toBe(true);
  expect(UpdateOwnerProductPricesBody.safeParse({ lines: [] }).success).toBe(
    false,
  );
  expect(
    UpdateOwnerProductPricesBody.safeParse({ lines: [{ ...line, price: 0 }] })
      .success,
  ).toBe(false);
});

test("Attention memuat costChanges dan stockOuts", () => {
  expectTypeOf<Attention["costChanges"]>().toEqualTypeOf<CostChangeItem[]>();
  expectTypeOf<Attention["stockOuts"]>().toEqualTypeOf<StockOutItem[]>();
});

test("Attention memuat kedaluwarsa dan opname (K19)", () => {
  expectTypeOf<Attention["expiry"]>().toEqualTypeOf<ExpiryAttention>();
  expectTypeOf<Attention["opnameHeldCount"]>().toEqualTypeOf<number>();
  expectTypeOf<Attention["opnameFlags"]>().toEqualTypeOf<OpnameFlag[]>();
  expectTypeOf<Attention["opnameReplacedHeld"]>().toEqualTypeOf<number>();
  expectTypeOf<OwnerOpnameItem["replacedByName"]>().toEqualTypeOf<
    string | null
  >();
  expectTypeOf<OwnerOpnameSession["sessionLimit"]>().toEqualTypeOf<number>();
  expectTypeOf<OwnerExpiryList["today"]>().toEqualTypeOf<string>();
  expectTypeOf<keyof ExpiryAttention>().toEqualTypeOf<
    "expiredCount" | "soonCount" | "soonDays"
  >();
  expectTypeOf<keyof OpnameFlag>().toEqualTypeOf<
    "sessionId" | "scope" | "finishedAt" | "totalValue"
  >();
  expectTypeOf<Required<Attention>>().toEqualTypeOf<Attention>();
});

/** Operasi F3b-2b (kontrak opname, kedaluwarsa, menipis). */
const STOCK_OPS = {
  staff: [
    "listStaffOpnameCategories",
    "listStaffOpnameProducts",
    "listStaffOpnameSessions",
    "createStaffOpnameSession",
    "getStaffOpnameSession",
    "finishStaffOpnameSession",
    "getStaffExpiry",
    "createStaffExpiryRemoval",
    "putStaffLineExpiry",
    "listStaffLowStock",
  ],
  owner: [
    "listOwnerOpnameSessions",
    "getOwnerOpnameSession",
    "approveOpnameItem",
    "recountOpnameItem",
    "reviewOpnameSession",
    "getOwnerExpiry",
    "createOwnerExpiryRemoval",
    "putOwnerLineExpiry",
  ],
} as const;

test("operasi opname, kedaluwarsa, dan menipis ada di klien hasil generate", () => {
  const modules: Record<string, Record<string, unknown>> = {
    staff: staffApi,
    owner: ownerApi,
  };
  for (const [tag, ids] of Object.entries(STOCK_OPS)) {
    for (const id of ids) {
      expect({ id, type: typeof modules[tag]?.[id] }).toEqual({
        id,
        type: "function",
      });
    }
  }
});

test("OpnameSessionInput: id 1..64, lingkup sah, items minimal 1, qtyBase bulat >= 0", () => {
  const body = {
    id: "d1",
    scope: { kind: "kategori", category: "Mi Instan" },
    deviceNow: 1793600000000,
    items: [{ productId: "p1", qtyBase: 0, countedAt: 1793599000000 }],
  };
  const parse = (b: unknown) => CreateStaffOpnameSessionBody.safeParse(b);
  const item = body.items[0];
  expect(parse(body).success).toBe(true);
  expect(
    parse({ ...body, scope: { kind: "semua", category: null } }).success,
  ).toBe(true);
  expect(parse({ ...body, items: [] }).success).toBe(false);
  expect(parse({ ...body, id: "" }).success).toBe(false);
  expect(parse({ ...body, id: "x".repeat(65) }).success).toBe(false);
  expect(
    parse({ ...body, scope: { kind: "rak", category: null } }).success,
  ).toBe(false);
  expect(parse({ ...body, items: [{ ...item, qtyBase: -1 }] }).success).toBe(
    false,
  );
  expect(parse({ ...body, items: [{ ...item, qtyBase: 1.5 }] }).success).toBe(
    false,
  );
});

test("OpnameFinishInput: alasan staf tanpa tidak_diketahui; receiptId nullable", () => {
  const parse = (b: unknown) => FinishStaffOpnameSessionBody.safeParse(b);
  const reason = { productId: "p1", reason: "salah_input", receiptId: "r1" };
  expect(parse({ reasons: [reason] }).success).toBe(true);
  expect(parse({ reasons: [] }).success).toBe(true);
  expect(
    parse({ reasons: [{ ...reason, reason: "rusak", receiptId: null }] })
      .success,
  ).toBe(true);
  expect(
    parse({ reasons: [{ ...reason, reason: "tidak_diketahui" }] }).success,
  ).toBe(false);
});

test("kedaluwarsa & hitung ulang: keluarkan qtyBase >= 1, hitung ulang >= 0, tanggal ED ISO", () => {
  const removal = { id: "x1", receiptId: "r1", lineId: "l1", qtyBase: 1 };
  const parse = (b: unknown) => CreateStaffExpiryRemovalBody.safeParse(b);
  expect(parse(removal).success).toBe(true);
  expect(parse({ ...removal, qtyBase: 0 }).success).toBe(false);
  expect(parse({ ...removal, id: "" }).success).toBe(false);
  expect(RecountOpnameItemBody.safeParse({ qtyBase: 0 }).success).toBe(true);
  expect(RecountOpnameItemBody.safeParse({ qtyBase: -1 }).success).toBe(false);
  expect(
    PutStaffLineExpiryBody.safeParse({ expiryDate: "2027-01-31" }).success,
  ).toBe(true);
  expect(
    PutStaffLineExpiryBody.safeParse({ expiryDate: "31-01-2027" }).success,
  ).toBe(false);
});

test("query barang opname: lingkup wajib dan dibatasi", () => {
  const parse = (q: unknown) => ListStaffOpnameProductsQueryParams.safeParse(q);
  expect(parse({ lingkup: "kategori", kategori: "Mi Instan" }).success).toBe(
    true,
  );
  expect(parse({ lingkup: "semua" }).success).toBe(true);
  expect(parse({ lingkup: "tanpa_kategori" }).success).toBe(true);
  expect(parse({}).success).toBe(false);
  expect(parse({ lingkup: "rak" }).success).toBe(false);
});

test("bentuk OwnerProduct, OwnerProductRow, ProductInput, ImportRowResult: key lengkap & semua wajib", () => {
  expectTypeOf<keyof OwnerProduct>().toEqualTypeOf<
    | "id"
    | "name"
    | "storeCode"
    | "category"
    | "status"
    | "scarce"
    | "stockCounted"
    | "isCurah"
    | "baseUnit"
    | "units"
    | "cost"
    | "stock"
    | "minStock"
    | "stockAlert"
    | "hasSales"
    | "hasReceipts"
    | "costAlert"
    | "recentMovements"
    | "priceHistory"
  >();
  expectTypeOf<Required<OwnerProduct>>().toEqualTypeOf<OwnerProduct>();
  expectTypeOf<keyof OwnerProductRow>().toEqualTypeOf<
    | "id"
    | "name"
    | "storeCode"
    | "category"
    | "status"
    | "scarce"
    | "stockCounted"
    | "isCurah"
    | "baseUnit"
    | "unitName"
    | "unitSize"
    | "price"
    | "barcodes"
    | "stock"
    | "stockAlert"
  >();
  expectTypeOf<Required<OwnerProductRow>>().toEqualTypeOf<OwnerProductRow>();
  expectTypeOf<keyof ProductInput>().toEqualTypeOf<
    | "name"
    | "category"
    | "sellUnit"
    | "barcode"
    | "cost"
    | "price"
    | "tier"
    | "bigUnit"
    | "minStock"
  >();
  expectTypeOf<Required<ProductInput>>().toEqualTypeOf<ProductInput>();
  expectTypeOf<keyof ImportRowResult>().toEqualTypeOf<
    "row" | "status" | "problems" | "changes" | "notes"
  >();
  expectTypeOf<Required<ImportRowResult>>().toEqualTypeOf<ImportRowResult>();
});

test("deskripsi barcode (K3) dan minStock ada di skema zod", () => {
  const barcode =
    "EAN-13, UPC-A, EAN-8, atau GTIN-14 (ITF-14 di dus); check digit GS1 mod-10; unik di semua satuan semua barang termasuk nonaktif.";
  const input = CreateOwnerProductBody.shape;
  const big = input.bigUnit.options[0];
  const row = CheckOwnerProductImportBody.shape.rows.element.shape;
  expect(input.barcode.description).toBe(barcode);
  expect(big.shape.barcode.description).toBe(barcode);
  expect(row.barcode.description).toBe(barcode);
  expect(row.bigBarcode.description).toBe(barcode);
  expect(input.minStock.description).toBe(
    "dalam satuan eceran; ≥ 0; untuk pcs harus bulat; server mengonversi ke qtyBase",
  );
});

test("OwnerLogin menolak nama kosong dan password kosong", () => {
  const ok = { name: "budi", password: "rahasia" };
  expect(OwnerLoginBody.safeParse(ok).success).toBe(true);
  expect(OwnerLoginBody.safeParse({ ...ok, name: "" }).success).toBe(false);
  expect(OwnerLoginBody.safeParse({ ...ok, password: "" }).success).toBe(false);
});

test("fixture OwnerTodaySummary valid terhadap skema respons dan tipe", () => {
  const summary = {
    date: "2026-10-23",
    weekdayLastWeek: "Jumat",
    revenue: 1500000,
    grossProfit: 300000,
    salesCount: 30,
    newCredit: 50000,
    avgTicket: 50000,
    lastWeekRevenue: 1200000,
    hourly: Array.from({ length: 24 }, (_, hour) => ({
      hour,
      revenue: hour * 1000,
      lastWeekRevenue: hour * 900,
    })),
    attention: {
      lowStockCount: 2,
      negativeStockCount: 1,
      cashDifferences: [
        {
          shiftId: "sh1",
          kasirName: "Sari",
          closedAt: 1790000000000,
          difference: -5000,
        },
      ],
      overdueCredit: { count: 1, total: 75000 },
      costChanges: [
        {
          productId: "p1",
          productName: "Gula Pasir",
          unitName: "kg",
          oldCost: 16500,
          newCost: 17000,
          price: 18000,
          changedAt: 1790000000000,
          source: "impor",
        },
      ],
      stockOuts: [{ productId: "p2", productName: "Teh Kotak" }],
      supplierDebts: {
        overdueCount: 1,
        overdueTotal: 1442000,
        dueSoonCount: 2,
        dueSoonTotal: 350000,
      },
      awaitingPriceCount: 3,
      expiry: { expiredCount: 1, soonCount: 2, soonDays: 30 },
      opnameHeldCount: 1,
      opnameFlags: [
        {
          sessionId: "o1",
          scope: { kind: "kategori", category: "Susu" },
          finishedAt: 1790000000000,
          totalValue: 262000,
        },
      ],
      opnameReplacedHeld: 0,
    },
  } satisfies OwnerTodaySummary;
  expect(GetOwnerTodaySummaryResponse.safeParse(summary).success).toBe(true);
  const { awaitingPriceCount: _, ...noAwaiting } = summary.attention;
  expect(
    GetOwnerTodaySummaryResponse.safeParse({
      ...summary,
      attention: noAwaiting,
    }).success,
  ).toBe(false);
  const short = { ...summary, hourly: summary.hourly.slice(0, 23) };
  expect(GetOwnerTodaySummaryResponse.safeParse(short).success).toBe(false);
});

test("409 dikunci oleh code: PRICE_CHANGED lolos skema harga, CREDIT_LIMIT tidak", () => {
  const credit = {
    type: "about:blank",
    title: "Batas kasbon terlampaui",
    status: 409,
    code: "CREDIT_LIMIT",
    balance: 10000,
    creditLimit: 50000,
    attempted: 60000,
  };
  const price = {
    type: "about:blank",
    title: "Harga berubah",
    status: 409,
    code: "PRICE_CHANGED",
    changes: [
      {
        unitId: "u1",
        oldUnitPrice: 1000,
        newUnitPrice: 1200,
        newNormalPrice: 1200,
        newWholesaleTiers: [{ minQty: 10, price: 1100 }],
      },
    ],
  };
  expect(priceChangedProblemSchema.safeParse(price).success).toBe(true);
  expect(priceChangedProblemSchema.safeParse(credit).success).toBe(false);
  expect(creditLimitProblemSchema.safeParse(price).success).toBe(false);
});

test("VoidRequest: ownerPin opsional (tanpa PIN → 403 PIN_REQUIRED), alasan wajib", () => {
  expect(VoidSaleBody.safeParse({ reason: "salah input" }).success).toBe(true);
  expect(VoidSaleBody.safeParse({ ownerPin: "999999" }).success).toBe(false);
});

test("ProductUnit.unitSize minimal 1", () => {
  const match = (unitSize: number) => ({
    product: {
      id: "p1",
      name: "Gula",
      storeCode: "2001",
      isCurah: true,
      baseUnit: "gram",
      units: [
        {
          id: "u1",
          productId: "p1",
          name: "kg",
          unitSize,
          price: 18000,
          wholesaleTiers: [],
          barcodes: [],
        },
      ],
    },
    unitId: "u1",
  });
  expect(LookupCatalogResponse.safeParse(match(1000)).success).toBe(true);
  expect(LookupCatalogResponse.safeParse(match(0)).success).toBe(false);
});
