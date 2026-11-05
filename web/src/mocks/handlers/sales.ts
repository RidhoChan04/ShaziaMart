import { HttpResponse, http } from "msw";
import type {
  KasirLookupSale,
  PriceChangedProblem,
  PrintResult,
  PrintStatus,
  Sale,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { jakartaDateKey } from "@/shared/lib/business-day";
import {
  customerNameOf,
  kasirVoidWindow,
  type MockSale,
  type MockState,
  mockDb,
  updateWith,
} from "../db";
import { appendCredit } from "../ledger";
import { NO_PRICE_DETAIL, sellsAwaitingPrice } from "../products/guards";
import { formatSaleNumber } from "../sale-number";
import {
  type CheckedPayments,
  checkPayments,
  creditGate,
  isRejection,
  type PricedItem,
  priceChanges,
  priceItems,
  type Rejection,
  saleCost,
  saleTotal,
} from "../sale-rules";
import { getScenario, withScenario } from "../scenarios";
import { invalid, problem, readJson, requireSession } from "./respond";
import { toPublicSale, voidSaleAs } from "./sales-void";

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

/** (ruling R12) Cari nomor struk: 1..20 digit/tanda hubung, maksimal 20 hasil. */
const LOOKUP_Q = /^[0-9-]{1,20}$/;
const LOOKUP_MAX = 20;

/** Dibalik dulu agar penjualan dengan jam sama tetap terbaru (tercatat belakangan) dulu. */
const newestFirst = (sales: readonly MockSale[]): MockSale[] =>
  [...sales].reverse().sort((a, b) => b.createdAt - a.createdAt);

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

/** Aturan 3–5: harga server per item, setelah skenario harga-berubah. */
function priceRequest(
  saleId: string,
  rawItems: unknown,
): { state: Readonly<MockState>; items: PricedItem[] } | Response {
  let state = mockDb.get();
  let items = priceItems(state.products, rawItems);
  // R19: barang menunggu harga jual tidak bisa dijual, termasuk yang sudah di keranjang.
  const ids = isRejection(items) ? [] : items.map((p) => p.productId);
  if (sellsAwaitingPrice(state, ids)) {
    return problem(410, "PRODUCT_NO_PRICE", NO_PRICE_DETAIL);
  }
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

/** Aturan 8: simpan penjualan beserta HPP dan efeknya ke stok, buku kasbon, dan shift. */
function commitSale(
  draft: Omit<Sale, "number" | "createdAt"> & Pick<MockSale, "creditOverLimit">,
  items: readonly PricedItem[],
  paid: CheckedPayments,
): MockSale {
  const createdAt = Date.now();
  const dateKey = jakartaDateKey(createdAt);
  const { saleSeq, products } = mockDb.get();
  const seq = (saleSeq[dateKey] ?? 0) + 1;
  const sale: MockSale = {
    ...draft,
    number: formatSaleNumber(createdAt, seq),
    createdAt,
    costTotal: saleCost(products, draft.items),
    voidedAt: null,
    voidedById: null,
    voidedByName: null,
    voidReason: null,
    voidChannel: null,
    voidRefund: null,
  };
  mockDb.update((s) => {
    s.saleSeq[dateKey] = seq;
    for (const { productId, item } of items) {
      s.stock[productId] = (s.stock[productId] ?? 0) - item.qtyBase;
    }
    if (sale.customerId && paid.credit > 0) {
      appendCredit(s, {
        customerId: sale.customerId,
        amount: paid.credit,
        at: createdAt,
        saleId: sale.id,
        paymentId: null,
      });
    }
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
      if (existing) return HttpResponse.json(toPublicSale(existing));
      const { shift } = state;
      if (!shift) {
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
      // Aturan 7 (ruling R3): lewat limit tanpa alasan → 409; dengan alasan → tercatat.
      const gate = creditGate(paid, body.creditLimitReason);
      if (isRejection(gate)) return reject(gate);
      if ("limit" in gate) {
        return problem(
          409,
          "CREDIT_LIMIT",
          "Kasbon melebihi batas",
          gate.limit,
        );
      }

      const sale = commitSale(
        {
          id: saleId,
          kasirName: user.name,
          shiftId: shift.id,
          items: items.map((p) => p.item),
          total,
          payments: paid.payments,
          cashReceived: paid.cashReceived,
          change: paid.change,
          customerId: paid.customer?.id ?? null,
          status: "selesai",
          printStatus: body.print ? printOutcome() : "tidak_dicetak",
          creditOverLimit: gate.creditOverLimit,
        },
        items,
        paid,
      );
      return HttpResponse.json(toPublicSale(sale), { status: 201 });
    }),
  ),
  http.get(
    "/api/sales/shift",
    withScenario(() => {
      const state = mockDb.get();
      const user = requireSession(state);
      if (user instanceof Response) return user;
      // (jawaban pemilik J0) shift yang sedang buka, bukan hari ini.
      const { shift } = state;
      if (!shift) return HttpResponse.json([]);
      const sales = newestFirst(
        state.sales.filter((s) => s.shiftId === shift.id),
      ).map(toPublicSale);
      return HttpResponse.json(sales);
    }),
  ),
  http.get(
    "/api/sales/lookup",
    withScenario(({ request }) => {
      const state = mockDb.get();
      const user = requireSession(state);
      if (user instanceof Response) return user;
      const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
      if (q === "") return invalid("Nomor struk wajib diisi");
      if (!LOOKUP_Q.test(q)) return invalid("Nomor struk tidak valid");
      const { shift } = state;
      if (!shift) {
        return problem(409, "SHIFT_CLOSED", "Tidak ada shift yang terbuka");
      }
      // (ruling R12) shift lain, hari kalender WIB paling lama 7 hari lalu.
      const now = Date.now();
      const rows = newestFirst(
        state.sales.filter(
          (s) =>
            s.number.includes(q) &&
            kasirVoidWindow(s, shift, now) === "shift_lama",
        ),
      )
        .slice(0, LOOKUP_MAX)
        .map(
          (s): KasirLookupSale => ({
            ...toPublicSale(s),
            customerName: customerNameOf(state, s.customerId),
          }),
        );
      return HttpResponse.json(rows);
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
      // Setelah body dibaca semuanya sinkron: cek shift & batal atomik (seperti createSale).
      const body = await readJson(request);
      const user = requireSession(mockDb.get());
      if (user instanceof Response) return user;
      const now = Date.now();
      const res = updateWith((s) =>
        voidSaleAs(
          s,
          String(params.saleId),
          { user, channel: "kasir" },
          body,
          now,
        ),
      );
      if (res instanceof Response) return res;
      return HttpResponse.json(toPublicSale(res));
    }),
  ),
];
