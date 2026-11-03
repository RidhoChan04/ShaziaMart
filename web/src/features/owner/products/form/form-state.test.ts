import { describe, expect, test } from "vitest";
import type {
  OwnerProduct,
  ProductInput,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { validateDraft } from "@/shared/lib/product-rules";
import {
  draftFromForm,
  emptyFormValues,
  type FormValues,
  firstErrorByField,
  formValuesFromProduct,
  inputFromDraft,
} from "./form-state";

const filled = (over: Partial<FormValues>): FormValues => ({
  ...emptyFormValues(),
  ...over,
});

describe("emptyFormValues", () => {
  test("14 isian, semuanya teks kosong", () => {
    const v = emptyFormValues();
    expect(Object.keys(v)).toHaveLength(14);
    expect(Object.values(v).every((x) => x === "")).toBe(true);
  });
});

describe("draftFromForm", () => {
  test("isian lengkap menjadi draft; uang boleh Rp dan titik ribuan", () => {
    const { draft, problems } = draftFromForm(
      filled({
        name: "  Teh Pucuk  ",
        category: "Minuman",
        sellUnit: "botol",
        barcode: " 8996001600269 ",
        cost: "Rp3.000",
        price: "4000",
        tierMinQty: "12",
        tierPrice: "3.750",
        bigName: "dus",
        bigSize: "24",
        bigCost: "70000",
        bigPrice: "84.000",
        minStock: "24",
      }),
    );
    expect(problems).toEqual([]);
    expect(draft).toEqual({
      name: "Teh Pucuk",
      category: "Minuman",
      sellUnit: "botol",
      barcode: "8996001600269",
      cost: 3000,
      price: 4000,
      tierMinQty: 12,
      tierPrice: 3750,
      bigName: "dus",
      bigSize: 24,
      bigBarcode: null,
      bigCost: 70000,
      bigPrice: 84000,
      minStock: 24,
    });
  });

  test("kosong menjadi null", () => {
    const { draft, problems } = draftFromForm(emptyFormValues());
    expect(problems).toEqual([]);
    expect(Object.values(draft).every((x) => x === null)).toBe(true);
  });

  test("batas stok memakai koma atau titik desimal", () => {
    expect(draftFromForm(filled({ minStock: "2,5" })).draft.minStock).toBe(2.5);
    expect(draftFromForm(filled({ minStock: "2.5" })).draft.minStock).toBe(2.5);
  });

  test.each([
    ["cost", "tiga ribu", "Harga modal: ketik angka saja, mis. 3500"],
    ["price", "3,5rb", "Harga jual: ketik angka saja, mis. 3500"],
    ["tierPrice", "abc", "Harga grosir: ketik angka saja, mis. 3500"],
    ["bigCost", "12x", "Harga modal satuan besar: ketik angka saja, mis. 3500"],
    ["bigPrice", "-5", "Harga jual satuan besar: ketik angka saja, mis. 3500"],
    ["tierMinQty", "dua", "Grosir: beli minimal 2 ke atas"],
    ["bigSize", "1,5", "Satuan besar: isi berapa? (min. 2)"],
    ["minStock", "banyak", "Batas stok menipis: isi angka, mis. 20"],
  ] as const)("%s tak terbaca → pesan, nilai null", (field, text, message) => {
    const { draft, problems } = draftFromForm(filled({ [field]: text }));
    expect(problems).toEqual([{ field, message }]);
    expect(draft[field]).toBeNull();
  });
});

describe("inputFromDraft", () => {
  const base = {
    name: "Teh Pucuk",
    category: null,
    sellUnit: "botol",
    barcode: null,
    cost: 3000,
    price: 4000,
    tierMinQty: null,
    tierPrice: null,
    bigName: null,
    bigSize: null,
    bigBarcode: null,
    bigCost: null,
    bigPrice: null,
    minStock: null,
  };

  test("tanpa grosir dan satuan besar → tier dan bigUnit null", () => {
    expect(inputFromDraft(base, null)).toEqual<ProductInput>({
      name: "Teh Pucuk",
      category: null,
      sellUnit: "botol",
      barcode: null,
      cost: 3000,
      price: 4000,
      tier: null,
      bigUnit: null,
      minStock: null,
    });
  });

  test("grosir dan satuan besar; modal besar menang → modal eceran tidak dikirim", () => {
    const input = inputFromDraft(
      {
        ...base,
        tierMinQty: 12,
        tierPrice: 3750,
        bigName: "dus",
        bigSize: 24,
        bigBarcode: "x",
        bigCost: 70000,
        bigPrice: 84000,
      },
      "u-9",
    );
    expect(input.tier).toEqual({ minQty: 12, price: 3750 });
    expect(input.bigUnit).toEqual({
      unitId: "u-9",
      name: "dus",
      size: 24,
      barcode: "x",
      cost: 70000,
      price: 84000,
    });
    expect(input.cost).toBeNull();
  });
});

describe("firstErrorByField", () => {
  test("pesan pertama per field", () => {
    expect(
      firstErrorByField([
        { field: "name", message: "a" },
        { field: "name", message: "b" },
        { field: "price", message: "c" },
      ]),
    ).toEqual({ name: "a", price: "c" });
  });
});

const product = (over: Partial<OwnerProduct>): OwnerProduct =>
  ({
    id: "p1",
    name: "Indomie Goreng",
    category: "Mie",
    units: [
      {
        id: "u1",
        name: "pcs",
        unitSize: 1,
        price: 3100,
        barcodes: ["089686010947"],
        wholesaleTiers: [{ minQty: 5, price: 2900 }],
        cost: 2600,
        active: true,
        sold: true,
      },
      {
        id: "u2",
        name: "dus",
        unitSize: 40,
        price: 112000,
        barcodes: [],
        wholesaleTiers: [],
        cost: 104000,
        active: true,
        sold: false,
      },
    ],
    cost: { amount: 104000, qtyBase: 40 },
    minStock: 2500,
    ...over,
  }) as unknown as OwnerProduct;

describe("formValuesFromProduct", () => {
  test("modal dari satuan besar ditaruh di bigCost, modal eceran kosong", () => {
    const v = formValuesFromProduct(product({}));
    expect(v).toMatchObject({
      name: "Indomie Goreng",
      category: "Mie",
      sellUnit: "pcs",
      barcode: "089686010947",
      cost: "",
      price: "Rp3.100",
      tierMinQty: "5",
      tierPrice: "Rp2.900",
      bigName: "dus",
      bigSize: "40",
      bigCost: "Rp104.000",
      bigPrice: "Rp112.000",
      minStock: "2500",
    });
  });

  test("modal eceran saja; satuan besar nonaktif dilewati; batas pecahan kg", () => {
    const p = product({});
    const [eceran, big] = p.units;
    if (!eceran || !big) throw new Error("fixture");
    const v = formValuesFromProduct({
      ...p,
      units: [
        { ...eceran, name: "kg", unitSize: 1000 },
        { ...big, active: false },
      ],
      cost: { amount: 16500, qtyBase: 1000 },
      minStock: 2500,
    });
    expect(v.cost).toBe("Rp16.500");
    expect(v.bigName).toBe("");
    expect(v.bigCost).toBe("");
    expect(v.minStock).toBe("2,5");
  });

  test("hasil terbaca kembali tanpa masalah (bolak-balik)", () => {
    const { draft, problems } = draftFromForm(
      formValuesFromProduct(product({})),
    );
    expect(problems).toEqual([]);
    expect(validateDraft(draft)).toEqual([]);
  });
});
