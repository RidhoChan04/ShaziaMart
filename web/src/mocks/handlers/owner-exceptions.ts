import { HttpResponse, http } from "msw";
import type {
  ExceptionKind,
  OwnerExceptionList,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { mockDb } from "../db";
import { EXCEPTION_KINDS, reviewExceptions, unreviewed } from "../exceptions";
import { withScenario } from "../scenarios";
import { invalid, readJson, requireOwnerSession } from "./respond";

const BASE = "/api/owner/exceptions";

const isKind = (v: unknown): v is ExceptionKind =>
  (EXCEPTION_KINDS as readonly unknown[]).includes(v);

const listOf = (kind: ExceptionKind): OwnerExceptionList => {
  const state = mockDb.get();
  return {
    kind,
    reviewedAt: state.exceptionReviews[kind],
    items: unreviewed(state, kind),
  };
};

/** Tinjau pengecualian kasir (ruling R9, K29): menumpuk sejak ditinjau, `upTo` tidak memundurkan. */
export const ownerExceptionHandlers = [
  http.get(
    BASE,
    withScenario(({ request }) => {
      const owner = requireOwnerSession(mockDb.get());
      if (owner instanceof Response) return owner;
      const kind = new URL(request.url).searchParams.get("kind");
      if (!isKind(kind)) return invalid("Jenis tidak dikenal");
      return HttpResponse.json(listOf(kind));
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
      const now = Date.now();
      mockDb.update((s) => reviewExceptions(s, kind, upTo, now));
      return HttpResponse.json(listOf(kind));
    }),
  ),
];
