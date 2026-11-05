import type { ProductCost } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { roundHalfUp } from "@/shared/lib/quantity";
import { usableCost } from "../receipts/check";

/** K6: selisih jam HP − jam server di atas ini membuat jam hitung ditandai perkiraan. */
export const CLOCK_SKEW_MS = 300_000;

/** K3: nilai rupiah mutlak selisih dari HPP; null bila HPP belum ada (J3). */
export function diffValue(
  diffQtyBase: number,
  cost: ProductCost | null,
): number | null {
  const c = usableCost(cost);
  return c === null
    ? null
    : roundHalfUp(Math.abs(diffQtyBase) * c.amount, c.qtyBase);
}

/** K3: tanpa HPP selalu ditahan; batas ketat. */
export const isHeld = (value: number | null, itemLimit: number): boolean =>
  value === null || value > itemLimit;

/** K3: Σ nilai yang diketahui melewati batas sesi (ketat). */
export const sessionFlagged = (
  values: readonly (number | null)[],
  sessionLimit: number,
): boolean =>
  values.reduce<number>((sum, v) => sum + (v ?? 0), 0) > sessionLimit;

/**
 * K6: jam hitung dari HP digeser sebesar selisih jam HP terhadap server; ditandai perkiraan bila
 * selisihnya > 5 menit, atau bila hasilnya di masa depan (dijepit ke jam server).
 */
export function effectiveCountedAt(
  countedAt: number,
  deviceNow: number,
  serverNow: number,
): { at: number; estimated: boolean } {
  const offset = serverNow - deviceNow;
  const at = countedAt + offset;
  if (at > serverNow) return { at: serverNow, estimated: true };
  return { at, estimated: Math.abs(offset) > CLOCK_SKEW_MS };
}
