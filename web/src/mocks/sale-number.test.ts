import { describe, expect, test } from "vitest";
import { formatSaleNumber } from "./sale-number";

describe("nomor struk", () => {
  test("formatSaleNumber zona Asia/Jakarta", () =>
    expect(formatSaleNumber(Date.UTC(2026, 9, 16, 18, 30), 42)).toBe(
      "20261017-0042",
    ));

  test("urutan diisi nol sampai 4 digit", () => {
    const at = Date.UTC(2026, 9, 20, 3);
    expect(formatSaleNumber(at, 1)).toBe("20261020-0001");
    expect(formatSaleNumber(at, 9999)).toBe("20261020-9999");
  });
});
