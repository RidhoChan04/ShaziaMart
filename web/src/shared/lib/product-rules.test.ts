import { describe, expect, test } from "vitest";
import type {
  OwnerProductUnit,
  ProductField,
} from "../api/gen/shaziaMartAPI.schemas";
import {
  activeBigUnit,
  hppFromDraft,
  isValidBarcode,
  markup,
  type ProductDraft,
  sellUnitKind,
  suggestedPrice,
  unitCost,
  validateDraft,
} from "./product-rules";

const EMPTY: ProductDraft = {
  name: "Barang Uji",
  category: null,
  sellUnit: "pcs",
  barcode: null,
  cost: null,
  price: 1000,
  tierMinQty: null,
  tierPrice: null,
  bigName: null,
  bigSize: null,
  bigBarcode: null,
  bigCost: null,
  bigPrice: null,
  minStock: null,
};

function draft(patch: Partial<ProductDraft> = {}): ProductDraft {
  return { ...EMPTY, ...patch };
}

const TEH_PUCUK_DRAFT: ProductDraft = {
  name: "Teh Pucuk Harum 350ml",
  category: "Minuman",
  sellUnit: "botol",
  barcode: "8996001600269",
  cost: null,
  price: 4000,
  tierMinQty: 12,
  tierPrice: 3500,
  bigName: "dus",
  bigSize: 24,
  bigBarcode: "18992628022191",
  bigCost: 70000,
  bigPrice: 96000,
  minStock: 24,
};

test("ProductDraft punya tepat satu key per ProductField", () => {
  const fields = {
    name: 0,
    category: 0,
    sellUnit: 0,
    barcode: 0,
    cost: 0,
    price: 0,
    tierMinQty: 0,
    tierPrice: 0,
    bigName: 0,
    bigSize: 0,
    bigBarcode: 0,
    bigCost: 0,
    bigPrice: 0,
    minStock: 0,
  } satisfies Record<ProductField, unknown>;
  expect(Object.keys(EMPTY).sort()).toEqual(Object.keys(fields).sort());
});

test.each([
  ["kg", "gram", 1000],
  [" KG ", "gram", 1000],
  ["ons", "gram", 100],
  ["liter", "ml", 1000],
  ["L", "ml", 1000],
  ["botol", "pcs", 1],
])("sellUnitKind(%s)", (s, base, size) =>
  expect(sellUnitKind(s)).toEqual({
    baseUnit: base,
    isCurah: base !== "pcs",
    unitSize: size,
  }),
);

test("sellUnitKind kosong -> null", () => {
  expect(sellUnitKind("")).toBeNull();
  expect(sellUnitKind("   ")).toBeNull();
});

test.each([
  ["089686010947", true],
  ["8992696404441", true],
  ["8992696404442", false],
  ["96385074", true],
  ["18992628022191", true],
  ["18992628022192", false],
  ["89686010947", false],
  ["8.99269640444E+12", false],
  ["12345", false],
  ["", false],
  ["899269640444a", false],
])("isValidBarcode(%s) = %s", (code, ok) =>
  expect(isValidBarcode(code)).toBe(ok),
);

test("hppFromDraft: modal besar menang; eceran; curah; kosong", () => {
  expect(
    hppFromDraft(
      draft({
        sellUnit: "botol",
        cost: 3000,
        bigName: "dus",
        bigSize: 24,
        bigCost: 70000,
        bigPrice: 84000,
      }),
    ),
  ).toEqual({ amount: 70000, qtyBase: 24 });
  expect(hppFromDraft(draft({ sellUnit: "botol", cost: 3000 }))).toEqual({
    amount: 3000,
    qtyBase: 1,
  });
  expect(
    hppFromDraft(
      draft({
        sellUnit: "kg",
        bigName: "karung",
        bigSize: 25,
        bigCost: 300000,
        bigPrice: 340000,
      }),
    ),
  ).toEqual({ amount: 300000, qtyBase: 25000 });
  expect(hppFromDraft(draft({ sellUnit: "kg", cost: 16500 }))).toEqual({
    amount: 16500,
    qtyBase: 1000,
  });
  expect(hppFromDraft(draft({ sellUnit: "botol" }))).toBeNull();
});

test("unitCost membulatkan setengah ke atas", () => {
  expect(unitCost({ amount: 70000, qtyBase: 24 }, 1)).toBe(2917);
  expect(unitCost({ amount: 104000, qtyBase: 40 }, 1)).toBe(2600);
  expect(unitCost({ amount: 16500, qtyBase: 1000 }, 1000)).toBe(16500);
  expect(unitCost({ amount: 70000, qtyBase: 24 }, 24)).toBe(70000);
  expect(unitCost(null, 1)).toBeNull();
});

test.each([
  [36000, 34000, 2000, 6],
  [35500, 34000, 1500, 4],
  [212000, 201000, 11000, 5],
  [36000, 36000, 0, 0],
  [33000, 34000, -1000, -3],
])("markup(%i, %i)", (p, c, profit, percent) =>
  expect(markup(p, c)).toEqual({ profit, percent }),
);

test("markup modal 0 -> tanpa persen; modal null -> null", () => {
  expect(markup(1000, 0)).toEqual({ profit: 1000, percent: null });
  expect(markup(1000, null)).toBeNull();
});

test.each([
  [36000, 34000, 36000, 38500],
  [3100, 2600, 2700, 3500],
  [2800, 2600, 2700, 3000],
  [112000, 104000, 108000, 116500],
  [18000, 16500, 17000, 19000],
  [36000, 36000, 34000, 34000],
])("suggestedPrice(%i, %i -> %i) = %i", (price, oldCost, newCost, want) =>
  expect(suggestedPrice(price, oldCost, newCost)).toBe(want),
);

test("suggestedPrice modal lama 0 -> null; di luar batas aman -> RangeError", () => {
  expect(suggestedPrice(1000, 0, 500)).toBeNull();
  expect(() => suggestedPrice(2 ** 40, 1, 2 ** 20)).toThrow(RangeError);
});

describe("validateDraft", () => {
  const CASES: [Partial<ProductDraft>, ProductField, string][] = [
    [{ name: null }, "name", "Nama barang belum diisi"],
    [{ name: "   " }, "name", "Nama barang belum diisi"],
    [{ name: "Indomie  Goreng" }, "name", "Ada spasi dobel di nama"],
    [
      { name: "x".repeat(101) },
      "name",
      "Nama terlalu panjang (maks. 100 huruf)",
    ],
    [{ sellUnit: null }, "sellUnit", "'Dijual per' belum diisi"],
    [{ price: null }, "price", "Harga jual belum diisi"],
    [{ price: 0 }, "price", "Harga jual belum diisi"],
    [
      { cost: 34000, price: 33000 },
      "price",
      "Harga jual di bawah modal (Rp34.000)",
    ],
    [{ barcode: "89686010947" }, "barcode", "Barcode salah, scan ulang"],
    [
      { tierMinQty: 10 },
      "tierMinQty",
      "Grosir: isi 'beli minimal' dan harganya",
    ],
    [
      { tierPrice: 900 },
      "tierMinQty",
      "Grosir: isi 'beli minimal' dan harganya",
    ],
    [
      { tierMinQty: 1, tierPrice: 900 },
      "tierMinQty",
      "Grosir: beli minimal 2 ke atas",
    ],
    [
      { price: 11500, tierMinQty: 12, tierPrice: 11800 },
      "tierPrice",
      "Harga grosir harus lebih murah",
    ],
    [
      { price: 1000, tierMinQty: 12, tierPrice: 1000 },
      "tierPrice",
      "Harga grosir harus lebih murah",
    ],
    [
      { cost: 3000, price: 4000, tierMinQty: 12, tierPrice: 2900 },
      "tierPrice",
      "Harga grosir di bawah modal (Rp3.000)",
    ],
    [
      { bigSize: 24, bigPrice: 84000 },
      "bigName",
      "Satuan besar: nama satuan belum diisi",
    ],
    [
      { sellUnit: "pcs", bigName: "PCS", bigSize: 10, bigPrice: 1 },
      "bigName",
      "Satuan besar sama dengan satuan eceran",
    ],
    [
      { bigName: "dus", bigSize: 1, bigPrice: 84000 },
      "bigSize",
      "Satuan besar: isi berapa? (min. 2)",
    ],
    [
      { bigName: "dus", bigSize: null, bigPrice: 84000 },
      "bigSize",
      "Satuan besar: isi berapa? (min. 2)",
    ],
    [
      { bigName: "dus", bigSize: 2.5, bigPrice: 84000 },
      "bigSize",
      "Satuan besar: isi berapa? (min. 2)",
    ],
    [
      { bigName: "dus", bigSize: 24 },
      "bigPrice",
      "Satuan besar: harga jual belum diisi",
    ],
    [
      { cost: 3000, bigName: "dus", bigSize: 24, bigPrice: 70000 },
      "bigPrice",
      "Satuan besar: harga jual di bawah modal (Rp72.000)",
    ],
    [
      { bigName: "dus", bigSize: 24, bigPrice: 84000, bigBarcode: "123" },
      "bigBarcode",
      "Barcode satuan besar salah",
    ],
    [
      {
        barcode: "8996001600269",
        bigName: "dus",
        bigSize: 24,
        bigPrice: 84000,
        bigBarcode: "8996001600269",
      },
      "bigBarcode",
      "Barcode satuan besar sudah dipakai",
    ],
    [
      { sellUnit: "pcs", minStock: 2.5 },
      "minStock",
      "Batas stok menipis: isi angka, mis. 20",
    ],
    [{ minStock: -1 }, "minStock", "Batas stok menipis: isi angka, mis. 20"],
  ];

  test.each(CASES)("%o -> %s: %s", (patch, field, message) =>
    expect(validateDraft(draft(patch))).toContainEqual({ field, message }),
  );

  test("draft lengkap Teh Pucuk valid; kg dengan batas 2,5 valid", () => {
    expect(validateDraft(TEH_PUCUK_DRAFT)).toEqual([]);
    expect(validateDraft(draft({ sellUnit: "kg", minStock: 2.5 }))).toEqual([]);
    expect(validateDraft(draft())).toEqual([]);
  });

  test("modal efektif eceran memakai modal besar, bukan modal eceran", () => {
    // modal eceran 9000 diabaikan; 70000 / 24 = 2917
    const d = draft({
      sellUnit: "botol",
      price: 3000,
      cost: 9000,
      bigName: "dus",
      bigSize: 24,
      bigCost: 70000,
      bigPrice: 84000,
    });
    expect(validateDraft(d)).toEqual([]);
    expect(validateDraft({ ...d, price: 2900 })).toEqual([
      { field: "price", message: "Harga jual di bawah modal (Rp2.917)" },
    ]);
  });

  test("kg: batas modal dihitung per kg dan per satuan besar", () => {
    const d = draft({
      sellUnit: "kg",
      price: 17000,
      bigName: "karung",
      bigSize: 25,
      bigCost: 400000,
      bigPrice: 410000,
    });
    // 400000 / 25 kg = 16000 per kg
    expect(validateDraft(d)).toEqual([]);
    expect(validateDraft({ ...d, price: 15000 })).toEqual([
      { field: "price", message: "Harga jual di bawah modal (Rp16.000)" },
    ]);
    expect(validateDraft({ ...d, bigPrice: 399999 })).toEqual([
      {
        field: "bigPrice",
        message: "Satuan besar: harga jual di bawah modal (Rp400.000)",
      },
    ]);
  });

  test("urutan masalah mengikuti urutan aturan", () => {
    const fields = validateDraft(
      draft({
        name: null,
        sellUnit: null,
        price: null,
        barcode: "1",
        tierMinQty: 5,
        bigSize: 24,
        minStock: -3,
      }),
    ).map((p) => p.field);
    expect(fields).toEqual([
      "name",
      "sellUnit",
      "price",
      "barcode",
      "tierMinQty",
      "bigName",
      "bigPrice",
      "minStock",
    ]);
  });

  test("batas stok: bulat dan 0 valid untuk pcs; ons menerima satu desimal", () => {
    expect(validateDraft(draft({ minStock: 20 }))).toEqual([]);
    expect(validateDraft(draft({ minStock: 0 }))).toEqual([]);
    expect(validateDraft(draft({ sellUnit: "ons", minStock: 2.5 }))).toEqual(
      [],
    );
    expect(
      validateDraft(draft({ sellUnit: "ons", minStock: 2.555 })),
    ).toContainEqual({
      field: "minStock",
      message: "Batas stok menipis: isi angka, mis. 20",
    });
  });
});

describe("activeBigUnit", () => {
  const unit = (id: string, active: boolean): OwnerProductUnit => ({
    id,
    productId: "p1",
    name: id,
    unitSize: id === "ecer" ? 1 : 24,
    price: 1000,
    wholesaleTiers: [],
    barcodes: [],
    cost: null,
    active,
    sold: false,
  });

  test("satuan besar aktif pertama; eceran dilewati", () => {
    const p = {
      units: [unit("ecer", true), unit("dus", false), unit("pak", true)],
    };
    expect(activeBigUnit(p)?.id).toBe("pak");
  });

  test("tanpa satuan besar aktif -> null", () => {
    expect(activeBigUnit({ units: [unit("ecer", true)] })).toBeNull();
    expect(
      activeBigUnit({ units: [unit("ecer", true), unit("dus", false)] }),
    ).toBeNull();
  });
});
