import { HttpResponse, http } from "msw";
import { cancelExpense, recordExpense } from "../cash/expenses";
import { cancelTake, recordTake } from "../cash/takes";
import {
  toDrawerExpense,
  toOwnerCashTake,
  toOwnerDrawerExpense,
} from "../cash/views";
import { mockDb, updateWith } from "../db";
import { withScenario } from "../scenarios";
import { readJson, requireOwnerSession, requireSession } from "./respond";

const EXPENSES = "/api/shifts/current/expenses";

/** Kas keluar laci kasir, ambil uang pemilik, dan batal kas keluar pemilik (S2, S5, S10). */
export const cashHandlers = [
  http.get(
    EXPENSES,
    withScenario(() => {
      const state = mockDb.get();
      const user = requireSession(state);
      if (user instanceof Response) return user;
      const { shift } = state;
      if (shift === null) return HttpResponse.json([]);
      // Dibalik dulu agar kas keluar dengan jam sama tetap terbaru dulu.
      const rows = [...state.drawerExpenses]
        .reverse()
        .filter((e) => e.shiftId === shift.id)
        .sort((a, b) => b.at - a.at)
        .map(toDrawerExpense);
      return HttpResponse.json(rows);
    }),
  ),
  http.post(
    EXPENSES,
    withScenario(async ({ request }) => {
      // Setelah body dibaca semuanya sinkron: cek & simpan atomik.
      const body = await readJson(request);
      const user = requireSession(mockDb.get());
      if (user instanceof Response) return user;
      const now = Date.now();
      const res = updateWith((s) => recordExpense(s, user, body, now));
      if (res instanceof Response) return res;
      return HttpResponse.json(toDrawerExpense(res.expense), {
        status: res.status,
      });
    }),
  ),
  http.post(
    `${EXPENSES}/:expenseId/cancel`,
    withScenario(async ({ params, request }) => {
      const body = await readJson(request);
      const user = requireSession(mockDb.get());
      if (user instanceof Response) return user;
      const now = Date.now();
      const res = updateWith((s) =>
        cancelExpense(
          s,
          String(params.expenseId),
          { user, channel: "kasir" },
          body,
          now,
        ),
      );
      if (res instanceof Response) return res;
      return HttpResponse.json(toDrawerExpense(res));
    }),
  ),
  http.post(
    "/api/owner/expenses/:expenseId/cancel",
    withScenario(async ({ params, request }) => {
      const body = await readJson(request);
      const owner = requireOwnerSession(mockDb.get());
      if (owner instanceof Response) return owner;
      const now = Date.now();
      const res = updateWith((s) =>
        cancelExpense(
          s,
          String(params.expenseId),
          { user: owner, channel: "pemilik" },
          body,
          now,
        ),
      );
      if (res instanceof Response) return res;
      return HttpResponse.json(toOwnerDrawerExpense(mockDb.get(), res));
    }),
  ),
  http.post(
    "/api/owner/cash-takes",
    withScenario(async ({ request }) => {
      const body = await readJson(request);
      const owner = requireOwnerSession(mockDb.get());
      if (owner instanceof Response) return owner;
      const now = Date.now();
      const res = updateWith((s) => recordTake(s, owner, body, now));
      if (res instanceof Response) return res;
      return HttpResponse.json(toOwnerCashTake(mockDb.get(), res.take), {
        status: res.status,
      });
    }),
  ),
  http.post(
    "/api/owner/cash-takes/:takeId/cancel",
    withScenario(async ({ params, request }) => {
      const body = await readJson(request);
      const owner = requireOwnerSession(mockDb.get());
      if (owner instanceof Response) return owner;
      const now = Date.now();
      const res = updateWith((s) =>
        cancelTake(s, String(params.takeId), owner, body, now),
      );
      if (res instanceof Response) return res;
      return HttpResponse.json(toOwnerCashTake(mockDb.get(), res));
    }),
  ),
];
