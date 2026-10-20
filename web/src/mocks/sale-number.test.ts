import { describe, expect, test } from "vitest";
import { formatSaleNumber, jakartaDateKey } from "./sale-number";

describe("nomor struk", () => {
  test("formatSaleNumber zona Asia/Jakarta", () =>
    expect(formatSaleNumber(Date.UTC(2026, 9, 16, 18, 30), 42)).toBe(
      "20261017-0042",
    ));

  test.each([
    [Date.UTC(2026, 9, 16, 16, 59, 59, 999), "20261016"],
    [Date.UTC(2026, 9, 16, 17, 0), "20261017"],
    [Date.UTC(2026, 11, 31, 17, 0), "20270101"],
  ])("jakartaDateKey(%i) = %s", (ms, key) =>
    expect(jakartaDateKey(ms)).toBe(key),
  );

  test("urutan diisi nol sampai 4 digit", () => {
    const at = Date.UTC(2026, 9, 20, 3);
    expect(formatSaleNumber(at, 1)).toBe("20261020-0001");
    expect(formatSaleNumber(at, 9999)).toBe("20261020-9999");
  });
});
