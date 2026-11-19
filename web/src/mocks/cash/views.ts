import type {
  DrawerExpense,
  OwnerCashTake,
  OwnerDrawerExpense,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import type { MockCashTake, MockDrawerExpense, MockState } from "../db";
import { cancellableTake } from "./drawer";

/** Kas keluar untuk kasir: hanya status, tanpa data pembatal (siapa, jam, alasan batal). */
export const toDrawerExpense = (e: MockDrawerExpense): DrawerExpense => ({
  id: e.id,
  at: e.at,
  amount: e.amount,
  reason: e.reason,
  kasirName: e.createdByName,
  shiftId: e.shiftId,
  status: e.cancelledAt === null ? "aktif" : "dibatalkan",
});

/**
 * Kas keluar untuk pemilik + data pembatalan. `cancellable` = shift tempatnya sudah tutup dan belum
 * dibatalkan (kas keluar shift yang masih buka hanya dibatalkan dari kasir).
 */
export function toOwnerDrawerExpense(
  state: Readonly<MockState>,
  e: MockDrawerExpense,
): OwnerDrawerExpense {
  const cancelled =
    e.cancelledAt === null
      ? null
      : {
          at: e.cancelledAt,
          byName: e.cancelledByName ?? "",
          reason: e.cancelReason ?? "",
          channel: e.cancelledChannel ?? "pemilik",
        };
  return {
    ...toDrawerExpense(e),
    cancelled,
    cancellable: cancelled === null && state.shift?.id !== e.shiftId,
  };
}

/** Nama kasir shift `shiftId` (shift buka atau tutup); null bila tidak dikenal. */
function kasirNameOf(
  state: Readonly<MockState>,
  shiftId: string | null,
): string | null {
  if (shiftId === null) return null;
  if (state.shift?.id === shiftId) return state.shift.kasirName;
  return (
    state.closedShifts.find((c) => c.shiftId === shiftId)?.kasirName ?? null
  );
}

/** Ambil uang pemilik (R4: `consumedByKasirName` membedakan dua alasan terkunci). */
export const toOwnerCashTake = (
  state: Readonly<MockState>,
  t: MockCashTake,
): OwnerCashTake => ({
  id: t.id,
  at: t.at,
  amount: t.amount,
  note: t.note,
  shiftId: t.shiftId,
  shiftKasirName: kasirNameOf(state, t.shiftId),
  consumedByKasirName: kasirNameOf(state, t.consumedByShiftId),
  cancelled:
    t.cancelledAt === null
      ? null
      : {
          at: t.cancelledAt,
          byName: t.cancelledByName ?? "",
          reason: t.cancelReason ?? "",
        },
  cancellable: cancellableTake(state, t),
});
