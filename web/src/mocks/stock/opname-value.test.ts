import { expect, test } from "vitest";
import {
  CLOCK_SKEW_MS,
  diffValue,
  effectiveCountedAt,
  isHeld,
  sessionFlagged,
} from "./opname-value";

const NOW = Date.UTC(2026, 10, 5, 3);

// Indomie HPP {104000, 40} = Rp2.600/pcs
test.each([
  [-7, 18200],
  [4, 10400],
  [-40, 104000],
  [0, 0],
])("diffValue(%i) = %i", (d, v) =>
  expect(diffValue(d, { amount: 104000, qtyBase: 40 })).toBe(v),
);

test("diffValue membulatkan setengah ke atas (Gula {16500, 1000}: 3 g = Rp49,5 → Rp50)", () => {
  expect(diffValue(-3, { amount: 16500, qtyBase: 1000 })).toBe(50);
  expect(diffValue(1, { amount: 16500, qtyBase: 1000 })).toBe(17);
});

test("tanpa HPP → null → ditahan (J3); batas ketat", () => {
  expect(diffValue(-1, null)).toBeNull();
  expect(isHeld(null, 100_000)).toBe(true);
  expect(isHeld(100_000, 100_000)).toBe(false);
  expect(isHeld(100_001, 100_000)).toBe(true);
});

test("sesi: 90.000 + 90.000 + 80.000 = 260.000 > 250.000 → ditandai; null diabaikan", () => {
  expect(sessionFlagged([90_000, 90_000, 80_000], 250_000)).toBe(true);
  expect(sessionFlagged([90_000, null, 80_000], 250_000)).toBe(false);
  expect(sessionFlagged([150_000, 100_000], 250_000)).toBe(false);
  expect(sessionFlagged([], 250_000)).toBe(false);
});

test("batas jam HP 5 menit", () => expect(CLOCK_SKEW_MS).toBe(300_000));

test.each([
  [
    "jam HP telat 4 menit → digeser 4 menit, tidak ditandai",
    NOW - 3_600_000,
    NOW - 240_000,
    NOW - 3_360_000,
    false,
  ],
  [
    "jam HP telat 6 menit → digeser 6 menit, ditandai",
    NOW - 3_600_000,
    NOW - 360_000,
    NOW - 3_240_000,
    true,
  ],
  [
    "jam HP cepat 10 menit, hitung 3 jam lalu → digeser mundur, ditandai",
    NOW - 10_200_000,
    NOW + 600_000,
    NOW - 10_800_000,
    true,
  ],
  [
    "hasil geser di masa depan → dijepit ke jam server",
    NOW + 60_000,
    NOW,
    NOW,
    true,
  ],
  [
    "selisih jam tepat 5 menit → digeser, tidak ditandai",
    NOW - 600_000,
    NOW - 300_000,
    NOW - 300_000,
    false,
  ],
  ["jam hitung tepat jam server → tidak dijepit", NOW, NOW, NOW, false],
])("effectiveCountedAt: %s", (_, counted, device, at, estimated) =>
  expect(effectiveCountedAt(counted, device, NOW)).toEqual({ at, estimated }),
);
