import { newId } from "@/shared/lib/id";

type Pending = { key: string; id: string };

// Di luar lembar (yang dilepas saat ditutup): jawaban hilang lalu lembar dibuka
// ulang tetap memakai id yang sama, sehingga server memutar ulang, bukan mencatat dua kali.
let pending: Pending | null = null;

/** Id untuk pelunasan ini; dipakai ulang sampai berhasil, baru bila pelanggan/nominal/cara berubah. */
export function pendingRepaymentId(
  customerId: string,
  amount: number,
  method: string,
): string {
  const key = `${customerId}|${amount}|${method}`;
  if (pending?.key !== key) pending = { key, id: newId() };
  return pending.id;
}

/** Panggil setelah simpan berhasil: pelunasan berikutnya memakai id baru. */
export function clearPendingRepaymentId(): void {
  pending = null;
}
