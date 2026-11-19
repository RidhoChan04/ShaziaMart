/**
 * Kontrak F3c-2a: kas laci (kas keluar, saran modal, ambil uang), Perlu perhatian dengan ambang,
 * Pengaturan, akun kasir, Shift & kas pemilik, dan QRIS harian.
 */
import { HttpResponse, http } from "msw";
import { expect, expectTypeOf, test } from "vitest";
import { server } from "@/mocks/node";
import spec from "../../../../api/openapi.yaml?raw";
import * as ownerApi from "./gen/owner/owner";
import * as settingsApi from "./gen/settings/settings";
import type {
  Attention,
  AttentionRules,
  CashierException,
  DrawerExpense,
  ExceptionAttention,
  KasirSettings,
  OpeningMismatchProblem,
  OpeningSuggestion,
  OwnerCashTake,
  OwnerDrawerExpense,
  OwnerKasirAccount,
  OwnerSettings,
  OwnerShiftDetail,
  OwnerShiftList,
  OwnerShiftRow,
  QrisDay,
  QrisDayDetail,
  QrisDayList,
  QrisUnreconciled,
  Shift,
  ShiftClosure,
  ThinMarginPreview,
} from "./gen/shaziaMartAPI.schemas";
import { ErrorCode, ExceptionKind } from "./gen/shaziaMartAPI.schemas";
import * as shiftApi from "./gen/shift/shift";
import {
  CancelOwnerCashTakeBody,
  CreateOwnerCashTakeBody,
  CreateOwnerKasirAccountBody,
  GetOwnerShiftResponse,
  GetOwnerThinMarginPreviewQueryParams,
  ListOwnerExceptionsQueryParams,
  ListOwnerQrisDaysQueryParams,
  ListOwnerShiftsQueryParams,
  MarkOwnerQrisDayBody,
  ResetOwnerKasirPinBody,
  ReviewOwnerExceptionsBody,
  UpdateOwnerKasirAccountBody,
  UpdateOwnerSettingsBody,
} from "./gen/zod/owner/owner";
import { GetKasirSettingsResponse } from "./gen/zod/settings/settings";
import {
  CancelShiftExpenseBody,
  CloseShiftResponse,
  CreateShiftExpenseBody,
  CreateShiftExpenseResponse,
  GetCurrentShiftResponse,
  GetOpeningSuggestionResponse,
  ListShiftExpensesResponseItem,
  OpenShiftBody,
  OpenShiftResponse,
} from "./gen/zod/shift/shift";

/** Key milik pemilik yang tidak pernah boleh ada di respons kasir (K-AKSES). */
const OWNER_ONLY_KEYS = [
  "openingNote",
  "suggestedOpening",
  "ownerTakeItems",
  "expenseItems",
  "markedByName",
  "attention",
  "cancelled",
  "cancelReason",
  "cancellable",
];

test("respons kasir baru hanya key allowlist; tanpa data pemilik (openingNote, ownerTakeItems, markedByName, attention)", () => {
  expectTypeOf<keyof OpeningSuggestion>().toEqualTypeOf<
    | "suggestedCash"
    | "lastKasirName"
    | "lastClosedAt"
    | "lastCountedCash"
    | "ownerTakes"
  >();
  expectTypeOf<
    Required<OpeningSuggestion>
  >().toEqualTypeOf<OpeningSuggestion>();
  expectTypeOf<OpeningSuggestion["suggestedCash"]>().toEqualTypeOf<
    number | null
  >();
  expectTypeOf<keyof DrawerExpense>().toEqualTypeOf<
    "id" | "at" | "amount" | "reason" | "kasirName" | "shiftId" | "status"
  >();
  expectTypeOf<Required<DrawerExpense>>().toEqualTypeOf<DrawerExpense>();
  expectTypeOf<DrawerExpense["status"]>().toEqualTypeOf<
    "aktif" | "dibatalkan"
  >();
  expectTypeOf<keyof KasirSettings>().toEqualTypeOf<
    | "storeName"
    | "autoPrint"
    | "curahFractions"
    | "quickCurahProductIds"
    | "qrisImageUrl"
    | "allowNegativeStock"
    | "ownerPhone"
    | "shiftMaxHours"
  >();
  expectTypeOf<KasirSettings["ownerPhone"]>().toEqualTypeOf<string | null>();
  expectTypeOf<Required<KasirSettings>>().toEqualTypeOf<KasirSettings>();
  for (const [name, schema] of [
    ["OpeningSuggestion", GetOpeningSuggestionResponse],
    ["DrawerExpense (daftar)", ListShiftExpensesResponseItem],
    ["DrawerExpense (catat)", CreateShiftExpenseResponse],
    ["KasirSettings", GetKasirSettingsResponse],
  ] as const) {
    const keys = Object.keys(schema.shape);
    expect(
      keys.filter((k) => OWNER_ONLY_KEYS.includes(k)),
      name,
    ).toEqual([]);
  }
});

test("Shift kasir (openShift, getCurrentShift) tanpa saran, catatan modal, atau data pemilik", () => {
  expectTypeOf<keyof Shift>().toEqualTypeOf<
    "id" | "kasirId" | "kasirName" | "openedAt" | "openingCash"
  >();
  expectTypeOf<Required<Shift>>().toEqualTypeOf<Shift>();
  const current = GetCurrentShiftResponse.shape.shift.options[0];
  for (const [name, keys] of [
    ["openShift", Object.keys(OpenShiftResponse.shape)],
    ["getCurrentShift", Object.keys(current.shape)],
  ] as const) {
    expect(keys, name).toEqual([
      "id",
      "kasirId",
      "kasirName",
      "openedAt",
      "openingCash",
    ]);
  }
  // Tutup shift kasir: angka laci saja, tanpa rincian pemilik.
  expect(
    Object.keys(CloseShiftResponse.shape).filter((k) =>
      OWNER_ONLY_KEYS.includes(k),
    ),
  ).toEqual([]);
});

test("rekaman pemilik membawa data pembatal; kasir hanya status", () => {
  expectTypeOf<keyof OwnerDrawerExpense>().toEqualTypeOf<
    keyof DrawerExpense | "cancelled" | "cancellable"
  >();
  expectTypeOf<OwnerDrawerExpense["cancelled"]>().toEqualTypeOf<{
    at: number;
    byName: string;
    reason: string;
    channel: "kasir" | "pemilik";
  } | null>();
  expectTypeOf<keyof OwnerCashTake>().toEqualTypeOf<
    | "id"
    | "at"
    | "amount"
    | "note"
    | "shiftId"
    | "shiftKasirName"
    | "consumedByKasirName"
    | "cancelled"
    | "cancellable"
  >();
  expectTypeOf<OwnerCashTake["cancelled"]>().toEqualTypeOf<{
    at: number;
    byName: string;
    reason: string;
  } | null>();
  expectTypeOf<Required<OwnerCashTake>>().toEqualTypeOf<OwnerCashTake>();
});

test("ShiftClosure: kas keluar & ambil uang pemilik masuk rumus laci; rincian shift pemilik", () => {
  expectTypeOf<ShiftClosure["expenses"]>().toEqualTypeOf<number>();
  expectTypeOf<ShiftClosure["ownerTakes"]>().toEqualTypeOf<number>();
  expectTypeOf<Required<ShiftClosure>>().toEqualTypeOf<ShiftClosure>();
  expectTypeOf<keyof OwnerShiftDetail>().toEqualTypeOf<
    | keyof ShiftClosure
    | "kasirName"
    | "openedAt"
    | "closedAt"
    | "suggestedOpening"
    | "openingNote"
    | "expenseItems"
    | "ownerTakeItems"
    | "qrisSales"
    | "qrisRepayments"
  >();
  expectTypeOf<OwnerShiftDetail["countedCash"]>().toEqualTypeOf<
    number | null
  >();
  expectTypeOf<OwnerShiftDetail["difference"]>().toEqualTypeOf<number | null>();
  expectTypeOf<OwnerShiftDetail["expenseItems"]>().toEqualTypeOf<
    OwnerDrawerExpense[]
  >();
  expectTypeOf<OwnerShiftDetail["ownerTakeItems"]>().toEqualTypeOf<
    OwnerCashTake[]
  >();
  expectTypeOf<keyof OwnerShiftRow>().toEqualTypeOf<
    "id" | "kasirName" | "openedAt" | "closedAt" | "countedCash" | "difference"
  >();
  expectTypeOf<keyof OwnerShiftList>().toEqualTypeOf<
    "date" | "items" | "takes" | "openKasirName"
  >();
  const open = {
    shiftId: "sh1",
    openingCash: 200_000,
    cashSales: 300_000,
    supplierPayments: 0,
    creditPayments: 0,
    saleRefunds: 0,
    expenses: 20_000,
    ownerTakes: 100_000,
    expectedCash: 380_000,
    countedCash: null,
    difference: null,
    salesCount: 12,
    kasirName: "Rina",
    openedAt: 1,
    closedAt: null,
    suggestedOpening: 200_000,
    openingNote: null,
    expenseItems: [],
    ownerTakeItems: [],
    qrisSales: 50_000,
    qrisRepayments: 0,
  } satisfies OwnerShiftDetail;
  expect(GetOwnerShiftResponse.safeParse(open).success).toBe(true);
  expect(
    GetOwnerShiftResponse.safeParse({ ...open, expenses: undefined }).success,
  ).toBe(false);
});

test("ErrorCode + CASH_TAKE_LOCKED, NAME_TAKEN, KASIR_ON_SHIFT, OPENING_MISMATCH; problem membawa suggestedCash", () => {
  expect(Object.values(ErrorCode)).toHaveLength(28);
  expect(Object.values(ErrorCode)).toEqual(
    expect.arrayContaining([
      "CASH_TAKE_LOCKED",
      "NAME_TAKEN",
      "KASIR_ON_SHIFT",
      "OPENING_MISMATCH",
    ]),
  );
  expectTypeOf<
    OpeningMismatchProblem["code"]
  >().toEqualTypeOf<"OPENING_MISMATCH">();
  expectTypeOf<
    OpeningMismatchProblem["suggestedCash"]
  >().toEqualTypeOf<number>();
});

test("ExceptionKind: tiga jenis F3c-1 di depan, lalu enam jenis baru (K2)", () => {
  expect(Object.values(ExceptionKind)).toEqual([
    "batal_transaksi",
    "batal_pelunasan",
    "kasbon_lewat_limit",
    "batal_kas_keluar",
    "selisih_kas",
    "kas_keluar",
    "serah_terima",
    "shift_lama",
    "selisih_kecil",
  ]);
  expectTypeOf<CashierException["reason"]>().toEqualTypeOf<string | null>();
  expectTypeOf<CashierException["shiftId"]>().toEqualTypeOf<string | null>();
  expectTypeOf<CashierException["durationMinutes"]>().toEqualTypeOf<
    number | null
  >();
  expectTypeOf<CashierException["kasirId"]>().toEqualTypeOf<string | null>();
  expectTypeOf<CashierException["shiftOpenedAt"]>().toEqualTypeOf<
    number | null
  >();
  expectTypeOf<CashierException["shiftClosedAt"]>().toEqualTypeOf<
    number | null
  >();
  expectTypeOf<Required<CashierException>>().toEqualTypeOf<CashierException>();
  expectTypeOf<keyof ExceptionAttention>().toEqualTypeOf<
    | "kind"
    | "count"
    | "total"
    | "shortage"
    | "from"
    | "to"
    | "latestAt"
    | "kasirId"
    | "kasirName"
    | "longestMinutes"
  >();
  expectTypeOf<ExceptionAttention["longestMinutes"]>().toEqualTypeOf<
    number | null
  >();
  expectTypeOf<
    Required<ExceptionAttention>
  >().toEqualTypeOf<ExceptionAttention>();
});

test("(K18) selisih kecil per kasir: kasirId di daftar & tinjau; jenis lain mengabaikannya", () => {
  const ok = (b: unknown) => ReviewOwnerExceptionsBody.safeParse(b).success;
  expect(ok({ kind: "selisih_kecil", upTo: 1, kasirId: "u1" })).toBe(true);
  expect(ok({ kind: "selisih_kas", upTo: 1 })).toBe(true);
  expect(ok({ kind: "selisih_kas", upTo: 1, kasirId: null })).toBe(true);
  expect(
    ListOwnerExceptionsQueryParams.safeParse({
      kind: "selisih_kecil",
      kasirId: "u1",
    }).success,
  ).toBe(true);
  expect(Object.keys(ListOwnerExceptionsQueryParams.shape)).toEqual([
    "kind",
    "kasirId",
  ]);
});

test("Attention: tanpa cashDifferences (S6), + qrisUnreconciled", () => {
  type Keys = keyof Attention;
  expectTypeOf<
    "cashDifferences" extends Keys ? true : false
  >().toEqualTypeOf<false>();
  expectTypeOf<
    Attention["qrisUnreconciled"]
  >().toEqualTypeOf<QrisUnreconciled | null>();
  expectTypeOf<keyof QrisUnreconciled>().toEqualTypeOf<
    "count" | "from" | "to"
  >();
  expectTypeOf<Required<Attention>>().toEqualTypeOf<Attention>();
  expect(spec).not.toContain("CashDifference");
  expect(spec).not.toContain("cashDifferences");
});

test("kas keluar: id 1..64, amount ≥ 1, alasan 1..200; batal = skema alasan F3c-1", () => {
  const body = { id: "e1", amount: 20_000, reason: "Beli es batu" };
  const parse = (b: unknown) => CreateShiftExpenseBody.safeParse(b).success;
  expect(parse(body)).toBe(true);
  expect(parse({ ...body, amount: 0 })).toBe(false);
  expect(parse({ ...body, id: "" })).toBe(false);
  expect(parse({ ...body, id: "x".repeat(65) })).toBe(false);
  expect(parse({ ...body, reason: "" })).toBe(false);
  expect(parse({ ...body, reason: "x".repeat(201) })).toBe(false);
  expect(Object.keys(CancelShiftExpenseBody.shape)).toEqual(["reason"]);
  expect(Object.keys(CancelOwnerCashTakeBody.shape)).toEqual(["reason"]);
  expect(CancelShiftExpenseBody.safeParse({ reason: "" }).success).toBe(false);
});

test("buka shift: openingNote opsional 1..200 atau null", () => {
  const parse = (b: unknown) => OpenShiftBody.safeParse(b).success;
  expect(parse({ openingCash: 200_000 })).toBe(true);
  expect(parse({ openingCash: 190_000, openingNote: "Salah hitung" })).toBe(
    true,
  );
  expect(parse({ openingCash: 190_000, openingNote: null })).toBe(true);
  expect(parse({ openingCash: 190_000, openingNote: "" })).toBe(false);
  expect(parse({ openingCash: 190_000, openingNote: "x".repeat(201) })).toBe(
    false,
  );
});

test("ambil uang pemilik: id 1..64, amount ≥ 1, catatan ≤ 200 atau null", () => {
  const body = { id: "t1", amount: 100_000, note: null };
  const parse = (b: unknown) => CreateOwnerCashTakeBody.safeParse(b).success;
  expect(parse(body)).toBe(true);
  expect(parse({ ...body, note: "Setoran" })).toBe(true);
  expect(parse({ id: "t1", amount: 100_000 })).toBe(true);
  expect(parse({ ...body, amount: 0 })).toBe(false);
  expect(parse({ ...body, note: "x".repeat(201) })).toBe(false);
  expect(parse({ ...body, id: "" })).toBe(false);
});

test("Pengaturan pemilik: bagian lengkap, PATCH per bagian, tanpa qrisImageUrl di PATCH", () => {
  expectTypeOf<keyof OwnerSettings>().toEqualTypeOf<
    | "store"
    | "kasir"
    | "credit"
    | "stock"
    | "report"
    | "attention"
    | "ownerPhone"
  >();
  expectTypeOf<keyof OwnerSettings["store"]>().toEqualTypeOf<
    "name" | "address" | "receiptFooter" | "qrisImageUrl"
  >();
  expectTypeOf<keyof OwnerSettings["kasir"]>().toEqualTypeOf<
    | "autoPrint"
    | "allowNegativeStock"
    | "curahFractions"
    | "quickCurahProductIds"
  >();
  expectTypeOf<keyof OwnerSettings["stock"]>().toEqualTypeOf<
    "expirySoonDays" | "opnameItemLimit" | "opnameSessionLimit"
  >();
  expectTypeOf<keyof OwnerSettings["report"]>().toEqualTypeOf<
    "thinMarginPermille" | "unsoldDays"
  >();
  expectTypeOf<OwnerSettings["attention"]>().toEqualTypeOf<AttentionRules>();
  expectTypeOf<keyof AttentionRules>().toEqualTypeOf<
    | "cashDiffMin"
    | "smallShortageWeekMax"
    | "expenseSingleMax"
    | "expenseShiftMax"
    | "shiftMaxHours"
    | "qrisDailyReconcile"
  >();
  expectTypeOf<AttentionRules["qrisDailyReconcile"]>().toEqualTypeOf<boolean>();
  expectTypeOf<keyof ThinMarginPreview>().toEqualTypeOf<"flagged" | "total">();
  const parse = (b: unknown) => UpdateOwnerSettingsBody.safeParse(b).success;
  expect(parse({})).toBe(true);
  expect(parse({ ownerPhone: null })).toBe(true);
  expect(parse({ ownerPhone: "0812-3456-7890" })).toBe(true);
  expect(parse({ ownerPhone: "abc" })).toBe(false);
  expect(
    parse({ store: { name: "Toko Baru", address: "", receiptFooter: "" } }),
  ).toBe(true);
  expect(parse({ store: { name: "", address: "", receiptFooter: "" } })).toBe(
    false,
  );
  const attention = {
    cashDiffMin: 5_000,
    smallShortageWeekMax: 20_000,
    expenseSingleMax: 50_000,
    expenseShiftMax: 150_000,
    shiftMaxHours: 12,
    qrisDailyReconcile: true,
  };
  expect(parse({ attention })).toBe(true);
  expect(parse({ attention: { ...attention, shiftMaxHours: 25 } })).toBe(false);
  expect(parse({ attention: { ...attention, shiftMaxHours: 0 } })).toBe(false);
  expect(parse({ report: { thinMarginPermille: 1001, unsoldDays: 30 } })).toBe(
    false,
  );
  expect(parse({ report: { thinMarginPermille: 150, unsoldDays: 6 } })).toBe(
    false,
  );
  expect(parse({ credit: { defaultCreditLimit: -1 } })).toBe(false);
  expect(
    parse({
      kasir: {
        autoPrint: true,
        allowNegativeStock: false,
        curahFractions: [],
        quickCurahProductIds: [],
      },
    }),
  ).toBe(false);
  expect(
    GetOwnerThinMarginPreviewQueryParams.safeParse({ permille: 1001 }).success,
  ).toBe(false);
  expect(
    GetOwnerThinMarginPreviewQueryParams.safeParse({ permille: 150 }).success,
  ).toBe(true);
});

test("akun kasir: nama 1..30, PIN 6 angka; status tanpa PIN", () => {
  expectTypeOf<keyof OwnerKasirAccount>().toEqualTypeOf<
    "id" | "name" | "active" | "onShift" | "lockedUntil"
  >();
  const create = (b: unknown) =>
    CreateOwnerKasirAccountBody.safeParse(b).success;
  expect(create({ name: "Sari", pin: "111111" })).toBe(true);
  expect(create({ name: "Sari", pin: "12345" })).toBe(false);
  expect(create({ name: "", pin: "111111" })).toBe(false);
  expect(create({ name: "x".repeat(31), pin: "111111" })).toBe(false);
  expect(UpdateOwnerKasirAccountBody.safeParse({ active: false }).success).toBe(
    true,
  );
  expect(ResetOwnerKasirPinBody.safeParse({ pin: "1234567" }).success).toBe(
    false,
  );
});

test("Shift & kas: tanggal YYYY-MM-DD", () => {
  expect(ListOwnerShiftsQueryParams.safeParse({}).success).toBe(true);
  expect(
    ListOwnerShiftsQueryParams.safeParse({ date: "2026-11-19" }).success,
  ).toBe(true);
  expect(
    ListOwnerShiftsQueryParams.safeParse({ date: "19-11-2026" }).success,
  ).toBe(false);
});

test("QRIS harian: tanda cocok/tidak_cocok, daftar per bulan atau belum dicocokkan, rincian transaksi", () => {
  expectTypeOf<keyof QrisDay>().toEqualTypeOf<
    | "date"
    | "sales"
    | "repayments"
    | "total"
    | "voidedCount"
    | "voidedTotal"
    | "status"
    | "note"
    | "markedByName"
    | "markedAt"
    | "closed"
    | "changedAfterMark"
  >();
  expectTypeOf<QrisDay["status"]>().toEqualTypeOf<
    "belum" | "cocok" | "tidak_cocok"
  >();
  expectTypeOf<keyof QrisDayList>().toEqualTypeOf<"month" | "items">();
  expectTypeOf<QrisDayDetail["items"][number]>().toEqualTypeOf<{
    at: number;
    amount: number;
    kind: "penjualan" | "pelunasan";
    kasirName: string;
    ref: string;
    status: "aktif" | "dibatalkan";
  }>();
  expect(MarkOwnerQrisDayBody.safeParse({ status: "cocok" }).success).toBe(
    true,
  );
  expect(
    MarkOwnerQrisDayBody.safeParse({ status: "tidak_cocok", note: "Kurang" })
      .success,
  ).toBe(true);
  expect(MarkOwnerQrisDayBody.safeParse({ status: "belum" }).success).toBe(
    false,
  );
  expect(
    ListOwnerQrisDaysQueryParams.safeParse({ month: "2026-11" }).success,
  ).toBe(true);
  expect(
    ListOwnerQrisDaysQueryParams.safeParse({ unreconciled: true }).success,
  ).toBe(true);
  expect(
    ListOwnerQrisDaysQueryParams.safeParse({ month: "2026-13" }).success,
  ).toBe(false);
});

/** Operasi F3c-2a per modul klien hasil generate. */
const KAS_TOKO_OPS = {
  shift: [
    "getOpeningSuggestion",
    "listShiftExpenses",
    "createShiftExpense",
    "cancelShiftExpense",
  ],
  settings: ["getQrisImage"],
  owner: [
    "getOwnerSettings",
    "updateOwnerSettings",
    "getOwnerThinMarginPreview",
    // Satu fungsi per media type body (orval splitByContentType): Content-Type ikut berkas.
    "putOwnerQrisImageWithPng",
    "putOwnerQrisImageWithJpeg",
    "listOwnerKasirAccounts",
    "createOwnerKasirAccount",
    "updateOwnerKasirAccount",
    "resetOwnerKasirPin",
    "listOwnerShifts",
    "getOwnerShift",
    "createOwnerCashTake",
    "cancelOwnerCashTake",
    "cancelOwnerExpense",
    "listOwnerQrisDays",
    "getOwnerQrisDay",
    "markOwnerQrisDay",
  ],
} as const;

test("operasi F3c-2a ada di klien hasil generate, di tag yang benar", () => {
  const modules: Record<string, Record<string, unknown>> = {
    shift: shiftApi,
    settings: settingsApi,
    owner: ownerApi,
  };
  for (const [tag, ids] of Object.entries(KAS_TOKO_OPS)) {
    for (const id of ids) {
      expect({ id, type: typeof modules[tag]?.[id] }).toEqual({
        id,
        type: "function",
      });
    }
  }
  for (const id of KAS_TOKO_OPS.owner) {
    expect(shiftApi).not.toHaveProperty(id);
    expect(settingsApi).not.toHaveProperty(id);
  }
});

test("putOwnerQrisImage: kontrak menerima PNG dan JPEG; tiap varian klien mengirim Content-Type-nya", async () => {
  const op = spec.slice(
    spec.indexOf("operationId: putOwnerQrisImage"),
    spec.indexOf("responses:", spec.indexOf("operationId: putOwnerQrisImage")),
  );
  expect(op).toContain("image/png:");
  expect(op).toContain("image/jpeg:");

  const sent: (string | null)[] = [];
  server.use(
    http.put("/api/owner/settings/qris-image", ({ request }) => {
      sent.push(request.headers.get("Content-Type"));
      return HttpResponse.json({});
    }),
  );
  const image = new Blob([new Uint8Array(4)]);
  await ownerApi.putOwnerQrisImageWithPng(image);
  await ownerApi.putOwnerQrisImageWithJpeg(image);
  expect(sent).toEqual(["image/png", "image/jpeg"]);
});

/** Skema berisi data pemilik F3c-2a (catatan modal, ambil uang, pembatal, QRIS, Pengaturan). */
const OWNER_SCHEMAS = [
  "OwnerSettings",
  "OwnerSettingsPatch",
  "StoreSettings",
  "AttentionRules",
  "ThinMarginPreview",
  "OwnerKasirAccount",
  "OwnerShiftRow",
  "OwnerShiftList",
  "OwnerShiftDetail",
  "OwnerDrawerExpense",
  "ExpenseCancel",
  "OwnerCashTake",
  "CashTakeCancel",
  "QrisDay",
  "QrisDayList",
  "QrisDayDetail",
  "QrisTransaction",
  "QrisUnreconciled",
];

test("tidak ada path non-/api/owner yang merujuk skema pemilik F3c-2a (allowlist kasir/staf)", () => {
  const lines = spec.split(/\r?\n/);
  const end = lines.indexOf("components:");
  let path = "";
  const offenders: string[] = [];
  for (const line of lines.slice(0, end)) {
    const head = /^ {2}(\/\S+):$/.exec(line)?.[1];
    if (head !== undefined) path = head;
    const ref = /#\/components\/schemas\/(\w+)"/.exec(line)?.[1];
    if (
      ref !== undefined &&
      OWNER_SCHEMAS.includes(ref) &&
      !path.startsWith("/api/owner/")
    )
      offenders.push(`${path} -> ${ref}`);
  }
  expect(offenders).toEqual([]);
  for (const name of OWNER_SCHEMAS)
    expect(spec, name).toContain(`    ${name}:`);
});
