import { HttpResponse, http } from "msw";
import type { PrintResult } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { cancelPayment, recordPayment } from "../credit/payments";
import { toKasirPayment } from "../credit/views";
import { mockDb, updateWith } from "../db";
import { getScenario, withScenario } from "../scenarios";
import { problem, readJson, requireSession } from "./respond";

const BASE = "/api/credit-payments";

const notFound = (): Response =>
  problem(404, "NOT_FOUND", "Pelunasan tidak ditemukan");

/** Pelunasan jalur kasir (K2–K5, ruling R2, jawaban pemilik J0); HPP & laba tidak pernah ikut. */
export const creditPaymentHandlers = [
  http.post(
    BASE,
    withScenario(async ({ request }) => {
      // Setelah body dibaca semuanya sinkron: cek & simpan atomik.
      const body = await readJson(request);
      const user = requireSession(mockDb.get());
      if (user instanceof Response) return user;
      const customerId =
        typeof body?.customerId === "string" ? body.customerId : "";
      const now = Date.now();
      const res = updateWith((s) =>
        recordPayment(s, user, "kasir", customerId, body, now),
      );
      if (res instanceof Response) return res;
      return HttpResponse.json(toKasirPayment(mockDb.get(), res.payment), {
        status: res.status,
      });
    }),
  ),
  http.get(
    `${BASE}/shift`,
    withScenario(() => {
      const state = mockDb.get();
      const user = requireSession(state);
      if (user instanceof Response) return user;
      const { shift } = state;
      if (shift === null) return HttpResponse.json([]);
      // Dibalik dulu agar pelunasan dengan jam sama tetap terbaru dulu.
      const rows = [...state.creditPayments]
        .reverse()
        .filter((p) => p.channel === "kasir" && p.shiftId === shift.id)
        .sort((a, b) => b.at - a.at)
        .map((p) => toKasirPayment(state, p));
      return HttpResponse.json(rows);
    }),
  ),
  http.post(
    `${BASE}/:paymentId/print`,
    withScenario(({ params }) => {
      const state = mockDb.get();
      const user = requireSession(state);
      if (user instanceof Response) return user;
      const found = state.creditPayments.some(
        (p) => p.id === String(params.paymentId) && p.channel === "kasir",
      );
      if (!found) return notFound();
      const result: PrintResult = {
        printStatus: getScenario() === "printer-gagal" ? "gagal" : "tercetak",
      };
      mockDb.update((s) => {
        const p = s.creditPayments.find(
          (x) => x.id === String(params.paymentId),
        );
        if (p) p.printStatus = result.printStatus;
      });
      return HttpResponse.json(result);
    }),
  ),
  http.post(
    `${BASE}/:paymentId/cancel`,
    withScenario(async ({ params, request }) => {
      const body = await readJson(request);
      const user = requireSession(mockDb.get());
      if (user instanceof Response) return user;
      const now = Date.now();
      const res = updateWith((s) =>
        cancelPayment(
          s,
          String(params.paymentId),
          { user, channel: "kasir" },
          body,
          now,
        ),
      );
      if (res instanceof Response) return res;
      return HttpResponse.json(toKasirPayment(mockDb.get(), res));
    }),
  ),
];
