import { describe, expect, test } from "vitest";
import type {
  OpnameItemState,
  OwnerOpnameItem,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { effectiveCount, groupItems, signedQty } from "./opname-model";

function item(
  name: string,
  state: OpnameItemState,
  patch: Partial<OwnerOpnameItem> = {},
): OwnerOpnameItem {
  return {
    productId: name,
    productName: name,
    unitName: "pcs",
    unitSize: 1,
    isCurah: false,
    countedQtyBase: 5,
    countedAt: 0,
    clockEstimated: false,
    systemQtyBase: 5,
    diffQtyBase: 0,
    state,
    reason: null,
    receiptRef: null,
    receiptOptions: [],
    value: null,
    units: [],
    resolvedByName: null,
    resolvedAt: null,
    replacedBySessionId: null,
    recount: null,
    ...patch,
  };
}

describe("groupItems", () => {
  test("bagian berurutan: ditahan, selisih, stok awal, cocok; bagian kosong dibuang", () => {
    const groups = groupItems([
      item("a", "cocok"),
      item("b", "stok_awal"),
      item("c", "disetujui"),
      item("d", "ditahan"),
      item("e", "diganti"),
      item("f", "menunggu_alasan"),
      item("g", "dihitung_ulang"),
      item("h", "disesuaikan"),
    ]);
    expect(
      groups.map((g) => [g.title, g.items.map((i) => i.productName)]),
    ).toEqual([
      ["Menunggu persetujuan", ["d"]],
      ["Selisih", ["c", "e", "f", "g", "h"]],
      ["Stok awal", ["b"]],
      ["Cocok", ["a"]],
    ]);
    expect(groupItems([item("a", "cocok")]).map((g) => g.title)).toEqual([
      "Cocok",
    ]);
  });
});

describe("effectiveCount", () => {
  test("barang dihitung ulang memakai hitungan ulang; lainnya hitungan awal", () => {
    expect(
      effectiveCount(item("a", "ditahan", { diffQtyBase: -4, value: 9 })),
    ).toEqual({
      systemQtyBase: 5,
      countedQtyBase: 5,
      diffQtyBase: -4,
      value: 9,
    });
    expect(
      effectiveCount(
        item("a", "dihitung_ulang", {
          recount: {
            countedQtyBase: 8,
            countedAt: 1,
            systemQtyBase: 6,
            diffQtyBase: 2,
            value: 4,
          },
        }),
      ),
    ).toEqual({
      systemQtyBase: 6,
      countedQtyBase: 8,
      diffQtyBase: 2,
      value: 4,
    });
  });
});

describe("signedQty", () => {
  test.each([
    [-40, 1, "pcs", "−40 pcs"],
    [3, 1, "pcs", "+3 pcs"],
    [-1500, 1000, "kg", "−1,5 kg"],
  ] as const)("%i", (diff, size, unit, text) => {
    expect(signedQty(diff, size, unit)).toBe(text);
  });
});
