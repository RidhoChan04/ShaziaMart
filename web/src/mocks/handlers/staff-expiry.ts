import { HttpResponse, http } from "msw";
import { mockDb } from "../db";
import { staffExpiryList, staffLowStock } from "../stock/expiry";
import {
  applyExpiryDate,
  applyRemoval,
  checkExpiryDate,
  checkRemoval,
} from "../stock/expiry-changes";
import { readJson } from "./respond";
import { requireStaffSession, staffRealm } from "./staff-realm";

const noContent = (): Response => new HttpResponse(null, { status: 204 });

/** Kedaluwarsa & menipis orang toko: tanpa nilai rupiah dan tanpa angka stok (J7). */
export const staffExpiryHandlers = [
  http.get(
    "/api/staff/expiry",
    staffRealm(() => {
      const state = mockDb.get();
      const user = requireStaffSession(state);
      if (user instanceof Response) return user;
      return HttpResponse.json(staffExpiryList(state, Date.now()));
    }),
  ),
  http.post(
    "/api/staff/expiry-removals",
    staffRealm(async ({ request }) => {
      const body = await readJson(request);
      const state = mockDb.get();
      const user = requireStaffSession(state);
      if (user instanceof Response) return user;
      const removal = checkRemoval(state, body);
      if (removal instanceof Response) return removal;
      const now = Date.now();
      mockDb.update((s) => applyRemoval(s, removal, user.name, now));
      return noContent();
    }),
  ),
  http.put(
    "/api/staff/receipts/:receiptId/lines/:lineId/expiry",
    staffRealm(async ({ params, request }) => {
      const body = await readJson(request);
      const state = mockDb.get();
      const user = requireStaffSession(state);
      if (user instanceof Response) return user;
      const receiptId = String(params.receiptId);
      const lineId = String(params.lineId);
      const date = checkExpiryDate(state, receiptId, lineId, body);
      if (date instanceof Response) return date;
      const now = Date.now();
      mockDb.update((s) =>
        applyExpiryDate(s, receiptId, lineId, date, user.name, now),
      );
      return noContent();
    }),
  ),
  http.get(
    "/api/staff/low-stock",
    staffRealm(() => {
      const state = mockDb.get();
      const user = requireStaffSession(state);
      if (user instanceof Response) return user;
      return HttpResponse.json(staffLowStock(state));
    }),
  ),
];
