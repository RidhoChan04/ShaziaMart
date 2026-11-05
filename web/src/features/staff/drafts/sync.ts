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
import { CORRUPT_DRAFT } from "./draft-shape";
import type { DraftStore } from "./draft-store";
import type { ReceiptDraft } from "./draft-types";
import { toReceiptInput } from "./receipt-input";
import {
  mayRequest,
  type Outcome,
  type SyncOptions,
  type SyncReport,
  sendQueued,
  singleFlight,
  stopFor,
} from "./sync-core";

export type SyncApi = {
  putPhoto(photoId: string, blob: Blob): Promise<void>;
  createReceipt(input: ReceiptInput): Promise<StaffReceipt>;
};

/** Fungsi hasil orval; PUT foto sudah memakai Content-Type image/jpeg. */
export const realSyncApi: SyncApi = {
  putPhoto: (photoId, blob) => putStaffReceiptPhoto(photoId, blob),
  createReceipt: (input) => createStaffReceipt(input),
};

/**
 * Galat per baris/field dari 422; selain itu (body rusak `errors: []`, 409, …) satu pesan umum.
 * Bukan ApiError = request tidak bisa dibuat dari draf ini (isian rusak).
 */
function rejectionErrors(error: unknown, field: ReceiptField): ReceiptError[] {
  if (!(error instanceof ApiError)) {
    return [{ lineId: null, field, message: CORRUPT_DRAFT }];
  }
  const problem = readProblem(error, receiptProblemSchema);
  if (problem && problem.errors.length > 0) return problem.errors;
  return [{ lineId: null, field, message: pesanError(error) }];
}

/** Ditolak: data & foto tetap di HP, status `rejected` dengan pesannya (tidak pernah dibuang). */
async function reject(
  store: DraftStore,
  id: string,
  errors: ReceiptError[],
): Promise<void> {
  // Server tidak menemukan foto: unggah ulang setelah draf disimpan lagi.
  const photoLost = errors.some((e) => e.field === "photoId");
  await store.update(id, (d) => ({
    ...d,
    status: "rejected",
    errors,
    photo: d.photo && photoLost ? { ...d.photo, uploaded: false } : d.photo,
  }));
}

/** Galat request → berhenti (sementara) atau draf ditolak; galat penyimpan HP tetap dilempar. */
async function failed(
  store: DraftStore,
  id: string,
  error: unknown,
  field: ReceiptField,
): Promise<Outcome> {
  const stop = error instanceof ApiError ? stopFor(error) : null;
  if (stop) return stop;
  await reject(store, id, rejectionErrors(error, field));
  return "rejected";
}

/** Foto dulu (sekali), lalu nota dengan id draf; respons hilang → kirim ulang aman (200 replay). */
async function sendOne(
  store: DraftStore,
  draft: ReceiptDraft,
  api: SyncApi,
  opts: SyncOptions,
): Promise<Outcome> {
  const { photo } = draft;
  if (photo && !photo.uploaded) {
    if (!mayRequest(draft.userId, opts)) return "unauthorized";
    try {
      await api.putPhoto(photo.id, photo.blob);
    } catch (error) {
      return failed(store, draft.id, error, "photoId");
    }
    await store.update(draft.id, (d) => ({
      ...d,
      photo:
        d.photo?.id === photo.id ? { ...d.photo, uploaded: true } : d.photo,
    }));
  }
  if (!mayRequest(draft.userId, opts)) return "unauthorized";
  try {
    await api.createReceipt(toReceiptInput(draft));
  } catch (error) {
    return failed(store, draft.id, error, "lines");
  }
  await store.remove(draft.id);
  return "sent";
}

/**
 * Kirim draf antre milik `userId` (urut createdAt). Single-flight per penyimpan: panggilan
 * bersamaan untuk pengguna yang sama berbagi satu promise; pengguna lain (atau sync yang
 * sudah dibatalkan) menunggu giliran. Dibatalkan atau sesi bukan pemilik draf → berhenti
 * sebelum request berikutnya tanpa mengubah draf, dilaporkan sebagai `unauthorized`.
 * Draf rusak ditandai `rejected`; hanya galat penyimpan HP yang membuat promise ditolak.
 */
export function syncDrafts(
  store: DraftStore,
  userId: string,
  api: SyncApi,
  opts: SyncOptions = {},
): Promise<SyncReport> {
  return singleFlight(store, userId, opts.signal, () =>
    sendQueued(
      () => store.list(),
      userId,
      opts,
      (d) => sendOne(store, d, api, opts),
    ),
  );
}
