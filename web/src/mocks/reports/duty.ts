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
 * Nama pencatat per catatan orang toko untuk barang `productId` di jeda: nota barang masuk aktif,
 * keluarkan kedaluwarsa, dan sesi opname selain `excludeSessionId`. Catatan pemilik dibuang:
 * nota & sesi lewat id pembuat; log kedaluwarsa hanya menyimpan nama, jadi lewat nama pemilik.
 */
function recordNames(
  state: Readonly<MockState>,
  productId: string,
  inGap: (at: number) => boolean,
  excludeSessionId: string,
): string[] {
  const owners = state.users.filter((u) => u.role === "pemilik");
  const ownerIds = new Set(owners.map((u) => u.id));
  const ownerNames = new Set(owners.map((u) => u.name));
  const receipts = state.receipts
    .filter(
      (r) =>
        r.status === "aktif" &&
        !ownerIds.has(r.createdById) &&
        inGap(r.createdAt) &&
        r.lines.some((l) => l.productId === productId),
    )
    .map((r) => r.createdByName);
  const expiry = state.expiryLog
    .filter(
      (e) =>
        e.kind === "keluar" &&
        !ownerNames.has(e.actorName) &&
        e.productId === productId &&
        inGap(e.at),
    )
    .map((e) => e.actorName);
  const sessions = state.opnameSessions
    .filter(
      (s) =>
        s.id !== excludeSessionId &&
        !ownerIds.has(s.createdById) &&
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
  const people = new Map<string, DutyEntry>();
  const entryOf = (name: string): DutyEntry => {
    const found = people.get(name) ?? { name, shifts: 0, records: 0 };
    people.set(name, found);
    return found;
  };
  for (const name of shiftNames(state, from, to)) entryOf(name).shifts += 1;
  const inGap = (at: number): boolean => at > from && at <= to;
  for (const name of recordNames(state, productId, inGap, excludeSessionId)) {
    entryOf(name).records += 1;
  }
  return [...people.values()].sort((a, b) => byName(a.name, b.name));
}
