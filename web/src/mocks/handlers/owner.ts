import { HttpResponse, http } from "msw";
import type {
  OwnerSession,
  OwnerTodaySummary,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { mockDb } from "../db";
import { ownerTodaySummary } from "../owner-summary";
import { withScenario } from "../scenarios";
import {
  invalid,
  LOCK_DETAIL,
  LOCK_MS,
  MAX_FAILURES,
  problem,
  readJson,
  requireOwnerSession,
  toUser,
} from "./respond";

const normalize = (name: string): string => name.trim().toLowerCase();

export const ownerHandlers = [
  http.post(
    "/api/owner/login",
    withScenario(async ({ request }) => {
      const body = await readJson(request);
      const { name, password } = body ?? {};
      if (
        typeof name !== "string" ||
        typeof password !== "string" ||
        name.trim() === "" ||
        password === ""
      ) {
        return invalid("Nama dan password wajib diisi");
      }
      const key = normalize(name);
      const state = mockDb.get();
      const now = Date.now();
      const failure = state.ownerLoginFailures[key];
      const lockedUntil = failure?.lockedUntil ?? null;
      if (lockedUntil !== null && lockedUntil > now) {
        return problem(423, "LOCKED_OUT", LOCK_DETAIL);
      }
      const owner = state.users.find(
        (u) => u.role === "pemilik" && normalize(u.name) === key,
      );
      if (!owner || owner.password !== password) {
        // Kunci yang sudah lewat memulai hitungan dari nol.
        const count = (lockedUntil !== null ? 0 : (failure?.count ?? 0)) + 1;
        const locked = count >= MAX_FAILURES;
        mockDb.update((s) => {
          s.ownerLoginFailures[key] = {
            count,
            lockedUntil: locked ? now + LOCK_MS : null,
          };
        });
        return locked
          ? problem(423, "LOCKED_OUT", LOCK_DETAIL)
          : problem(401, "LOGIN_INVALID", "Nama atau password salah");
      }
      mockDb.update((s) => {
        s.ownerSession = { userId: owner.id };
        delete s.ownerLoginFailures[key];
      });
      const session: OwnerSession = { user: toUser(owner) };
      return HttpResponse.json(session);
    }),
  ),
  http.get(
    "/api/owner/session",
    withScenario(() => {
      const user = requireOwnerSession(mockDb.get());
      if (user instanceof Response) return user;
      const session: OwnerSession = { user: toUser(user) };
      return HttpResponse.json(session);
    }),
  ),
  http.post(
    "/api/owner/logout",
    withScenario(() => {
      mockDb.update((s) => {
        s.ownerSession = null;
      });
      return new HttpResponse(null, { status: 204 });
    }),
  ),
  http.get(
    "/api/owner/summary/today",
    withScenario(() => {
      const state = mockDb.get();
      const user = requireOwnerSession(state);
      if (user instanceof Response) return user;
      const body: OwnerTodaySummary = ownerTodaySummary(state, Date.now());
      return HttpResponse.json(body);
    }),
  ),
];
