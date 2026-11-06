import { HttpResponse, http } from "msw";
import {
  type ProductSales,
  ProductSalesSort,
  ReportPeriod,
  type SalesReport,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { jakartaIsoDate } from "@/shared/lib/business-day";
import { checkRange } from "@/shared/lib/report-period";
import { mockDb } from "../db";
import {
  productSales,
  type SalesQuery,
  salesReport,
} from "../reports/sales-report";
import { withScenario } from "../scenarios";
import { invalid, requireOwnerSession } from "./respond";

const BASE = "/api/owner/reports";

const oneOf =
  <T extends string>(values: Record<string, T>) =>
  (v: unknown): v is T =>
    (Object.values(values) as unknown[]).includes(v);
const isPeriod = oneOf(ReportPeriod);
const isProductSort = oneOf(ProductSalesSort);

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

/**
 * Laporan pemilik (K16). `stock`, `opname`, dan `opname/{productId}` ditambahkan T10; semua angka,
 * urutan, dan pembanding dihitung di sini, layar hanya menampilkan.
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
];
