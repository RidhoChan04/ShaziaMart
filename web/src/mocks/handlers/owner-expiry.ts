import { HttpResponse, http } from "msw";
import { mockDb } from "../db";
import { withScenario } from "../scenarios";
import { ownerExpiryList } from "../stock/expiry";
import {
  applyExpiryDate,
  applyRemoval,
  checkExpiryDate,
  checkRemoval,
} from "../stock/expiry-changes";
import { readJson, requireOwnerSession } from "./respond";

const noContent = (): Response => new HttpResponse(null, { status: 204 });

/** K20: pemilik memakai inti yang sama dengan orang toko, ditambah nilai rupiah. */
export const ownerExpiryHandlers = [
  http.get(
    "/api/owner/expiry",
    withScenario(() => {
      const state = mockDb.get();
      const owner = requireOwnerSession(state);
      if (owner instanceof Response) return owner;
      return HttpResponse.json(ownerExpiryList(state, Date.now()));
    }),
  ),
  http.post(
    "/api/owner/expiry-removals",
    withScenario(async ({ request }) => {
      const body = await readJson(request);
      const state = mockDb.get();
      const owner = requireOwnerSession(state);
      if (owner instanceof Response) return owner;
      const removal = checkRemoval(state, body);
      if (removal instanceof Response) return removal;
      const now = Date.now();
      mockDb.update((s) => applyRemoval(s, removal, owner.name, now));
      return noContent();
    }),
  ),
  http.put(
    "/api/owner/receipts/:receiptId/lines/:lineId/expiry",
    withScenario(async ({ params, request }) => {
      const body = await readJson(request);
      const state = mockDb.get();
      const owner = requireOwnerSession(state);
      if (owner instanceof Response) return owner;
      const receiptId = String(params.receiptId);
      const lineId = String(params.lineId);
      const date = checkExpiryDate(state, receiptId, lineId, body);
      if (date instanceof Response) return date;
      const now = Date.now();
      mockDb.update((s) =>
        applyExpiryDate(s, receiptId, lineId, date, owner.name, now),
      );
      return noContent();
    }),
  ),
];
