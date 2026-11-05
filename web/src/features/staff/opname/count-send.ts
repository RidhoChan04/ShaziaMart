import type { SyncReport } from "../drafts/sync-core";
import type { OpnameDraft } from "./opname-draft-types";

/**
 * `sent`: server menerima (ID draf = ID sesi); `queued`: tersimpan antre, terkirim otomatis nanti;
 * `rejected`: server menolak (draf berstatus `rejected` + galat per barang); `failed`: gagal disimpan di HP.
 */
export type SendOutcome = "sent" | "queued" | "rejected" | "failed";

/** Simpan draf antre di HP, lalu coba kirim sekarang. Gagal jaringan bukan galat: tetap antre. */
export async function sendQueued(
  queued: OpnameDraft,
  save: (d: OpnameDraft) => Promise<void>,
  syncNow: () => Promise<SyncReport>,
): Promise<SendOutcome> {
  try {
    await save(queued);
  } catch {
    return "failed";
  }
  const report = await syncNow().catch(() => null);
  if (report?.sent.includes(queued.id)) return "sent";
  if (report?.rejected.includes(queued.id)) return "rejected";
  return "queued";
}
