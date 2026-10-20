import { HttpResponse, http } from "msw";
import type {
  PriceChangedProblem,
  PrintResult,
  PrintStatus,
  Sale,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { type MockState, type MockUser, mockDb } from "../db";
import { formatSaleNumber, jakartaDateKey } from "../sale-number";
import {
  type CheckedPayments,
  checkPayments,
  creditExcess,
  isOwnerPin,
  isRejection,
  type PricedItem,
  priceChanges,
  priceItems,
  type Rejection,
  saleTotal,
} from "../sale-rules";
import { getScenario, withScenario } from "../scenarios";
import { invalid, problem, readJson, requireSession } from "./respond";

const PRICE_BUMP = 500;

/** saleId yang sudah ditolak skenario harga-berubah; sengaja tidak dipersist. */
const priceBumpedSaleIds = new Set<string>();

export function __resetSalesScenarioForTests(): void {
  priceBumpedSaleIds.clear();
}

const reject = ({ code, detail }: Rejection): Response =>
  problem(422, code, detail);

const printOutcome = (): PrintStatus =>
  getScenario() === "printer-gagal" ? "gagal" : "tercetak";

const notFound = () => problem(404, "NOT_FOUND", "Penjualan tidak ditemukan");

const amountOf = (sale: Sale, method: "cash" | "credit"): number =>
  sale.payments.find((p) => p.method === method)?.amount ?? 0;

/** Aturan 4: naikkan harga satuan item pertama sekali per saleId. */
function bumpFirstPrice(saleId: string, items: readonly PricedItem[]): boolean {
  if (getScenario() !== "harga-berubah" || priceBumpedSaleIds.has(saleId)) {
    return false;
  }
  const unitId = items[0]?.item.unitId;
  priceBumpedSaleIds.add(saleId);
  mockDb.update((s) => {
    for (const unit of s.products.flatMap((p) => p.units)) {
      if (unit.id === unitId) unit.price += PRICE_BUMP;
    }
  });
  return true;
}

function applyVoid(s: MockState, sale: Sale): void {
  for (const item of sale.items) {
    const productId = s.products.find((p) =>
      p.units.some((u) => u.id === item.unitId),
    )?.id;
    if (productId)
      s.stock[productId] = (s.stock[productId] ?? 0) + item.qtyBase;
  }
  const customer = s.customers.find((c) => c.id === sale.customerId);
  if (customer) customer.balance -= amountOf(sale, "credit");
  // Kas hanya dikoreksi bila penjualan milik shift yang sedang terbuka.
  if (s.shift && sale.createdAt >= s.shift.openedAt) {
    s.shift.cashSales -= amountOf(sale, "cash");
    s.shift.salesCount -= 1;
  }
  const stored = s.sales.find((x) => x.id === sale.id);
  if (stored) stored.status = "dibatalkan";
}

/** Aturan 3–5: harga server per item, setelah skenario harga-berubah. */
function priceRequest(
  saleId: string,
  rawItems: unknown,
): { state: Readonly<MockState>; items: PricedItem[] } | Response {
  let state = mockDb.get();
  let items = priceItems(state.products, rawItems);
  if (!isRejection(items) && bumpFirstPrice(saleId, items)) {
    state = mockDb.get();
    items = priceItems(state.products, rawItems);
  }
  if (isRejection(items)) return reject(items);
  const changes = priceChanges(items);
  if (changes.length > 0) {
    const extra: Pick<PriceChangedProblem, "changes"> = { changes };
    return problem(409, "PRICE_CHANGED", "Harga berubah", extra);
  }
  return { state, items };
}

/** Aturan 7: kasbon di atas limit butuh PIN pemilik. */
function creditGate(
  users: readonly MockUser[],
  paid: CheckedPayments,
  ownerPin: unknown,
): Response | null {
  const excess = creditExcess(paid);
  if (!excess) return null;
  if (ownerPin === undefined) {
    return problem(409, "CREDIT_LIMIT", "Kasbon melebihi batas", excess);
  }
  return isOwnerPin(users, ownerPin)
    ? null
    : problem(401, "PIN_INVALID", "PIN salah");
}

/** Aturan 8: simpan penjualan beserta efeknya ke stok, saldo, dan shift. */
function commitSale(
  draft: Omit<Sale, "number" | "createdAt">,
  items: readonly PricedItem[],
  paid: CheckedPayments,
): Sale {
  const createdAt = Date.now();
  const dateKey = jakartaDateKey(createdAt);
  const seq = (mockDb.get().saleSeq[dateKey] ?? 0) + 1;
  const sale: Sale = {
    ...draft,
    number: formatSaleNumber(createdAt, seq),
    createdAt,
  };
  mockDb.update((s) => {
    s.saleSeq[dateKey] = seq;
    for (const { productId, item } of items) {
      s.stock[productId] = (s.stock[productId] ?? 0) - item.qtyBase;
    }
    const buyer = s.customers.find((c) => c.id === sale.customerId);
    if (buyer) buyer.balance += paid.credit;
    if (s.shift) {
      s.shift.cashSales += paid.cash;
      s.shift.salesCount += 1;
    }
    s.sales.push(sale);
  });
  return sale;
}

export const salesHandlers = [
  http.post(
    "/api/sales",
    withScenario(async ({ request }) => {
      // Setelah body dibaca semuanya sinkron, jadi cek & simpan atomik.
      // Urutan: sesi → replay saleId (R7, juga saat shift sudah tutup) → shift → aturan 3–8.
      const body = await readJson(request);
      const state = mockDb.get();
      const user = requireSession(state);
      if (user instanceof Response) return user;
      const saleId = body?.saleId;
      if (!body || typeof saleId !== "string" || saleId === "") {
        return invalid("saleId wajib diisi");
      }
      const existing = state.sales.find((s) => s.id === saleId);
      if (existing) return HttpResponse.json(existing);
      if (!state.shift) {
        return problem(409, "SHIFT_CLOSED", "Tidak ada shift yang terbuka");
      }
      if (typeof body.print !== "boolean") return invalid("print wajib diisi");

      const priced = priceRequest(saleId, body.items);
      if (priced instanceof Response) return priced;
      const { items } = priced;
      const total = saleTotal(items);
      if (total === null) {
        return problem(422, "INVALID_QUANTITY", "Total di luar batas");
      }
      const paid = checkPayments(body, total, priced.state.customers);
      if (isRejection(paid)) return reject(paid);
      const denied = creditGate(state.users, paid, body.ownerPin);
      if (denied) return denied;

      const sale = commitSale(
        {
          id: saleId,
          kasirName: user.name,
          items: items.map((p) => p.item),
          total,
          payments: paid.payments,
          cashReceived: paid.cashReceived,
          change: paid.change,
          customerId: paid.customer?.id ?? null,
          status: "selesai",
          printStatus: body.print ? printOutcome() : "tidak_dicetak",
        },
        items,
        paid,
      );
      return HttpResponse.json(sale, { status: 201 });
    }),
  ),
  http.get(
    "/api/sales/today",
    withScenario(() => {
      const state = mockDb.get();
      const user = requireSession(state);
      if (user instanceof Response) return user;
      const today = jakartaDateKey(Date.now());
      // Dibalik dulu agar penjualan dengan waktu sama tetap terbaru dulu.
      const sales = [...state.sales]
        .reverse()
        .filter((s) => jakartaDateKey(s.createdAt) === today)
        .sort((a, b) => b.createdAt - a.createdAt);
      return HttpResponse.json(sales);
    }),
  ),
  http.post<{ saleId: string }>(
    "/api/sales/:saleId/print",
    withScenario(({ params }) => {
      const state = mockDb.get();
      const user = requireSession(state);
      if (user instanceof Response) return user;
      if (!state.sales.some((s) => s.id === params.saleId)) return notFound();
      const result: PrintResult = { printStatus: printOutcome() };
      mockDb.update((s) => {
        const sale = s.sales.find((x) => x.id === params.saleId);
        if (sale) sale.printStatus = result.printStatus;
      });
      return HttpResponse.json(result);
    }),
  ),
  http.post<{ saleId: string }>(
    "/api/sales/:saleId/void",
    withScenario(async ({ request, params }) => {
      const body = await readJson(request);
      const state = mockDb.get();
      const user = requireSession(state);
      if (user instanceof Response) return user;
      const sale = state.sales.find((s) => s.id === params.saleId);
      if (!sale) return notFound();
      const ownerPin = body?.ownerPin;
      if (ownerPin === undefined || ownerPin === null || ownerPin === "") {
        return problem(403, "PIN_REQUIRED", "PIN pemilik diperlukan");
      }
      if (!isOwnerPin(state.users, ownerPin)) {
        return problem(401, "PIN_INVALID", "PIN salah");
      }
      const reason = body?.reason;
      if (typeof reason !== "string" || reason.trim() === "") {
        return invalid("Alasan wajib diisi");
      }
      if (sale.status === "dibatalkan") return HttpResponse.json(sale);
      mockDb.update((s) => applyVoid(s, sale));
      const voided: Sale = { ...sale, status: "dibatalkan" };
      return HttpResponse.json(voided);
    }),
  ),
];
