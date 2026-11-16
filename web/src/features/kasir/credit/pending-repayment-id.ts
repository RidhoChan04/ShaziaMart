import { newId } from "@/shared/lib/id";

/** Id yang belum terkonfirmasi paling lama dipakai ulang selama ini. */
export const PENDING_MAX_AGE_MS = 10 * 60_000;

type Pending = {
  key: string;
  id: string;
  userId: string;
  shiftId: string;
  createdAt: number;
};

// Di luar lembar (yang dilepas saat ditutup): jawaban hilang lalu lembar dibuka
// ulang tetap memakai id yang sama, sehingga server memutar ulang, bukan mencatat dua kali.
let pending: Pending | null = null;

/**
 * Id untuk pelunasan ini. Dipakai ulang hanya bila pelanggan/nominal/cara, kasir, shift
 * sama dan umurnya < 10 menit; selain itu id baru. `reused` true bila id lama dipakai ulang.
 */
export function pendingRepaymentId(
  scope: { userId: string; shiftId: string },
  customerId: string,
  amount: number,
  method: string,
  now: number = Date.now(),
): { id: string; reused: boolean } {
  const key = `${customerId}|${amount}|${method}`;
  if (
    pending !== null &&
    pending.key === key &&
    pending.userId === scope.userId &&
    pending.shiftId === scope.shiftId &&
    now - pending.createdAt < PENDING_MAX_AGE_MS
  ) {
    return { id: pending.id, reused: true };
  }
  pending = { key, id: newId(), ...scope, createdAt: now };
  return { id: pending.id, reused: false };
}

/** Panggil setelah simpan berhasil, galat ID_TAKEN, kunci, atau shift berganti. */
export function clearPendingRepaymentId(): void {
  pending = null;
}
