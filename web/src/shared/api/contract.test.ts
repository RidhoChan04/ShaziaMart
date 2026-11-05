import { expect, expectTypeOf, test } from "vitest";
import type { z } from "zod";
import * as creditApi from "./gen/credit/credit";
import * as ownerApi from "./gen/owner/owner";
import * as salesApi from "./gen/sales/sales";
import type {
  Attention,
  CashierException,
  CostChangeItem,
  CreditLimitProblem,
  ExceptionAttention,
  ExpiryAttention,
  ImportRowResult,
  KasirCreditPayment,
  KasirLookupSale,
  OpnameFlag,
  OpnameReason,
  OwnerExpiryList,
  OwnerOpnameItem,
  OwnerOpnameSession,
  OwnerProduct,
  OwnerProductRow,
  OwnerProductUnit,
  OwnerSale,
  OwnerSaleRow,
  OwnerTodaySummary,
  PriceChangedProblem,
  Product,
  ProductInput,
  Sale,
  SaleRequest,
  SaleVoid,
  SearchCustomersParams,
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
  CancelCreditPaymentBody,
  CreateCreditPaymentBody,
  SearchCustomersQueryParams,
} from "./gen/zod/credit/credit";
import {
  CheckOwnerProductImportBody,
  CreateOwnerCreditPaymentBody,
  CreateOwnerProductBody,
  GetOwnerTodaySummaryResponse,
  OwnerLoginBody,
  RecountOpnameItemBody,
  ReviewOwnerExceptionsBody,
  SetOwnerCustomerCreditLimitBody,
  UpdateOwnerProductPricesBody,
} from "./gen/zod/owner/owner";
import {
  CreateSaleBody,
  LookupSalesQueryParams,
  VoidSaleBody,
} from "./gen/zod/sales/sales";
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

test("ErrorCode 24 nilai termasuk OPNAME_NOT_HELD, OUTSIDE_SHIFT, IN_OPEN_SHIFT, VOID_TOO_OLD; tanpa PIN_REQUIRED (ruling R5)", () => {
  expect(Object.values(ErrorCode)).toHaveLength(24);
  expect(Object.values(ErrorCode)).not.toContain("PIN_REQUIRED");
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
      "OUTSIDE_SHIFT",
      "IN_OPEN_SHIFT",
      "VOID_TOO_OLD",
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
      exceptions: [],
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

test("VoidRequest (ruling R4/R5, koreksi mockup M1): alasan 1..200 wajib, qrisRefundSource laci/pemilik/null, tanpa ownerPin", () => {
  const parse = (b: unknown) => VoidSaleBody.safeParse(b).success;
  expect(parse({ reason: "salah input" })).toBe(true);
  expect(parse({ reason: "x", qrisRefundSource: "laci" })).toBe(true);
  expect(parse({ reason: "x", qrisRefundSource: "pemilik" })).toBe(true);
  expect(parse({ reason: "x", qrisRefundSource: null })).toBe(true);
  expect(parse({ reason: "x", qrisRefundSource: "transfer" })).toBe(false);
  expect(parse({ reason: "" })).toBe(false);
  expect(parse({ reason: "x".repeat(201) })).toBe(false);
  expect(parse({ ownerPin: "999999" })).toBe(false);
  expect(Object.keys(VoidSaleBody.shape)).toEqual([
    "reason",
    "qrisRefundSource",
  ]);
});

test("SaleRequest (ruling R3/R5): creditLimitReason 1..200 opsional, tanpa ownerPin", () => {
  const body = {
    saleId: "s1",
    items: [{ unitId: "u1", qtyBase: 1, expectedUnitPrice: 1000 }],
    payments: [{ method: "credit", amount: 1000 }],
    customerId: "c1",
    print: false,
  };
  const parse = (b: unknown) => CreateSaleBody.safeParse(b).success;
  expect(parse(body)).toBe(true);
  expect(parse({ ...body, creditLimitReason: "hajatan" })).toBe(true);
  expect(parse({ ...body, creditLimitReason: "" })).toBe(false);
  expect(parse({ ...body, creditLimitReason: "x".repeat(201) })).toBe(false);
  expect(Object.keys(CreateSaleBody.shape)).not.toContain("ownerPin");
  expectTypeOf<keyof SaleRequest>().toEqualTypeOf<
    | "saleId"
    | "items"
    | "payments"
    | "cashReceived"
    | "customerId"
    | "print"
    | "creditLimitReason"
  >();
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

/** Operasi F3c-1 kasbon & pelunasan (K1, jawaban pemilik J0). */
const CREDIT_OPS = {
  credit: [
    "createCreditPayment",
    "listShiftCreditPayments",
    "printCreditPayment",
    "cancelCreditPayment",
  ],
  owner: [
    "listOwnerCustomers",
    "getOwnerCustomer",
    "setOwnerCustomerCreditLimit",
    "createOwnerCreditPayment",
    "cancelOwnerCreditPayment",
  ],
} as const;

test("operasi kasbon dan pelunasan ada di klien hasil generate", () => {
  const modules: Record<string, Record<string, unknown>> = {
    credit: creditApi,
    owner: ownerApi,
  };
  for (const [tag, ids] of Object.entries(CREDIT_OPS)) {
    for (const id of ids) {
      expect({ id, type: typeof modules[tag]?.[id] }).toEqual({
        id,
        type: "function",
      });
    }
  }
});

test("KasirCreditPaymentInput: id 1..64, amount >= 1, hanya tunai/qris; QRIS cashReceived null", () => {
  const tunai = {
    id: "p1",
    customerId: "c1",
    amount: 50_000,
    method: "tunai",
    cashReceived: 100_000,
    print: true,
  };
  const parse = (b: unknown) => CreateCreditPaymentBody.safeParse(b);
  expect(parse(tunai).success).toBe(true);
  expect(parse({ ...tunai, method: "qris", cashReceived: null }).success).toBe(
    true,
  );
  expect(parse({ ...tunai, cashReceived: null }).success).toBe(true);
  expect(parse({ ...tunai, amount: 0 }).success).toBe(false);
  expect(parse({ ...tunai, id: "" }).success).toBe(false);
  expect(parse({ ...tunai, id: "x".repeat(65) }).success).toBe(false);
  expect(parse({ ...tunai, method: "transfer" }).success).toBe(false);
});

test("OwnerCreditPaymentInput hanya transfer/titip; CreditLimitInput >= 0", () => {
  const body = { id: "p1", amount: 50_000, method: "transfer" };
  const parse = (b: unknown) => CreateOwnerCreditPaymentBody.safeParse(b);
  expect(parse(body).success).toBe(true);
  expect(parse({ ...body, method: "titip" }).success).toBe(true);
  expect(parse({ ...body, method: "tunai" }).success).toBe(false);
  expect(parse({ ...body, method: "qris" }).success).toBe(false);
  expect(parse({ ...body, amount: 0 }).success).toBe(false);
  expect(
    SetOwnerCustomerCreditLimitBody.safeParse({ creditLimit: 0 }).success,
  ).toBe(true);
  expect(
    SetOwnerCustomerCreditLimitBody.safeParse({ creditLimit: -1 }).success,
  ).toBe(false);
});

test("CancelCreditPaymentInput: alasan wajib, tanpa ownerPin (ruling R2)", () => {
  expect(
    CancelCreditPaymentBody.safeParse({ reason: "salah catat" }).success,
  ).toBe(true);
  expect(CancelCreditPaymentBody.safeParse({ reason: "" }).success).toBe(false);
  expect(Object.keys(CancelCreditPaymentBody.shape)).toEqual(["reason"]);
});

test("searchCustomers menerima owing", () => {
  expectTypeOf<{ owing: true }>().toMatchTypeOf<SearchCustomersParams>();
  expect(SearchCustomersQueryParams.safeParse({ owing: true }).success).toBe(
    true,
  );
  expect(Object.keys(SearchCustomersQueryParams.shape)).toEqual(["q", "owing"]);
});

test("KasirCreditPayment hanya key allowlist; ShiftClosure memuat pelunasan & pengembalian", () => {
  expectTypeOf<keyof KasirCreditPayment>().toEqualTypeOf<
    | "id"
    | "customerId"
    | "customerName"
    | "amount"
    | "method"
    | "cashReceived"
    | "change"
    | "balanceAfter"
    | "createdAt"
    | "kasirName"
    | "shiftId"
    | "status"
    | "printStatus"
  >();
  expectTypeOf<
    Required<KasirCreditPayment>
  >().toEqualTypeOf<KasirCreditPayment>();
  expectTypeOf<KasirCreditPayment["method"]>().toEqualTypeOf<
    "tunai" | "qris"
  >();
  expectTypeOf<ShiftClosure["creditPayments"]>().toEqualTypeOf<number>();
  expectTypeOf<ShiftClosure["saleRefunds"]>().toEqualTypeOf<number>();
});

/** Operasi F3c-1 kasir tanpa PIN, transaksi pemilik, dan pengecualian (ruling R4/R9/R12, J0). */
const SALE_OPS = {
  sales: [
    "createSale",
    "listShiftSales",
    "lookupSales",
    "printSale",
    "voidSale",
  ],
  owner: [
    "listOwnerSales",
    "getOwnerSale",
    "voidOwnerSale",
    "listOwnerExceptions",
    "reviewOwnerExceptions",
  ],
} as const;

test("operasi penjualan & pengecualian ada; listTodaySales sudah tidak ada (jawaban pemilik J0)", () => {
  const modules: Record<string, Record<string, unknown>> = {
    sales: salesApi,
    owner: ownerApi,
  };
  for (const [tag, ids] of Object.entries(SALE_OPS)) {
    for (const id of ids) {
      expect({ id, type: typeof modules[tag]?.[id] }).toEqual({
        id,
        type: "function",
      });
    }
  }
  expect(salesApi).not.toHaveProperty("listTodaySales");
});

test("Sale kasir hanya key allowlist + shiftId; KasirLookupSale = Sale + customerName", () => {
  type SaleKey =
    | "id"
    | "number"
    | "createdAt"
    | "kasirName"
    | "shiftId"
    | "items"
    | "total"
    | "payments"
    | "cashReceived"
    | "change"
    | "customerId"
    | "status"
    | "printStatus";
  expectTypeOf<keyof Sale>().toEqualTypeOf<SaleKey>();
  expectTypeOf<Required<Sale>>().toEqualTypeOf<Sale>();
  expectTypeOf<keyof KasirLookupSale>().toEqualTypeOf<
    SaleKey | "customerName"
  >();
  expectTypeOf<KasirLookupSale["customerName"]>().toEqualTypeOf<
    string | null
  >();
});

test("lookupSales: q 1..20 digit/tanda hubung", () => {
  const parse = (q: unknown) => LookupSalesQueryParams.safeParse({ q }).success;
  expect(parse("0145")).toBe(true);
  expect(parse("20261104-0145")).toBe(true);
  expect(parse("")).toBe(false);
  expect(parse("abc")).toBe(false);
  expect(parse("1".repeat(21))).toBe(false);
});

test("pengecualian & transaksi pemilik: bentuk key lengkap", () => {
  expectTypeOf<Attention["exceptions"]>().toEqualTypeOf<ExceptionAttention[]>();
  expectTypeOf<keyof ExceptionAttention>().toEqualTypeOf<
    "kind" | "count" | "total" | "from" | "to"
  >();
  expectTypeOf<keyof CashierException>().toEqualTypeOf<
    | "id"
    | "kind"
    | "at"
    | "kasirName"
    | "amount"
    | "reason"
    | "customerName"
    | "saleId"
    | "saleNumber"
    | "paymentId"
    | "fromClosedShift"
    | "refund"
    | "qrisToOwner"
  >();
  expectTypeOf<Required<CashierException>>().toEqualTypeOf<CashierException>();
  expectTypeOf<keyof SaleVoid>().toEqualTypeOf<
    | "at"
    | "byId"
    | "byName"
    | "reason"
    | "channel"
    | "drawerRefund"
    | "qrisRefundSource"
  >();
  expectTypeOf<keyof OwnerSaleRow>().toEqualTypeOf<
    | "id"
    | "number"
    | "createdAt"
    | "kasirName"
    | "total"
    | "methodLabel"
    | "status"
    | "shiftOpen"
  >();
  expectTypeOf<OwnerSale["voided"]>().toEqualTypeOf<SaleVoid | null>();
  expectTypeOf<OwnerSale["creditOverLimit"]>().toEqualTypeOf<{
    excess: number;
    reason: string;
  } | null>();
  expect(
    ReviewOwnerExceptionsBody.safeParse({ kind: "batal_transaksi", upTo: 1 })
      .success,
  ).toBe(true);
  expect(
    ReviewOwnerExceptionsBody.safeParse({ kind: "lain", upTo: 1 }).success,
  ).toBe(false);
});
