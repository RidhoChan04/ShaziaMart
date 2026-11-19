import type { KasirCreditPayment } from "@/shared/api/gen/shaziaMartAPI.schemas";

/** Pelunasan kembar dicari sejauh ini ke belakang (K15). */
export const DUPLICATE_WINDOW_MS = 60 * 60_000;

/**
 * Pelunasan tidak dibatalkan untuk pelanggan & nominal yang sama, dengan id lain, yang
 * tercatat sejak `now − 60 menit`; bila beberapa, yang terbaru. Cara bayar tidak menentukan.
 */
export function findRecentDuplicate(
  list: readonly KasirCreditPayment[],
  q: { customerId: string; amount: number; id: string; now: number },
): KasirCreditPayment | null {
  const since = q.now - DUPLICATE_WINDOW_MS;
  let latest: KasirCreditPayment | null = null;
  for (const p of list) {
    if (
      p.status === "dibatalkan" ||
      p.id === q.id ||
      p.customerId !== q.customerId ||
      p.amount !== q.amount ||
      p.createdAt < since
    ) {
      continue;
    }
    if (latest === null || p.createdAt > latest.createdAt) latest = p;
  }
  return latest;
}
