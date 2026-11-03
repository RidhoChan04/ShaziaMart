import { describe, expect, test } from "vitest";
import type { DraftLine } from "@/shared/lib/receipt-rules";
import { emptyForm } from "./draft-store";
import type { DraftPayment, ReceiptDraft } from "./draft-types";
import { formProblems, toReceiptInput } from "./receipt-input";

const TODAY = "2026-11-03";

const product = (
  id: string,
  name: string,
  units: { id: string; name: string; unitSize: number }[],
): DraftLine["product"] => ({
  id,
  name,
  category: null,
  baseUnit: "pcs",
  units: units.map((u) => ({ ...u, barcodes: [] })),
});

const indomie = product("p-indomie", "Indomie Goreng", [
  { id: "u-pcs", name: "pcs", unitSize: 1 },
  { id: "u-dus", name: "dus", unitSize: 40 },
]);
const bimoli = product("p-bimoli", "Minyak Goreng Bimoli 2 L", [
  { id: "u-bimoli", name: "pcs", unitSize: 1 },
]);
const gula = product("p-gula", "Gula Pasir", [
  { id: "u-kg", name: "kg", unitSize: 1000 },
]);

const line = (
  lineId: string,
  p: DraftLine["product"],
  unitId: string,
  qty: number,
  unitCostText: string,
  expiryDate: string | null = null,
): DraftLine => ({
  lineId,
  product: p,
  unitId,
  newProduct: null,
  qty,
  unitCostText,
  expiryDate,
});

/** Nota mockup: CV Sumber Rejeki 2 Nov 2026, total Rp1.442.000, bayar sekarang tunai dari laci. */
function mockupDraft(
  payment: Partial<DraftPayment> = {},
  lines?: DraftLine[],
): ReceiptDraft {
  const form = emptyForm("2026-11-02");
  return {
    id: "draf-1",
    userId: "u-rina",
    createdAt: 1,
    updatedAt: 1,
    status: "queued",
    form: {
      ...form,
      supplierName: "CV Sumber Rejeki",
      lines: lines ?? [
        line("l1", indomie, "u-dus", 2, "112.000", "2027-04-20"),
        line("l2", bimoli, "u-bimoli", 12, "34.000"),
        line("l3", gula, "u-kg", 50, "16.200"),
      ],
      payment: { ...form.payment, ...payment },
    },
    photo: {
      id: "foto-1",
      blob: new Blob([]),
      takenAt: 1,
      bytes: 0,
      uploaded: false,
    },
    errors: [],
  };
}

describe("toReceiptInput", () => {
  test("draf nota mockup → ReceiptInput persis (unitCost 112000 dari '112.000')", () => {
    expect(toReceiptInput(mockupDraft())).toEqual({
      id: "draf-1",
      supplierName: "CV Sumber Rejeki",
      notaDate: "2026-11-02",
      photoId: "foto-1",
      lines: [
        {
          lineId: "l1",
          productId: "p-indomie",
          unitId: "u-dus",
          newProduct: null,
          qty: 2,
          unitCost: 112_000,
          expiryDate: "2027-04-20",
        },
        {
          lineId: "l2",
          productId: "p-bimoli",
          unitId: "u-bimoli",
          newProduct: null,
          qty: 12,
          unitCost: 34_000,
          expiryDate: null,
        },
        {
          lineId: "l3",
          productId: "p-gula",
          unitId: "u-kg",
          newProduct: null,
          qty: 50,
          unitCost: 16_200,
          expiryDate: null,
        },
      ],
      payment: {
        timing: "sekarang",
        method: "tunai",
        cashSource: "laci",
        dueDate: null,
      },
    });
  });

  test("tanpa foto → photoId null; supplier dirapikan", () => {
    const d = mockupDraft();
    d.photo = null;
    d.form.supplierName = "  CV Sumber Rejeki ";
    expect(toReceiptInput(d)).toMatchObject({
      photoId: null,
      supplierName: "CV Sumber Rejeki",
    });
  });

  test("R8: 'Dari laci' dikirim apa adanya, tidak pernah diam-diam jadi uang pemilik", () => {
    expect(toReceiptInput(mockupDraft()).payment.cashSource).toBe("laci");
    expect(
      toReceiptInput(mockupDraft({ cashSource: "pemilik" })).payment,
    ).toEqual({
      timing: "sekarang",
      method: "tunai",
      cashSource: "pemilik",
      dueDate: null,
    });
  });

  test("transfer → cashSource null; R12: bayar sekarang → dueDate null walau draf menyimpan tanggal", () => {
    expect(
      toReceiptInput(mockupDraft({ method: "transfer", dueDate: "2026-11-16" }))
        .payment,
    ).toEqual({
      timing: "sekarang",
      method: "transfer",
      cashSource: null,
      dueDate: null,
    });
  });

  test("bayar nanti → method & cashSource null, jatuh tempo ikut", () => {
    expect(
      toReceiptInput(mockupDraft({ timing: "nanti", dueDate: "2026-11-16" }))
        .payment,
    ).toEqual({
      timing: "nanti",
      method: null,
      cashSource: null,
      dueDate: "2026-11-16",
    });
  });

  test("barang baru: isian teks → NewProductInput; barcode kosong → null", () => {
    const baru: DraftLine = {
      lineId: "l9",
      product: null,
      unitId: null,
      newProduct: {
        name: "Teh Pucuk 350 ml",
        sellUnit: "botol",
        notaUnit: "dus",
        notaUnitSize: "24",
        barcode: " ",
      },
      qty: 2,
      unitCostText: "Rp72.000",
      expiryDate: null,
    };
    expect(toReceiptInput(mockupDraft({}, [baru])).lines).toEqual([
      {
        lineId: "l9",
        productId: null,
        unitId: null,
        newProduct: {
          name: "Teh Pucuk 350 ml",
          sellUnit: "botol",
          notaUnit: "dus",
          notaUnitSize: 24,
          barcode: null,
        },
        qty: 2,
        unitCost: 72_000,
        expiryDate: null,
      },
    ]);
  });
});

describe("formProblems", () => {
  const ctx = { today: TODAY, shiftOpen: true };

  test("draf mockup → tanpa masalah", () =>
    expect(formProblems(mockupDraft(), ctx)).toEqual([]));

  test("unitCostText '11.2a' → {lineId:'l1', field:'unitCost', message:'Harga beli: ketik angka saja, mis. 3500'}", () => {
    const d = mockupDraft();
    const l1 = d.form.lines[0];
    if (!l1) throw new Error("tanpa baris");
    l1.unitCostText = "11.2a";
    expect(formProblems(d, ctx)).toEqual([
      {
        lineId: "l1",
        field: "unitCost",
        message: "Harga beli: ketik angka saja, mis. 3500",
      },
    ]);
  });

  test("harga kosong → 'Harga beli belum diisi'", () => {
    const d = mockupDraft();
    const l2 = d.form.lines[1];
    if (!l2) throw new Error("tanpa baris");
    l2.unitCostText = " ";
    expect(formProblems(d, ctx)).toEqual([
      { lineId: "l2", field: "unitCost", message: "Harga beli belum diisi" },
    ]);
  });

  test("tingkat nota dan pembayaran memakai aturan yang sama (receipt-rules)", () => {
    const d = mockupDraft();
    d.form.supplierName = " ";
    d.form.notaDate = "2026-11-04";
    expect(formProblems(d, ctx)).toEqual([
      { lineId: null, field: "supplierName", message: "Supplier belum diisi" },
      {
        lineId: null,
        field: "notaDate",
        message: "Tanggal nota tidak boleh setelah hari ini",
      },
    ]);
    expect(
      formProblems(
        mockupDraft({ timing: "nanti", dueDate: "2026-11-01" }),
        ctx,
      ),
    ).toEqual([
      {
        lineId: null,
        field: "dueDate",
        message: "Jatuh tempo tidak boleh sebelum tanggal nota",
      },
    ]);
  });

  test("dari laci tanpa shift buka → galat sumber uang (R8)", () => {
    expect(
      formProblems(mockupDraft(), { today: TODAY, shiftOpen: false }),
    ).toEqual([
      {
        lineId: null,
        field: "cashSource",
        message:
          "Tidak ada shift kasir yang buka — pilih Uang pemilik atau Transfer",
      },
    ]);
    expect(
      formProblems(mockupDraft({ cashSource: "pemilik" }), {
        today: TODAY,
        shiftOpen: false,
      }),
    ).toEqual([]);
  });

  test("tanpa baris → 'Belum ada barang di nota'", () =>
    expect(formProblems(mockupDraft({}, []), ctx)).toEqual([
      { lineId: null, field: "lines", message: "Belum ada barang di nota" },
    ]));
});
