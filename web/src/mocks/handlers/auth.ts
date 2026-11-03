import { HttpResponse, http } from "msw";
import type { Session, User } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { type MockState, type MockUser, mockDb } from "../db";
import { withScenario } from "../scenarios";
import {
  invalid,
  LOCK_DETAIL,
  LOCK_MS,
  MAX_FAILURES,
  problem,
  readJson,
  requireSession,
  toUser,
} from "./respond";

type PinRealm = {
  /** Hitungan PIN salah per realm: HP orang toko tidak mengunci PC kasir (R9). */
  failures: "pinFailures" | "staffPinFailures";
  canLogin: (user: MockUser) => boolean;
  startSession: (state: MockState, userId: string) => void;
};

/** Login PIN (kasir dan orang toko): 5x salah per akun → terkunci 5 menit di realm itu saja. */
export async function pinLogin(
  request: Request,
  realm: PinRealm,
): Promise<Response> {
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
  if (!user || !realm.canLogin(user)) {
    return problem(401, "PIN_INVALID", "PIN salah");
  }
  const now = Date.now();
  const failure = state[realm.failures][userId];
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
      s[realm.failures][userId] = {
        count,
        lockedUntil: locked ? now + LOCK_MS : null,
      };
    });
    return locked
      ? problem(423, "LOCKED_OUT", LOCK_DETAIL)
      : problem(401, "PIN_INVALID", "PIN salah");
  }
  mockDb.update((s) => {
    realm.startSession(s, userId);
    delete s[realm.failures][userId];
  });
  const session: Session = { user: toUser(user) };
  return HttpResponse.json(session);
}

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
    withScenario(({ request }) =>
      pinLogin(request, {
        failures: "pinFailures",
        canLogin: () => true,
        startSession: (s, userId) => {
          s.session = { userId };
        },
      }),
    ),
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
