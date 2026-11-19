import { HttpResponse, http } from "msw";
import type {
  ExceptionKind,
  OwnerExceptionList,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { type MockState, mockDb } from "../db";
import {
  EXCEPTION_KINDS,
  reviewExceptions,
  reviewedAtOf,
  unreviewed,
} from "../exceptions";
import { withScenario } from "../scenarios";
import { invalid, readJson, requireOwnerSession } from "./respond";

const BASE = "/api/owner/exceptions";

const isKind = (v: unknown): v is ExceptionKind =>
  (EXCEPTION_KINDS as readonly unknown[]).includes(v);

/** (K18) Akun kasir yang dikenal (aktif atau tidak: riwayatnya tetap ditinjau). */
const isKasirId = (state: Readonly<MockState>, v: unknown): v is string =>
  typeof v === "string" &&
  state.users.some((u) => u.id === v && u.role === "kasir");

const listOf = (
  kind: ExceptionKind,
  kasirId: string | null,
): OwnerExceptionList => {
  const state = mockDb.get();
  return {
    kind,
    reviewedAt: reviewedAtOf(state, kind, kasirId),
    items: unreviewed(state, kind, Date.now(), kasirId),
  };
};

/**
 * kasirId untuk jenis ini: selisih_kecil wajib kasir yang dikenal (null = 422), jenis lain
 * mengabaikannya.
 */
function kasirFor(
  kind: ExceptionKind,
  raw: unknown,
): { kasirId: string | null } | Response {
  if (kind !== "selisih_kecil") return { kasirId: null };
  return isKasirId(mockDb.get(), raw)
    ? { kasirId: raw }
    : invalid("kasirId wajib untuk selisih_kecil");
}

/**
 * Tinjau kejadian Perlu perhatian (ruling R9, K29, K18): menumpuk sejak ditinjau, `upTo` tidak
 * memundurkan; selisih_kecil per kasir.
 */
export const ownerExceptionHandlers = [
  http.get(
    BASE,
    withScenario(({ request }) => {
      const owner = requireOwnerSession(mockDb.get());
      if (owner instanceof Response) return owner;
      const params = new URL(request.url).searchParams;
      const kind = params.get("kind");
      if (!isKind(kind)) return invalid("Jenis tidak dikenal");
      const kasir = kasirFor(kind, params.get("kasirId"));
      if (kasir instanceof Response) return kasir;
      return HttpResponse.json(listOf(kind, kasir.kasirId));
    }),
  ),
  http.post(
    `${BASE}/review`,
    withScenario(async ({ request }) => {
      const body = await readJson(request);
      const owner = requireOwnerSession(mockDb.get());
      if (owner instanceof Response) return owner;
      const kind = body?.kind;
      const upTo = body?.upTo;
      if (!isKind(kind)) return invalid("Jenis tidak dikenal");
      if (typeof upTo !== "number" || !Number.isSafeInteger(upTo)) {
        return invalid("upTo wajib diisi");
      }
      const kasir = kasirFor(kind, body?.kasirId);
      if (kasir instanceof Response) return kasir;
      const now = Date.now();
      mockDb.update((s) => reviewExceptions(s, kind, upTo, now, kasir.kasirId));
      return HttpResponse.json(listOf(kind, kasir.kasirId));
    }),
  ),
];
