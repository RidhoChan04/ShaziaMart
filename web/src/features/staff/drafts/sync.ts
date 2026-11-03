import { ApiError } from "@/shared/api/fetcher";
import type {
  ReceiptError,
  ReceiptField,
  ReceiptInput,
  StaffReceipt,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  createStaffReceipt,
  putStaffReceiptPhoto,
} from "@/shared/api/gen/staff/staff";
import { readProblem, receiptProblemSchema } from "@/shared/api/problem";
import { pesanError } from "@/shared/lib/error-messages";
import type { DraftStore } from "./draft-store";
import type { ReceiptDraft } from "./draft-types";
import { toReceiptInput } from "./to-input";

export type SyncApi = {
  putPhoto(photoId: string, blob: Blob): Promise<void>;
  createReceipt(input: ReceiptInput): Promise<StaffReceipt>;
};

export type SyncReport = {
  sent: string[];
  rejected: string[];
  stopped: "offline" | "unauthorized" | "lan" | null;
};

type Stop = NonNullable<SyncReport["stopped"]>;

/** Fungsi hasil orval; PUT foto sudah memakai Content-Type image/jpeg. */
export const realSyncApi: SyncApi = {
  putPhoto: (photoId, blob) => putStaffReceiptPhoto(photoId, blob),
  createReceipt: (input) => createStaffReceipt(input),
};

/** Gagal sementara (jaringan, server, batas waktu): draf tetap antre, dicoba lagi nanti. */
function stopFor(error: ApiError): Stop | null {
  if (
    error.code === "NETWORK" ||
    error.status >= 500 ||
    error.status === 408 ||
    error.status === 429
  ) {
    return "offline";
  }
  if (error.code === "UNAUTHORIZED") return "unauthorized";
  if (error.code === "STAFF_LAN_ONLY") return "lan";
  return null;
}

/** Galat per baris/field dari 422; selain itu (body rusak `errors: []`, 409, …) satu pesan umum. */
function rejectionErrors(error: ApiError, field: ReceiptField): ReceiptError[] {
  const problem = readProblem(error, receiptProblemSchema);
  if (problem && problem.errors.length > 0) return problem.errors;
  return [{ lineId: null, field, message: pesanError(error) }];
}

/** Ubah draf versi terbaru di penyimpan (bisa sudah diubah layar lain); hilang → tidak apa-apa. */
async function update(
  store: DraftStore,
  id: string,
  change: (d: ReceiptDraft) => ReceiptDraft,
): Promise<void> {
  const latest = await store.get(id);
  if (latest) await store.put(change(latest));
}

/** Ditolak server: data & foto tetap di HP, status `rejected` dengan pesannya (tidak pernah dibuang). */
async function reject(
  store: DraftStore,
  id: string,
  errors: ReceiptError[],
): Promise<void> {
  // Server tidak menemukan foto: unggah ulang setelah draf disimpan lagi.
  const photoLost = errors.some((e) => e.field === "photoId");
  await update(store, id, (d) => ({
    ...d,
    status: "rejected",
    errors,
    photo: d.photo && photoLost ? { ...d.photo, uploaded: false } : d.photo,
  }));
}

type Outcome = "sent" | "rejected" | Stop;

async function failed(
  store: DraftStore,
  id: string,
  error: unknown,
  field: ReceiptField,
): Promise<Outcome> {
  if (!(error instanceof ApiError)) throw error;
  const stop = stopFor(error);
  if (stop) return stop;
  await reject(store, id, rejectionErrors(error, field));
  return "rejected";
}

/** Foto dulu (sekali), lalu nota dengan id draf; respons hilang → kirim ulang aman (200 replay). */
async function sendOne(
  store: DraftStore,
  draft: ReceiptDraft,
  api: SyncApi,
  signal: AbortSignal | undefined,
): Promise<Outcome> {
  const { photo } = draft;
  if (photo && !photo.uploaded) {
    try {
      await api.putPhoto(photo.id, photo.blob);
    } catch (error) {
      return failed(store, draft.id, error, "photoId");
    }
    await update(store, draft.id, (d) => ({
      ...d,
      photo:
        d.photo?.id === photo.id ? { ...d.photo, uploaded: true } : d.photo,
    }));
  }
  if (signal?.aborted) return "unauthorized";
  try {
    await api.createReceipt(toReceiptInput(draft));
  } catch (error) {
    return failed(store, draft.id, error, "lines");
  }
  await store.remove(draft.id);
  return "sent";
}

async function sendQueued(
  store: DraftStore,
  userId: string,
  api: SyncApi,
  signal: AbortSignal | undefined,
): Promise<SyncReport> {
  const report: SyncReport = { sent: [], rejected: [], stopped: null };
  const tried = new Set<string>();
  // Baca ulang tiap putaran: draf yang diantre selama sync ikut terkirim.
  for (;;) {
    if (signal?.aborted) return { ...report, stopped: "unauthorized" };
    const next = (await store.list()).find(
      (d) => d.userId === userId && d.status === "queued" && !tried.has(d.id),
    );
    if (!next) return report;
    tried.add(next.id);
    const outcome = await sendOne(store, next, api, signal);
    if (outcome === "sent") report.sent.push(next.id);
    else if (outcome === "rejected") report.rejected.push(next.id);
    else return { ...report, stopped: outcome };
  }
}

type Flight = {
  userId: string;
  signal: AbortSignal | undefined;
  run: Promise<SyncReport>;
};

const inFlight = new WeakMap<DraftStore, Flight>();

/**
 * Kirim draf antre milik `userId` (urut createdAt). Single-flight per penyimpan: panggilan
 * bersamaan untuk pengguna yang sama berbagi satu promise; pengguna lain (atau sync yang
 * sudah dibatalkan) menunggu giliran. `signal` dibatalkan (pengguna keluar/berganti) →
 * berhenti sebelum request berikutnya, dilaporkan sebagai `unauthorized`.
 */
export function syncDrafts(
  store: DraftStore,
  userId: string,
  api: SyncApi,
  opts: { signal?: AbortSignal | undefined } = {},
): Promise<SyncReport> {
  const current = inFlight.get(store);
  if (current?.userId === userId && !current.signal?.aborted) {
    return current.run;
  }
  const run = (current?.run.catch(() => undefined) ?? Promise.resolve()).then(
    () => sendQueued(store, userId, api, opts.signal),
  );
  const entry: Flight = { userId, signal: opts.signal, run };
  inFlight.set(store, entry);
  const clear = () => {
    if (inFlight.get(store) === entry) inFlight.delete(store);
  };
  run.then(clear, clear);
  return run;
}
