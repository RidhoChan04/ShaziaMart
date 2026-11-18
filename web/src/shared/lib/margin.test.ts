import { expect, test } from "vitest";
import { formatPermille, marginPermille } from "./margin";

test("marginPermille (jawaban pemilik Q5): tanda(laba) × round_half_up(|laba| × 1000 / omzet)", () => {
  expect(marginPermille(48_215_500, 7_912_300)).toBe(164);
  expect(marginPermille(9_000_000, 1_500_000)).toBe(167);
  // 62,5‰ → setengah ke atas 63 (juga untuk minus).
  expect(marginPermille(4_000_000, 250_000)).toBe(63);
  expect(marginPermille(4_000_000, -250_000)).toBe(-63);
  expect(marginPermille(10_000, -210)).toBe(-21);
  expect(marginPermille(1_000_000, 0)).toBe(0);
  expect(marginPermille(0, 0)).toBeNull();
  expect(marginPermille(0, -5_000)).toBeNull();
});

test("formatPermille: satu desimal koma, minus U+2212, tanda persen", () => {
  expect(formatPermille(164)).toBe("16,4%");
  expect(formatPermille(125)).toBe("12,5%");
  expect(formatPermille(1_000)).toBe("100,0%");
  expect(formatPermille(8)).toBe("0,8%");
  expect(formatPermille(0)).toBe("0,0%");
  expect(formatPermille(-21)).toBe("−2,1%");
  expect(formatPermille(-5)).toBe("−0,5%");
  expect(formatPermille(-1_250)).toBe("−125,0%");
});
