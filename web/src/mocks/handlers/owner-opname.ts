import { HttpResponse, http } from "msw";
import { type MockOpnameSession, mockDb, updateWith } from "../db";
import { withScenario } from "../scenarios";
import {
  approveItem,
  recountItem,
  reviewSession,
  toOwnerOpnameRow,
  toOwnerOpnameSession,
} from "../stock/opname-owner";
import { problem, readJson, requireOwnerSession } from "./respond";

const BASE = "/api/owner/opname-sessions";

/** Sesi tersimpan (sesudah `mockDb.update`) dalam bentuk pemilik. */
function ownerSessionJson(res: MockOpnameSession | Response): Response {
  if (res instanceof Response) return res;
  const state = mockDb.get();
  const saved = state.opnameSessions.find((s) => s.id === res.id);
  if (!saved) throw new Error("Sesi opname hilang");
  return HttpResponse.json(toOwnerOpnameSession(state, saved));
}

export const ownerOpnameHandlers = [
  http.get(
    BASE,
    withScenario(() => {
      const state = mockDb.get();
      const owner = requireOwnerSession(state);
      if (owner instanceof Response) return owner;
      const rows = [...state.opnameSessions]
        .sort((a, b) => b.submittedAt - a.submittedAt)
        .map(toOwnerOpnameRow);
      return HttpResponse.json(rows);
    }),
  ),
  http.get(
    `${BASE}/:sessionId`,
    withScenario(({ params }) => {
      const state = mockDb.get();
      const owner = requireOwnerSession(state);
      if (owner instanceof Response) return owner;
      const s = state.opnameSessions.find(
        (x) => x.id === String(params.sessionId),
      );
      return s
        ? HttpResponse.json(toOwnerOpnameSession(state, s))
        : problem(404, "NOT_FOUND", "Sesi opname tidak ditemukan");
    }),
  ),
  http.post(
    `${BASE}/:sessionId/items/:productId/approve`,
    withScenario(({ params }) => {
      const owner = requireOwnerSession(mockDb.get());
      if (owner instanceof Response) return owner;
      const sessionId = String(params.sessionId);
      const productId = String(params.productId);
      const now = Date.now();
      return ownerSessionJson(
        updateWith((s) => approveItem(s, sessionId, productId, owner, now)),
      );
    }),
  ),
  http.post(
    `${BASE}/:sessionId/items/:productId/recount`,
    withScenario(async ({ params, request }) => {
      const body = await readJson(request);
      const owner = requireOwnerSession(mockDb.get());
      if (owner instanceof Response) return owner;
      const sessionId = String(params.sessionId);
      const productId = String(params.productId);
      const now = Date.now();
      return ownerSessionJson(
        updateWith((s) =>
          recountItem(s, sessionId, productId, owner, body, now),
        ),
      );
    }),
  ),
  http.post(
    `${BASE}/:sessionId/review`,
    withScenario(({ params }) => {
      const owner = requireOwnerSession(mockDb.get());
      if (owner instanceof Response) return owner;
      const sessionId = String(params.sessionId);
      const now = Date.now();
      return ownerSessionJson(
        updateWith((s) => reviewSession(s, sessionId, owner, now)),
      );
    }),
  ),
];
