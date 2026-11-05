import type {
  CashierException,
  ExceptionAttention,
  ExceptionKind,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { jakartaIsoDate } from "@/shared/lib/business-day";
import type { MockSale, MockState } from "./db";

/** (K29) Urutan tetap butir Perlu perhatian. */
export const EXCEPTION_KINDS: readonly ExceptionKind[] = [
  "batal_transaksi",
  "batal_pelunasan",
  "kasbon_lewat_limit",
];

const customerName = (
  state: Readonly<MockState>,
  id: string | null,
): string | null =>
  id === null ? null : (state.customers.find((c) => c.id === id)?.name ?? null);

/** Penjualan dari shift yang sudah tutup saat dibatalkan (ruling R12). */
const fromClosedShift = (state: Readonly<MockState>, s: MockSale): boolean =>
  state.closedShifts.some(
    (c) => c.shiftId === s.shiftId && c.closedAt <= (s.voidedAt ?? 0),
  );

function saleBased(
  state: Readonly<MockState>,
  s: MockSale,
  kind: ExceptionKind,
): CashierException {
  const base = {
    id: s.id,
    kind,
    customerName: customerName(state, s.customerId),
    saleId: s.id,
    saleNumber: s.number,
    paymentId: null,
  };
  if (kind === "kasbon_lewat_limit") {
    return {
      ...base,
      at: s.createdAt,
      kasirName: s.kasirName,
      amount: s.creditOverLimit?.excess ?? 0,
      reason: s.creditOverLimit?.reason ?? "",
      fromClosedShift: false,
      refund: 0,
      qrisToOwner: 0,
    };
  }
  const r = s.voidRefund;
  return {
    ...base,
    at: s.voidedAt ?? s.createdAt,
    kasirName: s.voidedByName ?? "",
    amount: s.total,
    reason: s.voidReason ?? "",
    fromClosedShift: fromClosedShift(state, s),
    refund: r?.drawer ?? 0,
    qrisToOwner: r?.qrisSource === "pemilik" ? r.qris : 0,
  };
}

function eventsOf(
  state: Readonly<MockState>,
  kind: ExceptionKind,
): CashierException[] {
  switch (kind) {
    case "batal_transaksi":
      return state.sales
        .filter((s) => s.voidChannel === "kasir")
        .map((s) => saleBased(state, s, kind));
    case "kasbon_lewat_limit":
      return state.sales
        .filter((s) => s.creditOverLimit !== null && s.status !== "dibatalkan")
        .map((s) => saleBased(state, s, kind));
    case "batal_pelunasan":
      return state.creditPayments
        .filter((p) => p.cancelledChannel === "kasir")
        .map(
          (p): CashierException => ({
            id: p.id,
            kind,
            at: p.cancelledAt ?? p.at,
            kasirName: p.cancelledByName ?? "",
            amount: p.amount,
            reason: p.cancelReason ?? "",
            customerName: customerName(state, p.customerId),
            saleId: null,
            saleNumber: null,
            paymentId: p.id,
            fromClosedShift: false,
            refund: 0,
            qrisToOwner: 0,
          }),
        );
  }
}

/**
 * Pengecualian kasir satu jenis (K29), terbaru dulu, semua umur — tampilan turunan dari penjualan
 * & pelunasan yang menyimpan pelaku/alasan. Pembatalan oleh pemilik sendiri bukan pengecualian.
 */
export function cashierExceptions(
  state: Readonly<MockState>,
  kind: ExceptionKind,
): CashierException[] {
  // Dibalik dulu agar kejadian dengan jam sama tetap terbaru (tercatat belakangan) dulu.
  return eventsOf(state, kind)
    .reverse()
    .sort((a, b) => b.at - a.at);
}

/** Kejadian yang belum ditinjau: `at > reviewedAt` (semua bila belum pernah). */
export function unreviewed(
  state: Readonly<MockState>,
  kind: ExceptionKind,
): CashierException[] {
  const reviewedAt = state.exceptionReviews[kind];
  return cashierExceptions(state, kind).filter(
    (e) => reviewedAt === null || e.at > reviewedAt,
  );
}

/** Butir Perlu perhatian (ruling R9): menumpuk sejak ditinjau, hanya jenis dengan count > 0. */
export function exceptionAttention(
  state: Readonly<MockState>,
): ExceptionAttention[] {
  return EXCEPTION_KINDS.flatMap((kind): ExceptionAttention[] => {
    const items = unreviewed(state, kind);
    const newest = items[0];
    const oldest = items.at(-1);
    if (!newest || !oldest) return [];
    return [
      {
        kind,
        count: items.length,
        total: items.reduce((sum, e) => sum + e.amount, 0),
        from: jakartaIsoDate(oldest.at),
        to: jakartaIsoDate(newest.at),
      },
    ];
  });
}

/** Tandai ditinjau: `reviewedAt = max(lama, min(upTo, now))` — idempoten, tidak pernah mundur. */
export function reviewExceptions(
  state: MockState,
  kind: ExceptionKind,
  upTo: number,
  now: number,
): void {
  const next = Math.min(upTo, now);
  const old = state.exceptionReviews[kind];
  state.exceptionReviews[kind] = old === null ? next : Math.max(old, next);
}
