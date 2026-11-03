import { describe, expect, test } from "vitest";
import type {
  NewProductInput,
  ReceiptPayment,
  StaffProduct,
} from "../api/gen/shaziaMartAPI.schemas";
import {
  type CheckLine,
  type CheckReceipt,
  type DraftLine,
  DUE_SOON_DAYS,
  debtStage,
  newProductUnits,
  receiptLineTotal,
  receiptTotal,
  validatePayment,
  validateReceipt,
} from "./receipt-rules";

const TODAY = "2026-11-02";
const ctx = { today: TODAY, shiftOpen: true };

const transfer: ReceiptPayment = {
  timing: "sekarang",
  method: "transfer",
  cashSource: null,
  dueDate: null,
};

/** Baris barang terdaftar `l1`, qty 1, harga 1000. */
function line(patch: Partial<CheckLine> = {}): CheckLine {
  return {
    lineId: "l1",
    productId: "p-indomie",
    unitId: "u-indomie-pcs",
    newProduct: null,
    qty: 1,
    unitCost: 1000,
    expiryDate: null,
    ...patch,
  };
}

/** Barang baru `Teh Botol Sosro 450 ml` / botol / botol / 1. */
function newLine(
  patch: Partial<NewProductInput> = {},
  lineId = "l1",
): CheckLine {
  return line({
    lineId,
    productId: null,
    unitId: null,
    newProduct: {
      name: "Teh Botol Sosro 450 ml",
      sellUnit: "botol",
      notaUnit: "botol",
      notaUnitSize: 1,
      barcode: null,
      ...patch,
    },
  });
}

/** Nota valid minimal. */
function receipt(patch: Partial<CheckReceipt> = {}): CheckReceipt {
  return {
    supplierName: "CV Sumber Rejeki",
    notaDate: TODAY,
    lines: [line()],
    payment: transfer,
    ...patch,
  };
}

describe("debtStage", () => {
  test("DUE_SOON_DAYS = 3", () => expect(DUE_SOON_DAYS).toBe(3));

  test.each([
    ["2026-10-30", "lewat"],
    ["2026-11-01", "lewat"],
    ["2026-11-02", "segera"],
    ["2026-11-05", "segera"],
    ["2026-11-06", "nanti"],
    ["2026-11-16", "nanti"],
  ])("debtStage(%s) pada 2 Nov 2026 = %s", (due, stage) =>
    expect(debtStage(due, TODAY)).toBe(stage),
  );

  test("lintas tahun", () => {
    expect(debtStage("2027-01-02", "2026-12-30")).toBe("segera");
    expect(debtStage("2026-12-31", "2027-01-01")).toBe("lewat");
  });
});

describe("total nota", () => {
  test("total nota mockup = Rp1.442.000", () => {
    expect(receiptLineTotal(2, 112000)).toBe(224000);
    expect(
      receiptTotal([
        { qty: 2, unitCost: 112000 },
        { qty: 12, unitCost: 34000 },
        { qty: 50, unitCost: 16200 },
      ]),
    ).toBe(1442000);
    expect(() => receiptLineTotal(2 ** 40, 2 ** 20)).toThrow(RangeError);
  });

  test("barang bonus (harga 0) dan nota kosong", () => {
    expect(receiptLineTotal(3, 0)).toBe(0);
    expect(receiptTotal([])).toBe(0);
  });

  test("masukan bukan bilangan bulat atau total melewati batas aman → RangeError", () => {
    expect(() => receiptLineTotal(1.5, 1000)).toThrow(RangeError);
    expect(() => receiptLineTotal(1, 99.5)).toThrow(RangeError);
    expect(() =>
      receiptTotal([
        { qty: 1, unitCost: Number.MAX_SAFE_INTEGER },
        { qty: 1, unitCost: 1 },
      ]),
    ).toThrow(RangeError);
  });
});

describe("validateReceipt", () => {
  test("nota valid → tanpa galat (barang terdaftar & barang baru)", () => {
    expect(validateReceipt(receipt(), ctx)).toEqual([]);
    expect(
      validateReceipt(
        receipt({
          lines: [
            line(),
            newLine(
              { notaUnit: "Dus", notaUnitSize: 24, barcode: "8886008101053" },
              "l2",
            ),
            line({ lineId: "l3", unitCost: 0, expiryDate: "2027-04-20" }),
          ],
        }),
        ctx,
      ),
    ).toEqual([]);
  });

  test.each<[Partial<CheckReceipt>, string | null, string, string]>([
    [{ supplierName: " " }, null, "supplierName", "Supplier belum diisi"],
    [{ notaDate: "" }, null, "notaDate", "Tanggal nota belum diisi"],
    [{ notaDate: "2026-02-30" }, null, "notaDate", "Format tanggal tidak sah"],
    [{ notaDate: "  " }, null, "notaDate", "Tanggal nota belum diisi"],
    [
      { notaDate: "2026-11-03" },
      null,
      "notaDate",
      "Tanggal nota tidak boleh setelah hari ini",
    ],
    [{ lines: [] }, null, "lines", "Belum ada barang di nota"],
    [
      { lines: [line({ productId: null })] },
      "l1",
      "product",
      "Pilih barang atau buat barang baru",
    ],
    [
      { lines: [line({ unitId: null })] },
      "l1",
      "unit",
      "Satuan ini tidak dipakai lagi",
    ],
    [{ lines: [line({ qty: 0 })] }, "l1", "qty", "Jumlah minimal 1"],
    [{ lines: [line({ qty: null })] }, "l1", "qty", "Jumlah minimal 1"],
    [
      { lines: [line({ qty: 1.5 })] },
      "l1",
      "qty",
      "Jumlah harus bilangan bulat",
    ],
    [
      { lines: [line({ qty: 0.5 })] },
      "l1",
      "qty",
      "Jumlah harus bilangan bulat",
    ],
    [{ lines: [line({ qty: -2 })] }, "l1", "qty", "Jumlah minimal 1"],
    [
      { lines: [line({ unitCost: null })] },
      "l1",
      "unitCost",
      "Harga beli belum diisi",
    ],
    [
      { lines: [line({ unitCost: -1 })] },
      "l1",
      "unitCost",
      "Harga beli: ketik angka saja, mis. 3500",
    ],
    [
      { lines: [line({ unitCost: 99.5 })] },
      "l1",
      "unitCost",
      "Harga harus bilangan bulat",
    ],
    [
      { lines: [line({ expiryDate: "2027-02-30" })] },
      "l1",
      "expiryDate",
      "Tanggal kedaluwarsa tidak valid",
    ],
    [
      { lines: [newLine({ name: "  " })] },
      "l1",
      "newName",
      "Nama barang belum diisi",
    ],
    [
      { lines: [newLine({ sellUnit: "" })] },
      "l1",
      "newSellUnit",
      "'Dijual per' belum diisi",
    ],
    [
      { lines: [newLine({ notaUnit: " " })] },
      "l1",
      "newNotaUnit",
      "Satuan di nota belum diisi",
    ],
    [
      { lines: [newLine({ notaUnit: "dus", notaUnitSize: 1 })] },
      "l1",
      "newNotaUnitSize",
      "Satuan besar: isi berapa? (min. 2)",
    ],
    [
      { lines: [newLine({ barcode: "123" })] },
      "l1",
      "newBarcode",
      "Barcode salah, scan ulang",
    ],
    [
      { lines: [newLine({}, "l1"), newLine({}, "l2")] },
      "l2",
      "newName",
      "Nama sama dengan baris lain",
    ],
    [
      {
        lines: [
          newLine({ barcode: "8886008101053" }, "l1"),
          newLine({ name: "Teh Kotak", barcode: "8886008101053" }, "l2"),
        ],
      },
      "l2",
      "newBarcode",
      "Barcode sama dengan baris lain",
    ],
    [
      {
        payment: {
          timing: "nanti",
          method: null,
          cashSource: null,
          dueDate: null,
        },
      },
      null,
      "dueDate",
      "Jatuh tempo belum diisi",
    ],
    [
      {
        payment: {
          timing: "nanti",
          method: null,
          cashSource: null,
          dueDate: "2026-11-01",
        },
      },
      null,
      "dueDate",
      "Jatuh tempo tidak boleh sebelum tanggal nota",
    ],
  ])("validateReceipt %o → %s/%s: %s", (patch, lineId, field, message) =>
    expect(validateReceipt(receipt(patch), ctx)).toContainEqual({
      lineId,
      field,
      message,
    }),
  );

  test("urutan galat: tingkat nota, per baris sesuai urutan baris, lalu pembayaran", () => {
    const errors = validateReceipt(
      {
        supplierName: "",
        notaDate: "2026-11-05",
        lines: [
          line({
            lineId: "a",
            productId: null,
            qty: 0,
            unitCost: null,
            expiryDate: "x",
          }),
          newLine({ name: "", sellUnit: "", notaUnit: "", barcode: "1" }, "b"),
        ],
        payment: {
          timing: "sekarang",
          method: null,
          cashSource: null,
          dueDate: null,
        },
      },
      ctx,
    );
    expect(errors.map((e) => `${e.lineId ?? "-"}:${e.field}`)).toEqual([
      "-:supplierName",
      "-:notaDate",
      "a:product",
      "a:qty",
      "a:unitCost",
      "a:expiryDate",
      "b:newName",
      "b:newSellUnit",
      "b:newNotaUnit",
      "b:newBarcode",
      "-:payment",
    ]);
  });

  test("nama & satuan barang baru dibandingkan tanpa beda huruf dan spasi ujung", () => {
    const errors = validateReceipt(
      receipt({
        lines: [
          newLine({ notaUnit: " BOTOL ", notaUnitSize: 1 }, "l1"),
          newLine({ name: " teh botol sosro 450 ML " }, "l2"),
        ],
      }),
      ctx,
    );
    expect(errors).toEqual([
      {
        lineId: "l2",
        field: "newName",
        message: "Nama sama dengan baris lain",
      },
    ]);
  });

  test("nama/barcode kembar hanya ditandai di baris berikutnya, bukan baris pertama", () => {
    const errors = validateReceipt(
      receipt({
        lines: [newLine({}, "l1"), newLine({}, "l2"), newLine({}, "l3")],
      }),
      ctx,
    );
    expect(errors).toEqual([
      {
        lineId: "l2",
        field: "newName",
        message: "Nama sama dengan baris lain",
      },
      {
        lineId: "l3",
        field: "newName",
        message: "Nama sama dengan baris lain",
      },
    ]);
  });

  test("barcode tidak valid tidak ikut dicek kembar (satu galat per isian)", () => {
    const errors = validateReceipt(
      receipt({
        lines: [
          newLine({ barcode: "123" }, "l1"),
          newLine({ name: "B", barcode: "123" }, "l2"),
        ],
      }),
      ctx,
    );
    expect(errors.filter((e) => e.field === "newBarcode")).toEqual([
      {
        lineId: "l1",
        field: "newBarcode",
        message: "Barcode salah, scan ulang",
      },
      {
        lineId: "l2",
        field: "newBarcode",
        message: "Barcode salah, scan ulang",
      },
    ]);
  });

  test("tanggal nota sama dengan hari ini lolos; tanggal tak sah tidak dibandingkan dengan hari ini", () => {
    expect(validateReceipt(receipt({ notaDate: TODAY }), ctx)).toEqual([]);
    expect(
      validateReceipt(receipt({ notaDate: "2099-13-01" }), ctx).filter(
        (e) => e.field === "notaDate",
      ),
    ).toEqual([
      { lineId: null, field: "notaDate", message: "Format tanggal tidak sah" },
    ]);
  });

  test("laci tanpa shift buka diteruskan dari validatePayment", () => {
    expect(
      validateReceipt(
        receipt({
          payment: {
            timing: "sekarang",
            method: "tunai",
            cashSource: "laci",
            dueDate: null,
          },
        }),
        { today: TODAY, shiftOpen: false },
      ),
    ).toEqual([
      {
        lineId: null,
        field: "cashSource",
        message:
          "Tidak ada shift kasir yang buka — pilih Uang pemilik atau Transfer",
      },
    ]);
  });
});

describe("validatePayment", () => {
  test("tunai dari laci tanpa shift buka → galat cashSource; transfer lolos", () => {
    expect(
      validatePayment(
        {
          timing: "sekarang",
          method: "tunai",
          cashSource: "laci",
          dueDate: null,
        },
        TODAY,
        false,
      ),
    ).toEqual([
      {
        lineId: null,
        field: "cashSource",
        message:
          "Tidak ada shift kasir yang buka — pilih Uang pemilik atau Transfer",
      },
    ]);
    expect(validatePayment(transfer, TODAY, false)).toEqual([]);
  });

  test.each<ReceiptPayment>([
    { timing: "sekarang", method: "tunai", cashSource: "laci", dueDate: null },
    {
      timing: "sekarang",
      method: "tunai",
      cashSource: "pemilik",
      dueDate: null,
    },
    { timing: "sekarang", method: "transfer", cashSource: null, dueDate: null },
    { timing: "nanti", method: null, cashSource: null, dueDate: TODAY },
    { timing: "nanti", method: null, cashSource: null, dueDate: "2026-11-16" },
  ])("sah: %o", (p) => expect(validatePayment(p, TODAY, true)).toEqual([]));

  test("tunai uang pemilik tanpa shift buka lolos", () =>
    expect(
      validatePayment(
        {
          timing: "sekarang",
          method: "tunai",
          cashSource: "pemilik",
          dueDate: null,
        },
        TODAY,
        false,
      ),
    ).toEqual([]));

  test.each<[ReceiptPayment, string, string]>([
    [
      { timing: "sekarang", method: null, cashSource: null, dueDate: null },
      "payment",
      "Cara bayar belum dipilih",
    ],
    [
      { timing: "sekarang", method: "tunai", cashSource: null, dueDate: null },
      "cashSource",
      "Pilih uang dari mana: laci atau uang pemilik",
    ],
    [
      {
        timing: "sekarang",
        method: "transfer",
        cashSource: "laci",
        dueDate: null,
      },
      "cashSource",
      "Transfer tidak memakai uang dari laci atau pemilik",
    ],
    [
      {
        timing: "sekarang",
        method: "transfer",
        cashSource: null,
        dueDate: TODAY,
      },
      "dueDate",
      "Jatuh tempo hanya untuk Bayar nanti",
    ],
    [
      { timing: "nanti", method: "tunai", cashSource: null, dueDate: TODAY },
      "payment",
      "Cara bayar dipilih saat pemilik menandai lunas",
    ],
    [
      { timing: "nanti", method: null, cashSource: "laci", dueDate: TODAY },
      "payment",
      "Cara bayar dipilih saat pemilik menandai lunas",
    ],
    [
      {
        timing: "nanti",
        method: null,
        cashSource: null,
        dueDate: "2026-11-31",
      },
      "dueDate",
      "Format tanggal tidak sah",
    ],
  ])("tidak sah: %o → %s: %s", (p, field, message) =>
    expect(validatePayment(p, TODAY, true)).toEqual([
      { lineId: null, field, message },
    ]),
  );

  test("tanggal nota tak sah → jatuh tempo tidak dibandingkan", () =>
    expect(
      validatePayment(
        {
          timing: "nanti",
          method: null,
          cashSource: null,
          dueDate: "2026-11-01",
        },
        "",
        true,
      ),
    ).toEqual([]));
});

describe("newProductUnits", () => {
  test("newProductUnits", () => {
    expect(
      newProductUnits({
        name: "Teh Botol Sosro 450 ml",
        sellUnit: "botol",
        notaUnit: "dus",
        notaUnitSize: 24,
        barcode: null,
      }),
    ).toEqual({
      eceran: { name: "botol", unitSize: 1 },
      nota: { name: "dus", unitSize: 24 },
    });
    expect(
      newProductUnits({
        name: "Beras Cianjur",
        sellUnit: "kg",
        notaUnit: "karung",
        notaUnitSize: 25,
        barcode: null,
      }),
    ).toEqual({
      eceran: { name: "kg", unitSize: 1000 },
      nota: { name: "karung", unitSize: 25000 },
    });
    expect(
      newProductUnits({
        name: "X",
        sellUnit: "pcs",
        notaUnit: "PCS",
        notaUnitSize: 1,
        barcode: null,
      })?.nota,
    ).toBeNull();
  });

  test("sellUnit kosong → null; nama satuan dirapikan", () => {
    expect(
      newProductUnits({
        name: "X",
        sellUnit: "  ",
        notaUnit: "dus",
        notaUnitSize: 2,
        barcode: null,
      }),
    ).toBeNull();
    expect(
      newProductUnits({
        name: "X",
        sellUnit: " liter ",
        notaUnit: " jeriken ",
        notaUnitSize: 5,
        barcode: null,
      }),
    ).toEqual({
      eceran: { name: "liter", unitSize: 1000 },
      nota: { name: "jeriken", unitSize: 5000 },
    });
  });
});

describe("validateReceipt: barang terdaftar ATAU barang baru", () => {
  const productErrors = (l: CheckLine) =>
    validateReceipt(receipt({ lines: [l] }), ctx).filter(
      (e) => e.field === "product",
    );

  test("keduanya diisi → galat product", () =>
    expect(
      productErrors({ ...newLine(), productId: "p-indomie", unitId: "u-pcs" }),
    ).toEqual([
      {
        lineId: "l1",
        field: "product",
        message: "Pilih salah satu: barang terdaftar atau barang baru",
      },
    ]));

  test("tidak satu pun → galat product", () =>
    expect(productErrors(line({ productId: null, unitId: null }))).toEqual([
      {
        lineId: "l1",
        field: "product",
        message: "Pilih barang atau buat barang baru",
      },
    ]));

  test("salah satu saja → lolos", () => {
    expect(productErrors(line())).toEqual([]);
    expect(productErrors(newLine())).toEqual([]);
  });
});

describe("tanggal kosong vs format salah", () => {
  test("jatuh tempo string kosong → belum diisi; format salah → format tidak sah", () => {
    const nanti = (dueDate: string): ReceiptPayment => ({
      timing: "nanti",
      method: null,
      cashSource: null,
      dueDate,
    });
    expect(validatePayment(nanti(""), TODAY, true)).toEqual([
      { lineId: null, field: "dueDate", message: "Jatuh tempo belum diisi" },
    ]);
    expect(validatePayment(nanti("16-11-2026"), TODAY, true)).toEqual([
      { lineId: null, field: "dueDate", message: "Format tanggal tidak sah" },
    ]);
  });

  test("tanggal nota format salah → format tidak sah", () =>
    expect(validateReceipt(receipt({ notaDate: "2/11/2026" }), ctx)).toEqual([
      { lineId: null, field: "notaDate", message: "Format tanggal tidak sah" },
    ]));
});

// Boleh dihapus setelah Task 8 meng-import DraftLine (hanya menjaga knip & bentuk salinan offline).
describe("DraftLine", () => {
  test("barang dari pencarian staf (StaffProduct) bisa disalin apa adanya ke baris draf", () => {
    const indomie: StaffProduct = {
      id: "p-indomie",
      name: "Indomie Goreng",
      category: "Mi instan",
      isCurah: false,
      baseUnit: "pcs",
      status: "aktif",
      units: [
        { id: "u-pcs", name: "pcs", unitSize: 1, barcodes: ["089686010947"] },
        { id: "u-dus", name: "dus", unitSize: 40, barcodes: [] },
      ],
    };
    const draft: DraftLine = {
      lineId: "l1",
      product: indomie,
      unitId: "u-dus",
      newProduct: null,
      qty: 2,
      unitCostText: "112.000",
      expiryDate: "2027-04-20",
    };
    expect(
      draft.product?.units.find((u) => u.id === draft.unitId)?.unitSize,
    ).toBe(40);
  });
});
