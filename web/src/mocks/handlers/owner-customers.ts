import { HttpResponse, http } from "msw";
import { cancelPayment, recordPayment } from "../credit/payments";
import { ownerCustomer, ownerCustomerList } from "../credit/views";
import { mockDb, updateWith } from "../db";
import { withScenario } from "../scenarios";
import { invalid, problem, readJson, requireOwnerSession } from "./respond";

const BASE = "/api/owner/customers";

const notFound = (): Response =>
  problem(404, "NOT_FOUND", "Pelanggan tidak ditemukan");

/** Detail pelanggan sekarang (setelah `mockDb.update`). */
function customerResponse(customerId: string, status = 200): Response {
  const body = ownerCustomer(mockDb.get(), customerId, Date.now());
  return body ? HttpResponse.json(body, { status }) : notFound();
}

const isLimit = (v: unknown): v is number =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 0;

/** Kasbon pemilik (K6, K7, K9) dan pelunasan jalur pemilik (K2, K5): laci tidak pernah dikoreksi. */
export const ownerCustomerHandlers = [
  http.get(
    BASE,
    withScenario(() => {
      const state = mockDb.get();
      const owner = requireOwnerSession(state);
      if (owner instanceof Response) return owner;
      return HttpResponse.json(ownerCustomerList(state, Date.now()));
    }),
  ),
  http.get(
    `${BASE}/:customerId`,
    withScenario(({ params }) => {
      const owner = requireOwnerSession(mockDb.get());
      if (owner instanceof Response) return owner;
      return customerResponse(String(params.customerId));
    }),
  ),
  http.put(
    `${BASE}/:customerId/credit-limit`,
    withScenario(async ({ params, request }) => {
      const body = await readJson(request);
      const state = mockDb.get();
      const owner = requireOwnerSession(state);
      if (owner instanceof Response) return owner;
      const id = String(params.customerId);
      if (!state.customers.some((c) => c.id === id)) return notFound();
      const creditLimit = body?.creditLimit;
      // K7: boleh di bawah saldo sekarang (batas peringatan).
      if (!isLimit(creditLimit)) {
        return invalid("Limit harus bilangan bulat minimal 0");
      }
      mockDb.update((s) => {
        const c = s.customers.find((x) => x.id === id);
        if (c) c.creditLimit = creditLimit;
      });
      return customerResponse(id);
    }),
  ),
  http.post(
    `${BASE}/:customerId/payments`,
    withScenario(async ({ params, request }) => {
      const body = await readJson(request);
      const owner = requireOwnerSession(mockDb.get());
      if (owner instanceof Response) return owner;
      const now = Date.now();
      const res = updateWith((s) =>
        recordPayment(
          s,
          owner,
          "pemilik",
          String(params.customerId),
          body,
          now,
        ),
      );
      if (res instanceof Response) return res;
      return customerResponse(res.payment.customerId, res.status);
    }),
  ),
  http.post(
    "/api/owner/credit-payments/:paymentId/cancel",
    withScenario(async ({ params, request }) => {
      const body = await readJson(request);
      const owner = requireOwnerSession(mockDb.get());
      if (owner instanceof Response) return owner;
      const now = Date.now();
      const res = updateWith((s) =>
        cancelPayment(
          s,
          String(params.paymentId),
          { user: owner, channel: "pemilik" },
          body,
          now,
        ),
      );
      if (res instanceof Response) return res;
      return customerResponse(res.customerId);
    }),
  ),
];
