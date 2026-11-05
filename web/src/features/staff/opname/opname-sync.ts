import { ApiError } from "@/shared/api/fetcher";
import type {
  OpnameError,
  OpnameSessionInput,
  StaffOpnameSession,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { createStaffOpnameSession } from "@/shared/api/gen/staff/staff";
import { opnameProblemSchema, readProblem } from "@/shared/api/problem";
import { pesanError } from "@/shared/lib/error-messages";
import { CORRUPT_DRAFT } from "../drafts/draft-shape";
import {
  mayRequest,
  type Outcome,
  type SyncOptions,
  type SyncReport,
  sendQueued,
  singleFlight,
  stopFor,
} from "../drafts/sync-core";
import type { OpnameDraftStore } from "./opname-draft-store";
import type { OpnameDraft } from "./opname-draft-types";

export type OpnameSyncApi = {
  createSession(input: OpnameSessionInput): Promise<StaffOpnameSession>;
};

/** Fungsi hasil orval. */
export const realOpnameSyncApi: OpnameSyncApi = {
  createSession: (input) => createStaffOpnameSession(input),
};

/**
 * Hitungan draf → body kirim. ID sesi = ID draf (kirim ulang aman); `countedAt` dikirim apa
 * adanya (jam HP saat barang dibuka) dan `deviceNow` = jam HP saat kirim: server yang
 * menggeser ke jamnya (K6). Barang urut nama, seperti daftar hitung.
 */
export function toSessionInput(
  d: OpnameDraft,
  deviceNow: number,
): OpnameSessionInput {
  const nameOf = (id: string) =>
    d.products.find((p) => p.id === id)?.name ?? id;
  return {
    id: d.id,
    scope: d.scope,
    deviceNow,
    items: Object.entries(d.counts)
      .map(([productId, c]) => ({
        productId,
        qtyBase: c.qtyBase,
        countedAt: c.countedAt,
      }))
      .sort((a, b) =>
        nameOf(a.productId).localeCompare(nameOf(b.productId), "id"),
      ),
  };
}

/**
 * Galat per barang dari 422; selain itu (body tanpa galat, 409 ID_TAKEN, …) satu pesan umum.
 * Bukan ApiError = request tidak bisa dibuat dari draf ini (isian rusak).
 */
function rejectionErrors(error: unknown): OpnameError[] {
  if (!(error instanceof ApiError)) {
    return [{ productId: null, message: CORRUPT_DRAFT }];
  }
  const problem = readProblem(error, opnameProblemSchema);
  if (problem && problem.errors.length > 0) return problem.errors;
  return [{ productId: null, message: pesanError(error) }];
}

/** Satu POST dengan id draf; diterima (201/200 replay) → draf dihapus; ditolak → tetap di HP. */
async function sendOne(
  store: OpnameDraftStore,
  draft: OpnameDraft,
  api: OpnameSyncApi,
  opts: SyncOptions,
  now: () => number,
): Promise<Outcome> {
  if (!mayRequest(draft.userId, opts)) return "unauthorized";
  try {
    await api.createSession(toSessionInput(draft, now()));
  } catch (error) {
    const stop = error instanceof ApiError ? stopFor(error) : null;
    if (stop) return stop;
    const errors = rejectionErrors(error);
    await store.update(draft.id, (d) => ({ ...d, status: "rejected", errors }));
    return "rejected";
  }
  await store.remove(draft.id);
  return "sent";
}

/**
 * Kirim draf opname antre milik `userId` (urut createdAt) dengan aturan yang sama dengan draf
 * nota: single-flight per penyimpan, berhenti (offline/LAN/401, dibatalkan, sesi bukan
 * pemilik) tanpa mengubah draf; hanya galat penyimpan HP yang membuat promise ditolak.
 */
export function syncOpnameDrafts(
  store: OpnameDraftStore,
  userId: string,
  api: OpnameSyncApi,
  opts: SyncOptions & { now?: () => number } = {},
): Promise<SyncReport> {
  const now = opts.now ?? (() => Date.now());
  return singleFlight(store, userId, opts.signal, () =>
    sendQueued(
      () => store.list(),
      userId,
      opts,
      (d) => sendOne(store, d, api, opts, now),
    ),
  );
}
