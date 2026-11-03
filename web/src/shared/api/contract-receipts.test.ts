import { expect, expectTypeOf, test } from "vitest";
import { z } from "zod";
import type {
  DebtPayment,
  DrawerShift,
  OwnerReceipt,
  OwnerReceiptRow,
  ReceiptError,
  ReceiptInput,
  ReceiptLine,
  ReceiptLineInput,
  ReceiptPayment,
  ReceiptProblem,
  StaffProduct,
  StaffReceipt,
  StaffReceiptRow,
  StaffShift,
  StaffUnit,
  SupplierDebt,
  SupplierDebtList,
} from "./gen/shaziaMartAPI.schemas";
import { ReceiptField } from "./gen/shaziaMartAPI.schemas";
import {
  ListOwnerSupplierDebtsResponse,
  PayOwnerSupplierDebtBody,
} from "./gen/zod/owner/owner";
import * as staffZod from "./gen/zod/staff/staff";
import {
  CreateStaffReceiptBody,
  CreateStaffReceiptResponse,
  SearchStaffProductsResponse,
  UpdateStaffReceiptBody,
} from "./gen/zod/staff/staff";
import { receiptProblemSchema } from "./problem";

const NOTA = {
  id: "r1",
  supplierName: "CV Sumber Rejeki",
  notaDate: "2026-11-02",
  photoId: null,
  lines: [
    {
      lineId: "l1",
      productId: "p1",
      unitId: "u2",
      newProduct: null,
      qty: 2,
      unitCost: 112000,
      expiryDate: "2027-04-20",
    },
  ],
  payment: {
    timing: "sekarang",
    method: "tunai",
    cashSource: "laci",
    dueDate: null,
  },
} satisfies ReceiptInput;
const LINE = NOTA.lines[0];

test("StaffProduct & StaffUnit tanpa harga, modal, stok", () => {
  expectTypeOf<keyof StaffProduct>().toEqualTypeOf<
    "id" | "name" | "category" | "isCurah" | "baseUnit" | "status" | "units"
  >();
  expectTypeOf<keyof StaffUnit>().toEqualTypeOf<
    "id" | "name" | "unitSize" | "barcodes"
  >();
  expectTypeOf<keyof ReceiptLine>().not.toEqualTypeOf<"cost">();
  expectTypeOf<Required<StaffProduct>>().toEqualTypeOf<StaffProduct>();
  expectTypeOf<Required<StaffUnit>>().toEqualTypeOf<StaffUnit>();
  expectTypeOf<StaffProduct["category"]>().toEqualTypeOf<string | null>();
});

test("CreateStaffReceiptBody menerima nota mockup; menolak qty 0, unitCost −1, lines kosong", () => {
  const parse = (body: unknown) => CreateStaffReceiptBody.safeParse(body);
  expect(parse(NOTA).success).toBe(true);
  expect(parse({ ...NOTA, lines: [] }).success).toBe(false);
  expect(parse({ ...NOTA, lines: [{ ...LINE, qty: 0 }] }).success).toBe(false);
  expect(parse({ ...NOTA, lines: [{ ...LINE, unitCost: -1 }] }).success).toBe(
    false,
  );
  expect(parse({ ...NOTA, lines: [{ ...LINE, qty: 1.5 }] }).success).toBe(
    false,
  );
  expect(parse({ ...NOTA, lines: [{ ...LINE, unitCost: 0 }] }).success).toBe(
    true,
  );
  expect(parse({ ...NOTA, id: "" }).success).toBe(false);
  expect(parse({ ...NOTA, id: "x".repeat(65) }).success).toBe(false);
  expect(parse({ ...NOTA, supplierName: "" }).success).toBe(false);
  expect(parse({ ...NOTA, supplierName: "x".repeat(101) }).success).toBe(false);
  expect(parse({ ...NOTA, notaDate: "2-11-2026" }).success).toBe(false);
  expect(parse({ ...NOTA, lines: [{ ...LINE, lineId: "" }] }).success).toBe(
    false,
  );
  const many = Array.from({ length: 101 }, (_, i) => ({
    ...LINE,
    lineId: `l${i}`,
  }));
  expect(parse({ ...NOTA, lines: many }).success).toBe(false);
  expect(parse({ ...NOTA, lines: many.slice(1) }).success).toBe(true);
  const timing = { ...NOTA.payment, timing: "besok" };
  expect(parse({ ...NOTA, payment: timing }).success).toBe(false);
});

test("CreateStaffReceiptBody: barang baru dari nota dan bayar nanti", () => {
  const newProduct = {
    name: "Kecap Bango 520 ml",
    sellUnit: "botol",
    notaUnit: "dus",
    notaUnitSize: 12,
    barcode: null,
  };
  const baru = {
    ...NOTA,
    lines: [
      {
        lineId: "l2",
        productId: null,
        unitId: null,
        newProduct,
        qty: 1,
        unitCost: 210000,
        expiryDate: null,
      },
    ],
    payment: {
      timing: "nanti",
      method: null,
      cashSource: null,
      dueDate: "2026-11-16",
    },
  } satisfies ReceiptInput;
  const withNew = (np: object) => ({
    ...baru,
    lines: [{ ...baru.lines[0], newProduct: np }],
  });
  const parse = (body: unknown) => CreateStaffReceiptBody.safeParse(body);
  expect(parse(baru).success).toBe(true);
  expect(parse(withNew({ ...newProduct, notaUnitSize: 1 })).success).toBe(true);
  expect(parse(withNew({ ...newProduct, notaUnitSize: 0 })).success).toBe(
    false,
  );
  expect(parse(withNew({ ...newProduct, name: "" })).success).toBe(false);
  expect(parse(withNew({ ...newProduct, notaUnit: "" })).success).toBe(false);
  expect(
    parse(withNew({ ...newProduct, sellUnit: "x".repeat(21) })).success,
  ).toBe(false);
});

test("UpdateStaffReceiptBody: jumlah, harga beli, ED per baris; barang & satuan tidak bisa diubah", () => {
  const edit = {
    supplierName: "CV Sumber Rejeki",
    notaDate: "2026-11-02",
    lines: [
      { lineId: "l1", qty: 3, unitCost: 110000, expiryDate: "2027-04-20" },
    ],
    payment: NOTA.payment,
  };
  const parse = (body: unknown) => UpdateStaffReceiptBody.safeParse(body);
  expect(parse(edit).success).toBe(true);
  expect(parse({ ...edit, lines: [] }).success).toBe(false);
  expect(
    parse({ ...edit, lines: [{ ...edit.lines[0], qty: 0 }] }).success,
  ).toBe(false);
  const parsed = parse({
    ...edit,
    lines: [{ ...edit.lines[0], productId: "p9" }],
  });
  expect(parsed.data?.lines[0]).not.toHaveProperty("productId");
});

test("bentuk nota & utang: key lengkap & semua wajib", () => {
  expectTypeOf<keyof ReceiptPayment>().toEqualTypeOf<
    "timing" | "method" | "cashSource" | "dueDate"
  >();
  expectTypeOf<Required<ReceiptPayment>>().toEqualTypeOf<ReceiptPayment>();
  expectTypeOf<keyof ReceiptLineInput>().toEqualTypeOf<
    | "lineId"
    | "productId"
    | "unitId"
    | "newProduct"
    | "qty"
    | "unitCost"
    | "expiryDate"
  >();
  expectTypeOf<Required<ReceiptLineInput>>().toEqualTypeOf<ReceiptLineInput>();
  expectTypeOf<keyof ReceiptLine>().toEqualTypeOf<
    | "lineId"
    | "productId"
    | "productName"
    | "unitId"
    | "unitName"
    | "unitSize"
    | "qty"
    | "unitCost"
    | "subtotal"
    | "expiryDate"
    | "newProduct"
  >();
  expectTypeOf<Required<ReceiptLine>>().toEqualTypeOf<ReceiptLine>();
  type StaffReceiptKey =
    | "id"
    | "supplierName"
    | "notaDate"
    | "photoId"
    | "lines"
    | "payment"
    | "paymentEditable"
    | "total"
    | "status"
    | "createdAt"
    | "createdByName"
    | "editedAt"
    | "editedByName";
  expectTypeOf<keyof StaffReceipt>().toEqualTypeOf<StaffReceiptKey>();
  expectTypeOf<Required<StaffReceipt>>().toEqualTypeOf<StaffReceipt>();
  expectTypeOf<keyof OwnerReceipt>().toEqualTypeOf<
    StaffReceiptKey | "paid" | "cancelledAt" | "audit"
  >();
  // allOf menjadi intersection: cukup pastikan tidak ada key opsional.
  expectTypeOf<OwnerReceipt>().toMatchTypeOf<Required<OwnerReceipt>>();
  expectTypeOf<OwnerReceipt["paid"]>().toEqualTypeOf<DebtPayment | null>();
  expectTypeOf<keyof StaffReceiptRow>().toEqualTypeOf<
    | "id"
    | "supplierName"
    | "notaDate"
    | "total"
    | "lineCount"
    | "status"
    | "createdAt"
  >();
  expectTypeOf<keyof OwnerReceiptRow>().toEqualTypeOf<
    | "id"
    | "supplierName"
    | "notaDate"
    | "total"
    | "lineCount"
    | "status"
    | "payment"
    | "paid"
    | "createdAt"
    | "createdByName"
    | "editedByName"
  >();
  expectTypeOf<Required<OwnerReceiptRow>>().toEqualTypeOf<OwnerReceiptRow>();
  expectTypeOf<keyof SupplierDebt>().toEqualTypeOf<
    | "receiptId"
    | "supplierName"
    | "notaDate"
    | "amount"
    | "dueDate"
    | "paid"
    | "photoId"
    | "createdAt"
    | "createdByName"
  >();
  expectTypeOf<Required<SupplierDebt>>().toEqualTypeOf<SupplierDebt>();
  expectTypeOf<keyof SupplierDebtList>().toEqualTypeOf<
    "debts" | "drawerShift"
  >();
  expectTypeOf<keyof ReceiptError>().toEqualTypeOf<
    "lineId" | "field" | "message"
  >();
  expect(Object.values(ReceiptField)).toEqual([
    "supplierName",
    "notaDate",
    "lines",
    "photoId",
    "payment",
    "dueDate",
    "cashSource",
    "product",
    "unit",
    "qty",
    "unitCost",
    "expiryDate",
    "newName",
    "newSellUnit",
    "newNotaUnit",
    "newNotaUnitSize",
    "newBarcode",
  ]);
});

/** Semua nama properti di skema JSON, rekursif (items, anyOf, allOf). */
function propertyNames(schema: unknown, out = new Set<string>()): Set<string> {
  if (Array.isArray(schema)) {
    for (const s of schema) propertyNames(s, out);
  } else if (schema !== null && typeof schema === "object") {
    for (const [key, value] of Object.entries(schema)) {
      if (key === "properties" && value !== null && typeof value === "object")
        for (const name of Object.keys(value)) out.add(name);
      propertyNames(value, out);
    }
  }
  return out;
}

const USER = ["id", "name", "role"];
const RECEIPT = [
  "id",
  "supplierName",
  "notaDate",
  "photoId",
  "lines",
  "lineId",
  "productId",
  "productName",
  "unitId",
  "unitName",
  "unitSize",
  "qty",
  "unitCost",
  "subtotal",
  "expiryDate",
  "newProduct",
  "payment",
  "timing",
  "method",
  "cashSource",
  "dueDate",
  "paymentEditable",
  "total",
  "status",
  "createdAt",
  "createdByName",
  "editedAt",
  "editedByName",
];

/** Allowlist: setiap respons /api/staff hanya boleh memuat key ini (di kedalaman mana pun). */
const STAFF_RESPONSE_KEYS: Record<string, readonly string[]> = {
  ListStaffUsersResponse: USER,
  StaffLoginResponse: ["user", ...USER],
  GetStaffSessionResponse: ["user", ...USER],
  StaffLogoutResponse: [],
  GetStaffShiftResponse: ["shift", "kasirName", "openedAt"],
  SearchStaffProductsResponse: [
    "id",
    "name",
    "category",
    "isCurah",
    "baseUnit",
    "status",
    "units",
    "unitSize",
    "barcodes",
  ],
  ListStaffSuppliersResponse: ["id", "name"],
  CreateStaffReceiptResponse: RECEIPT,
  ListStaffReceiptsResponse: [
    "id",
    "supplierName",
    "notaDate",
    "total",
    "lineCount",
    "status",
    "createdAt",
  ],
  GetStaffReceiptResponse: RECEIPT,
  UpdateStaffReceiptResponse: RECEIPT,
  PutStaffReceiptPhotoResponse: [],
  GetStaffReceiptPhotoResponse: [],
};

const keysOf = (schema: unknown): string[] =>
  [
    ...propertyNames(
      z.toJSONSchema(schema as z.ZodType, { unrepresentable: "any" }),
    ),
  ].sort();

const staffResponses = Object.entries(staffZod).filter(
  ([name, value]) => name.endsWith("Response") && value instanceof z.ZodType,
);

test("allowlist respons /api/staff: setiap respons punya daftar key, tanpa key lain", () => {
  // Endpoint staf baru wajib didaftarkan di allowlist.
  expect(staffResponses.map(([name]) => name).sort()).toEqual(
    Object.keys(STAFF_RESPONSE_KEYS).sort(),
  );
  for (const [name, schema] of staffResponses) {
    const allowed = new Set(STAFF_RESPONSE_KEYS[name]);
    expect({
      name,
      extra: keysOf(schema).filter((k) => !allowed.has(k)),
    }).toEqual({ name, extra: [] });
  }
  // Penjaga: penelusuran benar-benar menemukan key bersarang (lines[].unitCost).
  expect(keysOf(staffZod.GetStaffReceiptResponse)).toEqual(
    [...new Set(RECEIPT)].sort(),
  );
});

test("HPP tidak pernah ke staf: respons /api/staff tanpa key modal, harga jual, atau stok", () => {
  const forbidden = [
    "cost",
    "costAlert",
    "fromCost",
    "oldCost",
    "newCost",
    "price",
    "stock",
    "grossProfit",
    "openingCash",
  ];
  for (const [name, schema] of staffResponses) {
    const keys = keysOf(schema);
    expect({ name, leaked: forbidden.filter((k) => keys.includes(k)) }).toEqual(
      { name, leaked: [] },
    );
  }
});

test("staf: shift laci hanya kasirName & openedAt", () => {
  expectTypeOf<keyof StaffShift>().toEqualTypeOf<"shift">();
  expectTypeOf<StaffShift["shift"]>().toEqualTypeOf<DrawerShift | null>();
  expect(
    staffZod.GetStaffShiftResponse.safeParse({
      shift: { kasirName: "Sari", openedAt: 1793590000000 },
    }).success,
  ).toBe(true);
  expect(
    staffZod.GetStaffShiftResponse.safeParse({ shift: null }).success,
  ).toBe(true);
});

test("respons staf: StaffProduct maks. 20; nota tersimpan valid", () => {
  const product = {
    id: "p1",
    name: "Minyak Goreng Bimoli 2 L",
    category: "Minyak",
    isCurah: false,
    baseUnit: "pcs",
    status: "aktif",
    units: [
      { id: "u1", name: "pcs", unitSize: 1, barcodes: ["8992628020107"] },
    ],
  } satisfies StaffProduct;
  const twenty = Array.from({ length: 20 }, () => product);
  expect(SearchStaffProductsResponse.safeParse(twenty).success).toBe(true);
  expect(
    SearchStaffProductsResponse.safeParse([...twenty, product]).success,
  ).toBe(false);
  const saved = {
    id: "r1",
    supplierName: "CV Sumber Rejeki",
    notaDate: "2026-11-02",
    photoId: null,
    lines: [
      {
        lineId: "l1",
        productId: "p1",
        productName: "Minyak Goreng Bimoli 2 L",
        unitId: "u1",
        unitName: "pcs",
        unitSize: 1,
        qty: 12,
        unitCost: 34000,
        subtotal: 408000,
        expiryDate: null,
        newProduct: false,
      },
    ],
    payment: NOTA.payment,
    paymentEditable: false,
    total: 408000,
    status: "aktif",
    createdAt: 1793600000000,
    createdByName: "Rina",
    editedAt: null,
    editedByName: null,
  } satisfies StaffReceipt;
  expect(CreateStaffReceiptResponse.safeParse(saved).success).toBe(true);
});

test("SupplierDebtList (drawerShift nullable) & PayDebtInput", () => {
  const list = {
    debts: [
      {
        receiptId: "r1",
        supplierName: "CV Sumber Rejeki",
        notaDate: "2026-11-02",
        amount: 1442000,
        dueDate: "2026-11-16",
        paid: null,
        photoId: "f1",
        createdAt: 1793600000000,
        createdByName: "Rina",
      },
    ],
    drawerShift: { kasirName: "Sari", openedAt: 1793590000000 },
  } satisfies SupplierDebtList;
  const parse = (body: unknown) =>
    ListOwnerSupplierDebtsResponse.safeParse(body);
  expect(parse(list).success).toBe(true);
  expect(parse({ ...list, drawerShift: null }).success).toBe(true);
  const pay = (body: unknown) => PayOwnerSupplierDebtBody.safeParse(body);
  expect(pay({ method: "tunai", cashSource: "laci" }).success).toBe(true);
  expect(pay({ method: "transfer", cashSource: null }).success).toBe(true);
  expect(pay({ method: "qris", cashSource: null }).success).toBe(false);
});

test("receiptProblemSchema cocok dengan tipe hasil generate", () => {
  expectTypeOf<
    z.infer<typeof receiptProblemSchema>
  >().toMatchTypeOf<ReceiptProblem>();
  const body = {
    type: "about:blank",
    title: "Nota tidak valid",
    status: 422,
    code: "VALIDATION",
    errors: [
      { lineId: null, field: "supplierName", message: "Supplier belum diisi" },
      {
        lineId: "l2",
        field: "product",
        message: "Barang ini tidak dijual lagi",
      },
    ],
  };
  expect(receiptProblemSchema.safeParse(body).success).toBe(true);
  const unknownField = {
    ...body,
    errors: [{ lineId: null, field: "harga", message: "x" }],
  };
  expect(receiptProblemSchema.safeParse(unknownField).success).toBe(false);
  expect(
    receiptProblemSchema.safeParse({ ...body, code: "PRODUCT_INACTIVE" })
      .success,
  ).toBe(false);
});
