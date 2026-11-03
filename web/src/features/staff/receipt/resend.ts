import { ID_TAKEN_MESSAGE } from "@/shared/lib/error-messages";
import { newId } from "@/shared/lib/id";
import type { ReceiptDraft } from "../drafts/draft-types";

/** Ditolak karena ID nota (atau foto) dipakai pengguna lain: hanya jalan keluarnya nota dengan ID baru (R25). */
export const isIdTaken = (d: ReceiptDraft): boolean =>
  d.status === "rejected" &&
  d.errors.some((e) => e.message === ID_TAKEN_MESSAGE);

const ID_MAX = 64;
const SUFFIX = "-r";

/**
 * ID turunan tetap dari ID lama (bukan acak): kirim ulang kedua dari draf lama yang sama
 * menghasilkan ID yang sama, jadi menimpa salinan antre (bukan menggandakan) dan server
 * memutar ulang (pengguna, id) yang sama sebagai 200. Terlalu panjang → ID acak.
 */
export function derivedId(old: string, now: number): string {
  const next = old + SUFFIX;
  return next.length <= ID_MAX ? next : newId(now);
}

/** Salinan antre dengan ID nota dan ID foto turunan; isi nota dan foto tetap. */
export function renewIds(d: ReceiptDraft, now = Date.now()): ReceiptDraft {
  return {
    ...d,
    id: derivedId(d.id, now),
    status: "queued",
    errors: [],
    updatedAt: now,
    photo: d.photo && {
      ...d.photo,
      id: derivedId(d.photo.id, now),
      uploaded: false,
    },
  };
}
