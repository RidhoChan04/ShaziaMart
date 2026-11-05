import { HttpResponse, http } from "msw";
import type { StaffOpnameRow } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { type MockOpnameSession, mockDb, updateWith } from "../db";
import { submitSession } from "../stock/opname";
import { finishSession } from "../stock/opname-finish";
import { toScope } from "../stock/opname-input";
import {
  opnameCategories,
  opnameProducts,
  toStaffOpnameRow,
  toStaffOpnameSession,
} from "../stock/opname-views";
import { invalid, problem, readJson } from "./respond";
import { requireStaffSession, staffRealm } from "./staff-realm";

const BASE = "/api/staff/opname-sessions";
/** K25: riwayat sesi sendiri 30 hari terakhir. */
const HISTORY_MS = 30 * 86_400_000;

const notFound = (): Response =>
  problem(404, "NOT_FOUND", "Sesi opname tidak ditemukan");

/** Sesi tersimpan menurut id (sesudah `mockDb.update`). */
function savedSession(id: string): MockOpnameSession {
  const s = mockDb.get().opnameSessions.find((x) => x.id === id);
  if (!s) throw new Error("Sesi opname hilang");
  return s;
}

export const staffOpnameHandlers = [
  http.get(
    "/api/staff/opname/categories",
    staffRealm(() => {
      const state = mockDb.get();
      const user = requireStaffSession(state);
      if (user instanceof Response) return user;
      return HttpResponse.json(opnameCategories(state));
    }),
  ),
  http.get(
    "/api/staff/opname/products",
    staffRealm(({ request }) => {
      const state = mockDb.get();
      const user = requireStaffSession(state);
      if (user instanceof Response) return user;
      const params = new URL(request.url).searchParams;
      const scope = toScope(params.get("lingkup"), params.get("kategori"));
      if (scope === null) return invalid("Lingkup opname tidak valid");
      return HttpResponse.json(opnameProducts(state, scope));
    }),
  ),
  http.get(
    BASE,
    staffRealm(() => {
      const state = mockDb.get();
      const user = requireStaffSession(state);
      if (user instanceof Response) return user;
      const since = Date.now() - HISTORY_MS;
      const rows: StaffOpnameRow[] = state.opnameSessions
        .filter((s) => s.createdById === user.id && s.submittedAt >= since)
        .sort((a, b) => b.submittedAt - a.submittedAt)
        .map(toStaffOpnameRow);
      return HttpResponse.json(rows);
    }),
  ),
  http.post(
    BASE,
    staffRealm(async ({ request }) => {
      const body = await readJson(request);
      const user = requireStaffSession(mockDb.get());
      if (user instanceof Response) return user;
      const now = Date.now();
      const res = updateWith((s) => submitSession(s, user, body, now));
      if (res instanceof Response) return res;
      return HttpResponse.json(
        toStaffOpnameSession(mockDb.get(), savedSession(res.session.id)),
        { status: res.status },
      );
    }),
  ),
  http.get(
    `${BASE}/:sessionId`,
    staffRealm(({ params }) => {
      const state = mockDb.get();
      const user = requireStaffSession(state);
      if (user instanceof Response) return user;
      // Sesi orang lain tidak dibedakan dari yang tidak ada.
      const s = state.opnameSessions.find(
        (x) => x.id === String(params.sessionId) && x.createdById === user.id,
      );
      return s ? HttpResponse.json(toStaffOpnameSession(state, s)) : notFound();
    }),
  ),
  http.post(
    `${BASE}/:sessionId/finish`,
    staffRealm(async ({ params, request }) => {
      const body = await readJson(request);
      const user = requireStaffSession(mockDb.get());
      if (user instanceof Response) return user;
      const id = String(params.sessionId);
      const now = Date.now();
      const res = updateWith((s) => finishSession(s, user, id, body, now));
      if (res instanceof Response) return res;
      return HttpResponse.json(
        toStaffOpnameSession(mockDb.get(), savedSession(id)),
      );
    }),
  ),
];
