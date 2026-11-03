import { HttpResponse, http } from "msw";
import { mockDb } from "../db";
import { applyCancel } from "../receipts/revise";
import { toOwnerReceipt, toOwnerReceiptRow } from "../receipts/views";
import { withScenario } from "../scenarios";
import { problem, requireOwnerSession } from "./respond";

const BASE = "/api/owner/receipts";

const notFound = (): Response =>
  problem(404, "NOT_FOUND", "Nota tidak ditemukan");

export const ownerReceiptHandlers = [
  http.get(
    BASE,
    withScenario(() => {
      const state = mockDb.get();
      const owner = requireOwnerSession(state);
      if (owner instanceof Response) return owner;
      const rows = [...state.receipts]
        .sort((a, b) => b.createdAt - a.createdAt)
        .map((r) => toOwnerReceiptRow(state, r));
      return HttpResponse.json(rows);
    }),
  ),
  http.get(
    `${BASE}/:receiptId`,
    withScenario(({ params }) => {
      const state = mockDb.get();
      const owner = requireOwnerSession(state);
      if (owner instanceof Response) return owner;
      const r = state.receipts.find((x) => x.id === String(params.receiptId));
      return r ? HttpResponse.json(toOwnerReceipt(state, r)) : notFound();
    }),
  ),
  http.post(
    `${BASE}/:receiptId/cancel`,
    withScenario(({ params }) => {
      const state = mockDb.get();
      const owner = requireOwnerSession(state);
      if (owner instanceof Response) return owner;
      const id = String(params.receiptId);
      if (!state.receipts.some((x) => x.id === id)) return notFound();
      // Idempoten: nota yang sudah dibatalkan dikembalikan apa adanya, state tidak ditulis.
      if (state.receipts.some((x) => x.id === id && x.status === "aktif")) {
        const now = Date.now();
        mockDb.update((s) => {
          const r = s.receipts.find((x) => x.id === id);
          if (r) applyCancel(s, r, owner, now);
        });
      }
      const saved = mockDb.get();
      const r = saved.receipts.find((x) => x.id === id);
      if (!r) throw new Error("Nota hilang");
      return HttpResponse.json(toOwnerReceipt(saved, r));
    }),
  ),
];
