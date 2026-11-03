import { describe, expect, test } from "vitest";
import type { ProductCost } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { unitCost } from "@/shared/lib/product-rules";
import { sameCost } from "../products/cost-alert";
import { receiveCost, reviseCost } from "./hpp";

// Indomie HPP {104000,40} = Rp2.600/pcs
describe("receiveCost (K3)", () => {
  test("receiveCost: stok 60, masuk 2 dus × Rp112.000 → {380000,140} (Rp2.714/pcs)", () => {
    const c = receiveCost({ amount: 104000, qtyBase: 40 }, 60, 80, 224000);
    expect(c).toEqual({ amount: 380000, qtyBase: 140 });
    expect(unitCost(c, 1)).toBe(2714);
  });

  test("receiveCost: Gula {16500,1000} stok 20 kg, masuk 50 kg × Rp16.200 → {1140000,70000} (Rp16.286/kg)", () => {
    const c = receiveCost(
      { amount: 16500, qtyBase: 1000 },
      20000,
      50000,
      810000,
    );
    expect(c).toEqual({ amount: 1140000, qtyBase: 70000 });
    expect(unitCost(c, 1000)).toBe(16286);
  });

  test("receiveCost: stok −2 atau 0 → harga terbaru; HPP null → harga terbaru", () => {
    expect(receiveCost({ amount: 36000, qtyBase: 1 }, -2, 12, 408000)).toEqual({
      amount: 408000,
      qtyBase: 12,
    });
    expect(receiveCost({ amount: 36000, qtyBase: 1 }, 0, 12, 408000)).toEqual({
      amount: 408000,
      qtyBase: 12,
    });
    expect(receiveCost(null, 50, 10, 30000)).toEqual({
      amount: 30000,
      qtyBase: 10,
    });
  });

  test("Bimoli {34000,1} stok 4, masuk 12 × Rp34.000 → modal tetap Rp34.000 (dibandingkan menurut nilai, R10)", () => {
    const c = receiveCost({ amount: 34000, qtyBase: 1 }, 4, 12, 408000);
    expect(sameCost(c, { amount: 34000, qtyBase: 1 })).toBe(true);
    expect(unitCost(c, 1)).toBe(34000);
  });

  test("barang bonus (harga 0) menurunkan HPP", () => {
    const c = receiveCost({ amount: 104000, qtyBase: 40 }, 40, 40, 0);
    expect(sameCost(c, { amount: 1300, qtyBase: 1 })).toBe(true);
  });
});

const H: ProductCost = { amount: 380000, qtyBase: 140 };
const OLD = { qtyBase: 80, cost: 224000 };

describe("reviseCost (K4)", () => {
  test.each<
    [
      string,
      number,
      { qtyBase: number; cost: number } | null,
      ProductCost,
      number,
    ]
  >([
    [
      "ubah harga 112.000→108.000, stok 120",
      120,
      { qtyBase: 80, cost: 216000 },
      { amount: 317714, qtyBase: 120 },
      2648,
    ],
    [
      "ubah jumlah 2→1 dus, stok 120",
      120,
      { qtyBase: 40, cost: 112000 },
      { amount: 213714, qtyBase: 80 },
      2671,
    ],
    ["batal, stok 120", 120, null, { amount: 101714, qtyBase: 40 }, 2543],
    [
      "ubah 2→1 dus, stok 30 (penyebut −10) → harga baru",
      30,
      { qtyBase: 40, cost: 112000 },
      { amount: 112000, qtyBase: 40 },
      2800,
    ],
    ["batal, stok 70 (penyebut −10) → HPP tetap", 70, null, H, 2714],
  ])("reviseCost %s", (_, stock, next, cost, perPcs) => {
    const c = reviseCost(H, stock, OLD, next);
    expect(c).toEqual(cost);
    expect(unitCost(c, 1)).toBe(perPcs);
  });

  test("reviseCost: nilai negatif → batal HPP tetap; baris tidak berubah → objek sama", () => {
    expect(
      reviseCost(
        { amount: 100000, qtyBase: 100 },
        100,
        { qtyBase: 50, cost: 125000 },
        null,
      ),
    ).toEqual({ amount: 100000, qtyBase: 100 });
    expect(reviseCost(H, 120, OLD, { qtyBase: 80, cost: 224000 })).toBe(H);
  });

  test("nilai negatif saat ubah → harga baru", () => {
    expect(
      reviseCost(
        { amount: 100000, qtyBase: 100 },
        100,
        { qtyBase: 50, cost: 125000 },
        { qtyBase: 50, cost: 10000 },
      ),
    ).toEqual({ amount: 10000, qtyBase: 50 });
  });

  test("penyebut tepat 0: ubah → harga baru, batal → HPP tetap", () => {
    // stok 80 = seluruh nota; batal → qty 0
    expect(reviseCost(H, 80, OLD, null)).toBe(H);
    // ubah ke 0 tidak mungkin (qty ≥ 1); stok 40, ubah 80→40 → qty 0
    expect(reviseCost(H, 40, OLD, { qtyBase: 40, cost: 112000 })).toEqual({
      amount: 112000,
      qtyBase: 40,
    });
  });

  test("stok minus dianggap 0", () => {
    expect(reviseCost(H, -5, OLD, null)).toBe(H);
    expect(reviseCost(H, -5, OLD, { qtyBase: 40, cost: 112000 })).toEqual({
      amount: 112000,
      qtyBase: 40,
    });
  });

  test("HPP null: ubah → harga baru, batal → tetap null", () => {
    expect(reviseCost(null, 120, OLD, { qtyBase: 40, cost: 112000 })).toEqual({
      amount: 112000,
      qtyBase: 40,
    });
    expect(reviseCost(null, 120, OLD, null)).toBeNull();
  });

  test("ubah lalu kembalikan: HPP kembali ke nilai yang sama (tanpa pergeseran pembulatan)", () => {
    // stok 120: nilai H = round(120 × 380000 ÷ 140) = 325714
    const edited = reviseCost(H, 120, OLD, { qtyBase: 80, cost: 216000 });
    const back = reviseCost(edited, 120, { qtyBase: 80, cost: 216000 }, OLD);
    expect(back).toEqual({ amount: 325714, qtyBase: 120 });
    expect(unitCost(back, 1)).toBe(unitCost(H, 1));
  });
});
