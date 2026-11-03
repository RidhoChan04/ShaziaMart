import { describe, expect, test } from "vitest";
import type {
  OwnerProduct,
  ProductCost,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { costDirection, costLines } from "./cost-sheet-model";

type Unit = OwnerProduct["units"][number];

const unit = (over: Partial<Unit> & { name: string }): Unit => ({
  id: `u-${over.name}`,
  productId: "p1",
  unitSize: 1,
  price: 1000,
  wholesaleTiers: [],
  barcodes: [],
  cost: null,
  active: true,
  sold: false,
  ...over,
});

function indomie(from: ProductCost, to: ProductCost | null): OwnerProduct {
  return {
    id: "p1",
    name: "Indomie Goreng",
    cost: to,
    costAlert: { fromCost: from, changedAt: 1, source: "pemilik" },
    units: [
      unit({
        name: "pcs",
        price: 3100,
        wholesaleTiers: [{ minQty: 40, price: 2800 }],
      }),
      unit({ name: "dus", unitSize: 40, price: 112000 }),
    ],
  } as OwnerProduct;
}

describe("costLines", () => {
  test("barang menunggu harga jual: tanpa lembar harga, harganya diisi lewat form (R20)", () => {
    const p = indomie(
      { amount: 104000, qtyBase: 40 },
      { amount: 108000, qtyBase: 40 },
    );
    expect(costLines({ ...p, status: "menunggu_harga" })).toEqual([]);
  });

  test("Indomie {104000,40} -> {108000,40}: eceran, grosir 40+, dus", () => {
    const lines = costLines(
      indomie({ amount: 104000, qtyBase: 40 }, { amount: 108000, qtyBase: 40 }),
    );
    expect(
      lines.map((l) => ({
        label: l.label,
        price: l.price,
        oldCost: l.oldCost,
        newCost: l.newCost,
        profitBefore: l.profitBefore,
        profitAfter: l.profitAfter,
        percentBefore: l.percentBefore,
        percentAfter: l.percentAfter,
        suggested: l.suggested,
      })),
    ).toEqual([
      {
        label: "Eceran",
        price: 3100,
        oldCost: 2600,
        newCost: 2700,
        profitBefore: 500,
        profitAfter: 400,
        percentBefore: 19,
        percentAfter: 15,
        suggested: 3500,
      },
      {
        label: "Grosir",
        price: 2800,
        oldCost: 2600,
        newCost: 2700,
        profitBefore: 200,
        profitAfter: 100,
        percentBefore: 8,
        percentAfter: 4,
        suggested: 3000,
      },
      {
        label: "Dus",
        price: 112000,
        oldCost: 104000,
        newCost: 108000,
        profitBefore: 8000,
        profitAfter: 4000,
        percentBefore: 8,
        percentAfter: 4,
        suggested: 116500,
      },
    ]);
  });

  test("tanpa costAlert atau tanpa modal sekarang -> kosong", () => {
    const p = indomie({ amount: 104000, qtyBase: 40 }, null);
    expect(costLines(p)).toEqual([]);
    expect(
      costLines({
        ...indomie({ amount: 1, qtyBase: 1 }, { amount: 2, qtyBase: 1 }),
        costAlert: null,
      }),
    ).toEqual([]);
  });

  test("satuan besar nonaktif tidak ikut", () => {
    const p = indomie(
      { amount: 104000, qtyBase: 40 },
      { amount: 108000, qtyBase: 40 },
    );
    const dus = p.units[1];
    if (!dus) throw new Error("fixture");
    dus.active = false;
    expect(costLines(p).map((l) => l.label)).toEqual(["Eceran", "Grosir"]);
  });

  test("baris yang modalnya tidak berubah setelah pembulatan: tanpa saran", () => {
    // 104000/40 -> 104010/40: eceran 2600 -> 2600 (2600,25 dibulatkan), dus 104000 -> 104010
    const lines = costLines(
      indomie({ amount: 104000, qtyBase: 40 }, { amount: 104010, qtyBase: 40 }),
    );
    const [eceran, , dus] = lines;
    expect(eceran?.oldCost).toBe(2600);
    expect(eceran?.newCost).toBe(2600);
    expect(eceran?.suggested).toBeNull();
    expect(dus?.oldCost).toBe(104000);
    expect(dus?.newCost).toBe(104010);
    expect(dus?.suggested).toBe(112500);
  });

  test("modal lama 0 -> tanpa saran dan tanpa persen", () => {
    const [eceran] = costLines(
      indomie({ amount: 0, qtyBase: 1 }, { amount: 2700, qtyBase: 1 }),
    );
    expect(eceran?.suggested).toBeNull();
    expect(eceran?.percentBefore).toBeNull();
    expect(eceran?.percentAfter).toBe(15);
  });
});

describe("costDirection", () => {
  test("naik dan turun dari baris eceran", () => {
    expect(
      costDirection(
        indomie(
          { amount: 104000, qtyBase: 40 },
          { amount: 108000, qtyBase: 40 },
        ),
      ),
    ).toBe("naik");
    expect(
      costDirection(
        indomie(
          { amount: 104000, qtyBase: 40 },
          { amount: 100000, qtyBase: 40 },
        ),
      ),
    ).toBe("turun");
  });

  test("eceran terbulatkan sama: arah dari rasio persis", () => {
    expect(
      costDirection(
        indomie(
          { amount: 104000, qtyBase: 40 },
          { amount: 104010, qtyBase: 40 },
        ),
      ),
    ).toBe("naik");
    expect(
      costDirection(
        indomie(
          { amount: 104000, qtyBase: 40 },
          { amount: 103990, qtyBase: 40 },
        ),
      ),
    ).toBe("turun");
  });
});
