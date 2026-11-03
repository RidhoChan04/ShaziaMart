import { HttpResponse, http } from "msw";
import type {
  Session,
  StaffShift,
  Supplier,
  User,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { mockDb } from "../db";
import { searchStaffProducts } from "../products/views";
import { pinLogin } from "./auth";
import { toUser } from "./respond";
import { requireStaffSession, staffRealm } from "./staff-realm";

export const staffHandlers = [
  http.get(
    "/api/staff/users",
    staffRealm(() => {
      const users: User[] = mockDb
        .get()
        .users.filter((u) => u.role === "kasir")
        .map(toUser);
      return HttpResponse.json(users);
    }),
  ),
  http.post(
    "/api/staff/login",
    staffRealm(({ request }) =>
      pinLogin(request, {
        failures: "staffPinFailures",
        canLogin: (u) => u.role === "kasir",
        startSession: (s, userId) => {
          s.staffSession = { userId };
        },
      }),
    ),
  ),
  http.get(
    "/api/staff/session",
    staffRealm(() => {
      const user = requireStaffSession(mockDb.get());
      if (user instanceof Response) return user;
      const session: Session = { user: toUser(user) };
      return HttpResponse.json(session);
    }),
  ),
  http.post(
    "/api/staff/logout",
    staffRealm(() => {
      mockDb.update((s) => {
        s.staffSession = null;
      });
      return new HttpResponse(null, { status: 204 });
    }),
  ),
  http.get(
    "/api/staff/shift",
    staffRealm(() => {
      const state = mockDb.get();
      const user = requireStaffSession(state);
      if (user instanceof Response) return user;
      // Tanpa modal atau angka kas: staf hanya perlu tahu laci siapa yang buka.
      const body: StaffShift = {
        shift: state.shift
          ? { kasirName: state.shift.kasirName, openedAt: state.shift.openedAt }
          : null,
      };
      return HttpResponse.json(body);
    }),
  ),
  http.get(
    "/api/staff/products",
    staffRealm(({ request }) => {
      const state = mockDb.get();
      const user = requireStaffSession(state);
      if (user instanceof Response) return user;
      const q = new URL(request.url).searchParams.get("q") ?? "";
      return HttpResponse.json(searchStaffProducts(state, q));
    }),
  ),
  http.get(
    "/api/staff/suppliers",
    staffRealm(() => {
      const state = mockDb.get();
      const user = requireStaffSession(state);
      if (user instanceof Response) return user;
      const suppliers: Supplier[] = [...state.suppliers]
        .sort((a, b) => b.lastUsedAt - a.lastUsedAt)
        .map(({ id, name }) => ({ id, name }));
      return HttpResponse.json(suppliers);
    }),
  ),
];
