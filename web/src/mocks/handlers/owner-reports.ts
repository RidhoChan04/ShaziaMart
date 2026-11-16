import { HttpResponse, http } from "msw";
import {
  type OpnameProductReport,
  type OpnameReport,
  type ProductSales,
  ProductSalesSort,
  ReportPeriod,
  type SalesReport,
  type StockReport,
  StockReportSort,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { jakartaIsoDate } from "@/shared/lib/business-day";
import {
  checkRange,
  clampToToday,
  type IsoRange,
} from "@/shared/lib/report-period";
import { mockDb } from "../db";
import { opnameProductReport, opnameReport } from "../reports/opname-report";
import {
  productSales,
  type SalesQuery,
  salesReport,
} from "../reports/sales-report";
import { thinMarginReport } from "../reports/thin-margin";
import { unsoldReport } from "../reports/unsold";
import { withScenario } from "../scenarios";
import { invalid, problem, requireOwnerSession } from "./respond";

const BASE = "/api/owner/reports";

const oneOf =
  <T extends string>(values: Record<string, T>) =>
  (v: unknown): v is T =>
    (Object.values(values) as unknown[]).includes(v);
const isPeriod = oneOf(ReportPeriod);
const isProductSort = oneOf(ProductSalesSort);
const isStockSort = oneOf(StockReportSort);

/** Periode & rentang laporan; pesan 422 = `checkRange` (sama dengan layar pemilik). */
function readPeriod(
  params: URLSearchParams,
  now: number,
): SalesQuery | Response {
  const period = params.get("period");
  if (!isPeriod(period)) return invalid("Periode tidak valid");
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const message = checkRange(period, from, to, jakartaIsoDate(now));
  return message === null ? { period, from, to } : invalid(message);
}

/** Rentang selisih opname: diperiksa seperti period tanggal; `to` sesudah hari ini dijepit. */
function readRange(params: URLSearchParams, now: number): IsoRange | Response {
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const today = jakartaIsoDate(now);
  const message = checkRange("tanggal", from, to, today);
  if (message !== null) return invalid(message);
  const clamped = clampToToday({ from, to }, today);
  return { from: clamped.from, to: clamped.to };
}

/**
 * Laporan pemilik (K16): penjualan, barang terjual, stok (K17/K18), dan selisih opname
 * (K19/K20); semua angka, urutan, dan pembanding dihitung di sini, layar hanya menampilkan.
 */
export const ownerReportHandlers = [
  http.get(
    `${BASE}/sales`,
    withScenario(({ request }) => {
      const state = mockDb.get();
      const owner = requireOwnerSession(state);
      if (owner instanceof Response) return owner;
      const now = Date.now();
      const q = readPeriod(new URL(request.url).searchParams, now);
      if (q instanceof Response) return q;
      const body: SalesReport = salesReport(state, q, now);
      return HttpResponse.json(body);
    }),
  ),
  http.get(
    `${BASE}/products`,
    withScenario(({ request }) => {
      const state = mockDb.get();
      const owner = requireOwnerSession(state);
      if (owner instanceof Response) return owner;
      const now = Date.now();
      const params = new URL(request.url).searchParams;
      const q = readPeriod(params, now);
      if (q instanceof Response) return q;
      const sort = params.get("sort") ?? "omzet";
      if (!isProductSort(sort)) return invalid("Urutan tidak valid");
      const body: ProductSales[] = productSales(state, { ...q, sort }, now);
      return HttpResponse.json(body);
    }),
  ),
  http.get(
    `${BASE}/stock`,
    withScenario(({ request }) => {
      const state = mockDb.get();
      const owner = requireOwnerSession(state);
      if (owner instanceof Response) return owner;
      const now = Date.now();
      const sort = new URL(request.url).searchParams.get("sort") ?? "modal";
      if (!isStockSort(sort)) return invalid("Urutan tidak valid");
      const body: StockReport = {
        today: jakartaIsoDate(now),
        unsold: unsoldReport(state, now, sort),
        thinMargin: thinMarginReport(state),
      };
      return HttpResponse.json(body);
    }),
  ),
  http.get(
    `${BASE}/opname`,
    withScenario(({ request }) => {
      const state = mockDb.get();
      const owner = requireOwnerSession(state);
      if (owner instanceof Response) return owner;
      const range = readRange(new URL(request.url).searchParams, Date.now());
      if (range instanceof Response) return range;
      const body: OpnameReport = opnameReport(state, range);
      return HttpResponse.json(body);
    }),
  ),
  http.get(
    `${BASE}/opname/:productId`,
    withScenario(({ request, params }) => {
      const state = mockDb.get();
      const owner = requireOwnerSession(state);
      if (owner instanceof Response) return owner;
      const range = readRange(new URL(request.url).searchParams, Date.now());
      if (range instanceof Response) return range;
      const body: OpnameProductReport | null = opnameProductReport(
        state,
        String(params.productId),
        range,
      );
      if (body === null) {
        return problem(404, "NOT_FOUND", "Belum ada hitungan barang ini");
      }
      return HttpResponse.json(body);
    }),
  ),
];
