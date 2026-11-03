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
        .sort((a, b) => b.createdAt - a.createdAt || b.id.localeCompare(a.id))
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
      const index = state.receipts.findIndex(
        (x) => x.id === String(params.receiptId),
      );
      const found = state.receipts[index];
      if (!found) return notFound();
      // Idempoten: nota yang sudah dibatalkan dikembalikan apa adanya, state tidak ditulis.
      if (found.status === "dibatalkan") {
        return HttpResponse.json(toOwnerReceipt(state, found));
      }
      // Satu pencarian: posisi nota sama di salinan state (handler sinkron, urutan tidak berubah).
      const now = Date.now();
      mockDb.update((s) => {
        const r = s.receipts[index];
        if (!r) throw new Error("Nota hilang");
        applyCancel(s, r, owner, now);
      });
      const saved = mockDb.get();
      const r = saved.receipts[index];
      if (!r) throw new Error("Nota hilang");
      return HttpResponse.json(toOwnerReceipt(saved, r));
    }),
  ),
];
