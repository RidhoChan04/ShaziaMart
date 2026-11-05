import { HttpResponse, http } from "msw";
import type {
  OwnerSale,
  OwnerSaleRow,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { isIsoDate, jakartaIsoDate } from "@/shared/lib/business-day";
import { saleMethodLabel } from "@/shared/lib/payment-labels";
import { type MockSale, type MockState, mockDb, updateWith } from "../db";
import { withScenario } from "../scenarios";
import { invalid, problem, readJson, requireOwnerSession } from "./respond";
import { toPublicSale, voidSaleAs } from "./sales-void";

const BASE = "/api/owner/sales";

const notFound = (): Response =>
  problem(404, "NOT_FOUND", "Penjualan tidak ditemukan");

const shiftOpen = (state: Readonly<MockState>, s: MockSale): boolean =>
  state.shift !== null && s.shiftId === state.shift.id;

/** Detail transaksi pemilik (ruling R4, K30): tanpa HPP; data batal & lewat limit untuk pemilik. */
export function toOwnerSale(
  state: Readonly<MockState>,
  s: MockSale,
): OwnerSale {
  return {
    ...toPublicSale(s),
    customerName:
      state.customers.find((c) => c.id === s.customerId)?.name ?? null,
    shiftOpen: shiftOpen(state, s),
    voided:
      s.voidedAt === null
        ? null
        : {
            at: s.voidedAt,
            byId: s.voidedById ?? "",
            byName: s.voidedByName ?? "",
            reason: s.voidReason ?? "",
            channel: s.voidChannel ?? "kasir",
            drawerRefund: s.voidRefund?.drawer ?? 0,
            qrisRefundSource: s.voidRefund?.qrisSource ?? null,
          },
    creditOverLimit: s.creditOverLimit,
  };
}

/** Transaksi pemilik (Lainnya > Transaksi, jawaban pemilik Q1/Q2/Q8): laci tidak pernah dikoreksi. */
export const ownerSaleHandlers = [
  http.get(
    BASE,
    withScenario(({ request }) => {
      const state = mockDb.get();
      const owner = requireOwnerSession(state);
      if (owner instanceof Response) return owner;
      const params = new URL(request.url).searchParams;
      const date = params.get("date") ?? jakartaIsoDate(Date.now());
      if (!isIsoDate(date)) return invalid("Tanggal tidak valid");
      const q = params.get("q")?.trim() ?? "";
      // Dibalik dulu agar penjualan dengan jam sama tetap terbaru dulu.
      const rows = [...state.sales]
        .reverse()
        .filter(
          (s) => jakartaIsoDate(s.createdAt) === date && s.number.includes(q),
        )
        .sort((a, b) => b.createdAt - a.createdAt)
        .map(
          (s): OwnerSaleRow => ({
            id: s.id,
            number: s.number,
            createdAt: s.createdAt,
            kasirName: s.kasirName,
            total: s.total,
            methodLabel: saleMethodLabel(s.payments),
            status: s.status,
            shiftOpen: shiftOpen(state, s),
          }),
        );
      return HttpResponse.json(rows);
    }),
  ),
  http.get(
    `${BASE}/:saleId`,
    withScenario(({ params }) => {
      const state = mockDb.get();
      const owner = requireOwnerSession(state);
      if (owner instanceof Response) return owner;
      const sale = state.sales.find((s) => s.id === String(params.saleId));
      return sale ? HttpResponse.json(toOwnerSale(state, sale)) : notFound();
    }),
  ),
  http.post(
    `${BASE}/:saleId/void`,
    withScenario(async ({ params, request }) => {
      const body = await readJson(request);
      const owner = requireOwnerSession(mockDb.get());
      if (owner instanceof Response) return owner;
      const now = Date.now();
      const res = updateWith((s) =>
        voidSaleAs(
          s,
          String(params.saleId),
          { user: owner, channel: "pemilik" },
          body,
          now,
        ),
      );
      if (res instanceof Response) return res;
      return HttpResponse.json(toOwnerSale(mockDb.get(), res));
    }),
  ),
];
