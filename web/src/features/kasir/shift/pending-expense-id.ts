import { newId } from "@/shared/lib/id";

/** Id yang belum terkonfirmasi paling lama dipakai ulang selama ini. */
export const PENDING_EXPENSE_MAX_AGE_MS = 10 * 60_000;

type Pending = {
  key: string;
  id: string;
  userId: string;
  shiftId: string;
  createdAt: number;
};

// Di luar dialog (yang dilepas saat ditutup): jawaban hilang lalu dialog dibuka ulang tetap
// memakai id yang sama, sehingga server memutar ulang, bukan mencatat dua kali.
let pending: Pending | null = null;

/**
 * Id untuk kas keluar ini. Dipakai ulang hanya bila nominal/alasan, kasir, shift sama dan umurnya
 * < 10 menit; selain itu id baru. `reused` true bila id lama dipakai ulang.
 */
export function pendingExpenseId(
  scope: { userId: string; shiftId: string },
  amount: number,
  reason: string,
  now: number = Date.now(),
): { id: string; reused: boolean } {
  const key = `${amount}|${reason}`;
  if (
    pending !== null &&
    pending.key === key &&
    pending.userId === scope.userId &&
    pending.shiftId === scope.shiftId &&
    now - pending.createdAt < PENDING_EXPENSE_MAX_AGE_MS
  ) {
    return { id: pending.id, reused: true };
  }
  pending = { key, id: newId(), ...scope, createdAt: now };
  return { id: pending.id, reused: false };
}

/**
 * Panggil setelah simpan berhasil, galat ID_TAKEN, atau kunci. Dengan `id`: hanya dilepas bila id
 * tertunda sama (mis. kas keluar itu dibatalkan dari Riwayat), agar isian sama berikutnya memakai
 * id baru dan bukan memutar ulang rekaman yang sudah batal.
 */
export function clearPendingExpenseId(id?: string): void {
  if (id === undefined || pending?.id === id) pending = null;
}
