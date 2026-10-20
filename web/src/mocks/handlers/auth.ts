import { HttpResponse, http } from "msw";
import type { Session, User } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { mockDb } from "../db";
import { withScenario } from "../scenarios";
import { invalid, problem, readJson, requireSession } from "./respond";

const MAX_FAILURES = 5;
const LOCK_MS = 300_000;
const LOCK_DETAIL = "Coba lagi dalam 5 menit";

const toUser = ({ id, name, role }: User): User => ({ id, name, role });

export const authHandlers = [
  http.get(
    "/api/users/kasir",
    withScenario(() => {
      const users: User[] = mockDb
        .get()
        .users.filter((u) => u.role === "kasir")
        .map(toUser);
      return HttpResponse.json(users);
    }),
  ),
  http.post(
    "/api/auth/pin-login",
    withScenario(async ({ request }) => {
      const body = await readJson(request);
      const userId = body?.userId;
      const pin = body?.pin;
      if (
        typeof userId !== "string" ||
        typeof pin !== "string" ||
        !/^\d{6}$/.test(pin)
      ) {
        return invalid("userId dan PIN 6 digit wajib diisi");
      }
      const state = mockDb.get();
      const user = state.users.find((u) => u.id === userId);
      if (!user) return problem(401, "PIN_INVALID", "PIN salah");
      const now = Date.now();
      const failure = state.pinFailures[userId];
      const lockedUntil = failure?.lockedUntil ?? null;
      if (lockedUntil !== null && lockedUntil > now) {
        return problem(423, "LOCKED_OUT", LOCK_DETAIL);
      }
      if (user.pin !== pin) {
        // Kunci yang sudah lewat memulai hitungan dari nol.
        const previous = lockedUntil !== null ? 0 : (failure?.count ?? 0);
        const count = previous + 1;
        const locked = count >= MAX_FAILURES;
        mockDb.update((s) => {
          s.pinFailures[userId] = {
            count,
            lockedUntil: locked ? now + LOCK_MS : null,
          };
        });
        return locked
          ? problem(423, "LOCKED_OUT", LOCK_DETAIL)
          : problem(401, "PIN_INVALID", "PIN salah");
      }
      mockDb.update((s) => {
        s.session = { userId };
        delete s.pinFailures[userId];
      });
      const session: Session = { user: toUser(user) };
      return HttpResponse.json(session);
    }),
  ),
  http.get(
    "/api/auth/session",
    withScenario(() => {
      const user = requireSession(mockDb.get());
      if (user instanceof Response) return user;
      const session: Session = { user: toUser(user) };
      return HttpResponse.json(session);
    }),
  ),
  http.post(
    "/api/auth/logout",
    withScenario(() => {
      mockDb.update((s) => {
        s.session = null;
      });
      return new HttpResponse(null, { status: 204 });
    }),
  ),
];
