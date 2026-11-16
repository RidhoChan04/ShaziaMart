import type { DutyEntry } from "@/shared/api/gen/shaziaMartAPI.schemas";
import type { MockState } from "../db";
import { byName } from "./report-utils";

/** Nama kasir per shift yang tumpang dengan jeda (`from`; `to`]; shift buka belum punya jam tutup. */
function shiftNames(
  state: Readonly<MockState>,
  from: number,
  to: number,
): string[] {
  const shifts = state.closedShifts.map((s) => ({
    name: s.kasirName,
    openedAt: s.openedAt,
    closedAt: s.closedAt,
  }));
  if (state.shift) {
    shifts.push({
      name: state.shift.kasirName,
      openedAt: state.shift.openedAt,
      closedAt: Number.POSITIVE_INFINITY,
    });
  }
  return shifts
    .filter((s) => s.openedAt <= to && s.closedAt > from)
    .map((s) => s.name);
}

/**
 * Nama pencatat per catatan barang `productId` di jeda: nota barang masuk aktif, keluarkan
 * kedaluwarsa, dan sesi opname selain `excludeSessionId`.
 */
function recordNames(
  state: Readonly<MockState>,
  productId: string,
  inGap: (at: number) => boolean,
  excludeSessionId: string,
): string[] {
  const receipts = state.receipts
    .filter(
      (r) =>
        r.status === "aktif" &&
        inGap(r.createdAt) &&
        r.lines.some((l) => l.productId === productId),
    )
    .map((r) => r.createdByName);
  const expiry = state.expiryLog
    .filter(
      (e) => e.kind === "keluar" && e.productId === productId && inGap(e.at),
    )
    .map((e) => e.actorName);
  const sessions = state.opnameSessions
    .filter(
      (s) =>
        s.id !== excludeSessionId &&
        s.items.some((i) => i.productId === productId && inGap(i.countedAt)),
    )
    .map((s) => s.createdByName);
  return [...receipts, ...expiry, ...sessions];
}

/**
 * (K20, P11) Yang bertugas di jeda (`from`; `to`] untuk barang `productId`: kasir yang shift-nya
 * (`closedShifts` + shift yang masih buka) tumpang dengan jeda, dan orang toko yang punya catatan
 * barang itu di jeda — nota barang masuk aktif, keluarkan kedaluwarsa, dan sesi opname lain
 * (selain `excludeSessionId`, sesi hitungan itu sendiri). Pemilik bukan orang toko, jadi
 * catatannya tidak ikut. Digabung per nama, urut nama. Petunjuk, bukan bukti.
 */
export function dutyBetween(
  state: Readonly<MockState>,
  productId: string,
  from: number,
  to: number,
  excludeSessionId: string,
): DutyEntry[] {
  const owners = new Set(
    state.users.filter((u) => u.role === "pemilik").map((u) => u.name),
  );
  const people = new Map<string, DutyEntry>();
  const entryOf = (name: string): DutyEntry => {
    const found = people.get(name) ?? { name, shifts: 0, records: 0 };
    people.set(name, found);
    return found;
  };
  for (const name of shiftNames(state, from, to)) entryOf(name).shifts += 1;
  const inGap = (at: number): boolean => at > from && at <= to;
  for (const name of recordNames(state, productId, inGap, excludeSessionId)) {
    if (!owners.has(name)) entryOf(name).records += 1;
  }
  return [...people.values()].sort((a, b) => byName(a.name, b.name));
}
