import { ID_TAKEN_MESSAGE } from "@/shared/lib/error-messages";
import { newId } from "@/shared/lib/id";
import type { ReceiptDraft } from "../drafts/draft-types";

/** Ditolak karena ID nota (atau foto) dipakai pengguna lain: hanya jalan keluarnya nota dengan ID baru (R25). */
export const isIdTaken = (d: ReceiptDraft): boolean =>
  d.status === "rejected" &&
  d.errors.some((e) => e.message === ID_TAKEN_MESSAGE);

/** Salinan antre dengan ID nota dan ID foto baru; isi nota dan foto tetap. */
export function renewIds(d: ReceiptDraft, now = Date.now()): ReceiptDraft {
  return {
    ...d,
    id: newId(now),
    status: "queued",
    errors: [],
    updatedAt: now,
    photo: d.photo && { ...d.photo, id: newId(now), uploaded: false },
  };
}
