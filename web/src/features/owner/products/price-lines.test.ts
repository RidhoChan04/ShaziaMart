import { describe, expect, test } from "vitest";
import type {
  OwnerProduct,
  PriceHistoryEntry,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { historyLabel, priceLines } from "./price-lines";

const unit = (
  over: Partial<OwnerProduct["units"][number]> & { name: string },
): OwnerProduct["units"][number] => ({
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

const product = (units: OwnerProduct["units"]): OwnerProduct =>
  ({ id: "p1", units }) as OwnerProduct;

describe("priceLines", () => {
  test("eceran, tier urut minQty, lalu satuan besar aktif; label, detail, dan modal per baris", () => {
    const lines = priceLines(
      product([
        unit({
          name: "pcs",
          price: 3100,
          cost: 2600,
          wholesaleTiers: [
            { minQty: 100, price: 2700 },
            { minQty: 40, price: 2800 },
          ],
        }),
        unit({ name: "dus", unitSize: 40, price: 112000, cost: 104000 }),
      ]),
    );
    expect(lines).toEqual([
      {
        key: "u-pcs:eceran",
        unitId: "u-pcs",
        tierMinQty: null,
        label: "Eceran",
        detail: "per pcs",
        unitSize: 1,
        price: 3100,
        cost: 2600,
      },
      {
        key: "u-pcs:40",
        unitId: "u-pcs",
        tierMinQty: 40,
        label: "Grosir",
        detail: "beli 40+ pcs",
        unitSize: 1,
        price: 2800,
        cost: 2600,
      },
      {
        key: "u-pcs:100",
        unitId: "u-pcs",
        tierMinQty: 100,
        label: "Grosir",
        detail: "beli 100+ pcs",
        unitSize: 1,
        price: 2700,
        cost: 2600,
      },
      {
        key: "u-dus:eceran",
        unitId: "u-dus",
        tierMinQty: null,
        label: "Dus",
        detail: "isi 40 pcs",
        unitSize: 40,
        price: 112000,
        cost: 104000,
      },
    ]);
  });

  test("satuan besar nonaktif tidak tampil; modal kosong tetap null; isi curah memakai satuan tampilan", () => {
    const lines = priceLines(
      product([
        unit({ name: "kg", unitSize: 1000, price: 18000 }),
        unit({ name: "karung", unitSize: 25000, price: 400000 }),
        unit({ name: "bal", unitSize: 50000, price: 1, active: false }),
      ]),
    );
    expect(lines.map((l) => [l.label, l.detail, l.cost])).toEqual([
      ["Eceran", "per kg", null],
      ["Karung", "isi 25 kg", null],
    ]);
  });
});

describe("historyLabel", () => {
  const entry = (over: Partial<PriceHistoryEntry>): PriceHistoryEntry => ({
    id: "e",
    at: 0,
    unitId: "u",
    unitName: "pcs",
    isEceran: true,
    unitSize: 1,
    tierMinQty: null,
    oldPrice: 1,
    newPrice: 2,
    source: "pemilik",
    ...over,
  });
  test.each([
    [{}, "Eceran"],
    [{ tierMinQty: 40 }, "Grosir 40+"],
    [{ isEceran: false, unitName: "dus", unitSize: 40 }, "Dus"],
  ])("%j -> %s", (over, label) =>
    expect(historyLabel(entry(over))).toBe(label),
  );
});
