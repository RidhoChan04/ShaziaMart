import { expect, test } from "vitest";
import { findByBarcode } from "./count-model";
import { product } from "./opname-fixtures";

const withCodes = (id: string, codes: string[]) => {
  const p = product(id, id);
  return {
    ...p,
    units: [{ id: `${id}-u`, name: "pcs", unitSize: 1, barcodes: codes }],
  };
};

test("findByBarcode: nol di depan diabaikan (UPC-A vs EAN-13)", () => {
  const a = withCodes("a", ["089686010947"]);
  expect(findByBarcode([a], "0089686010947")).toBe(a);
  expect(findByBarcode([a], "089686010947")).toBe(a);
  expect(findByBarcode([a], "089686010948")).toBeUndefined();
});

test("findByBarcode: kode semua-nol tidak cocok dengan barcode kosong/nol", () => {
  const empty = withCodes("e", [""]);
  const zero = withCodes("z", ["0000"]);
  expect(findByBarcode([empty, zero], "0000000000000")).toBeUndefined();
  expect(findByBarcode([empty, zero], "")).toBeUndefined();
});
