import { describe, expect, test } from "vitest";
import type { MockState } from "../db";
import { eceranOf } from "../products/views";
import {
  BERAS5,
  BIMOLI,
  blankState,
  GULA,
  INDOMIE,
  KOPI,
  productNamed,
} from "./report-fixtures";
import { thinMarginReport } from "./thin-margin";

/** Harga eceran 10.000 dan HPP per eceran `cost` (satuan eceran 1). */
function priced(s: MockState, name: string, cost: number | null) {
  const p = productNamed(s, name);
  eceranOf(p).price = 10_000;
  p.cost = cost === null ? null : { amount: cost, qtyBase: 1 };
}

describe("thinMarginReport (K18, P10)", () => {
  test.each([
    [9_100, true, 90],
    [9_000, false, 100],
    [9_001, true, 100],
    [10_500, true, -50],
  ])("modal %i → tipis %s, permil %i", (cost, thin, permille) => {
    const s = blankState([KOPI]);
    priced(s, KOPI, cost);
    const report = thinMarginReport(s);
    expect(report.thresholdPermille).toBe(100);
    expect(report.count).toBe(thin ? 1 : 0);
    if (thin) {
      expect(report.items[0]).toEqual({
        productId: productNamed(s, KOPI).id,
        productName: KOPI,
        unitName: "pcs",
        price: 10_000,
        unitCost: cost,
        marginPermille: permille,
      });
    }
  });

  test("tanpa HPP / nonaktif / menunggu harga tidak ikut; urut permil naik (rugi dulu); HPP per eceran memakai unitSize eceran", () => {
    const s = blankState([INDOMIE, BIMOLI, BERAS5, KOPI, GULA]);
    priced(s, KOPI, null);
    priced(s, BIMOLI, 9_500);
    productNamed(s, BIMOLI).status = "nonaktif";
    priced(s, BERAS5, 9_500);
    productNamed(s, BERAS5).status = "menunggu_harga";
    // Indomie: HPP dari modal dus {104000, 40} → 2.600/pcs, harga pcs 2.700 → 37‰.
    eceranOf(productNamed(s, INDOMIE)).price = 2_700;
    // Gula curah: eceran kg (1000 g), HPP {16500, 1000} → 16.500/kg; harga 17.000 → 29‰.
    eceranOf(productNamed(s, GULA)).price = 17_000;
    const report = thinMarginReport(s);
    expect(
      report.items.map((i) => [i.productName, i.unitCost, i.marginPermille]),
    ).toEqual([
      [GULA, 16_500, 29],
      [INDOMIE, 2_600, 37],
    ]);
    expect(report.items[0]?.unitName).toBe("kg");
    expect(report.count).toBe(2);
  });

  test("harga eceran 0 tidak ikut; seri permil → nama", () => {
    const s = blankState([BIMOLI, KOPI, INDOMIE]);
    priced(s, KOPI, 9_500);
    priced(s, BIMOLI, 9_500);
    priced(s, INDOMIE, 9_000);
    eceranOf(productNamed(s, INDOMIE)).price = 0;
    expect(thinMarginReport(s).items.map((i) => i.productName)).toEqual([
      KOPI,
      BIMOLI,
    ]);
  });

  test("(koreksi mockup M3) modal 10.210 & 10.500 (rugi) di depan modal 9.100; items[0].marginPermille −50", () => {
    const s = blankState([BIMOLI, KOPI, BERAS5]);
    priced(s, KOPI, 9_100);
    priced(s, BIMOLI, 10_210);
    priced(s, BERAS5, 10_500);
    const report = thinMarginReport(s);
    expect(report.items.map((i) => [i.productName, i.marginPermille])).toEqual([
      [BERAS5, -50],
      [BIMOLI, -21],
      [KOPI, 90],
    ]);
    expect(report.items[0]?.marginPermille).toBe(-50);
  });
});
