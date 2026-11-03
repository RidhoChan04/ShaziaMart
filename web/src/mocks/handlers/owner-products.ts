import { HttpResponse, http } from "msw";
import type {
  FieldError,
  ImportResult,
  ImportRow,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import {
  PRODUCT_HAS_RECEIPTS_MESSAGE,
  PRODUCT_HAS_SALES_MESSAGE,
} from "@/shared/lib/error-messages";
import { type MockProduct, type MockState, mockDb } from "../db";
import {
  type ApplyOptions,
  type ApplyResult,
  applyDraft,
  saveApplied,
} from "../products/apply";
import { draftFromInput } from "../products/drafts";
import { pricesBlocked, statusChange } from "../products/guards";
import { checkImport, commitImport, readImportRows } from "../products/import";
import { applyPriceLines, readPriceLines } from "../products/prices";
import {
  hasReceipts,
  movementsOf,
  soldUnitIds,
  toOwnerProduct,
  toOwnerRow,
} from "../products/views";
import { withScenario } from "../scenarios";
import { invalid, problem, readJson, requireOwnerSession } from "./respond";

const BASE = "/api/owner/products";

type Found = { state: Readonly<MockState>; product: MockProduct };

/** Sesi pemilik dulu, lalu barang dari path; selain itu respons 401/404. */
function findProduct(productId: string): Found | Response {
  const state = mockDb.get();
  const user = requireOwnerSession(state);
  if (user instanceof Response) return user;
  const product = state.products.find((p) => p.id === productId);
  if (!product) return problem(404, "NOT_FOUND", "Barang tidak ditemukan");
  return { state, product };
}

const validationFailed = (errors: FieldError[]): Response =>
  problem(422, "VALIDATION", "Data barang tidak valid", { errors });

const ownerProduct = (productId: string, status = 200): Response => {
  const state = mockDb.get();
  const product = state.products.find((p) => p.id === productId);
  if (!product) return problem(404, "NOT_FOUND", "Barang tidak ditemukan");
  return HttpResponse.json(toOwnerProduct(state, product), { status });
};

/** Simpan hasil bila valid; galat tipe dari body digabung dengan galat aturan (satu per field). */
function saveOrFail(
  result: ApplyResult,
  inputErrors: FieldError[],
  opts: ApplyOptions,
  status: number,
  after?: (s: MockState, productId: string) => void,
): Response {
  const taken = new Set(inputErrors.map((e) => e.field));
  const errors = [
    ...inputErrors,
    ...(result.ok ? [] : result.errors.filter((e) => !taken.has(e.field))),
  ];
  if (!result.ok || errors.length > 0) return validationFailed(errors);
  mockDb.update((s) => {
    saveApplied(s, result, opts);
    after?.(s, result.product.id);
  });
  return ownerProduct(result.product.id, status);
}

type ImportInput = { state: Readonly<MockState>; rows: ImportRow[] };

/** Sesi pemilik lalu body `ImportRequest`; selain itu 401/422. */
async function importInput(request: Request): Promise<ImportInput | Response> {
  const state = mockDb.get();
  const user = requireOwnerSession(state);
  if (user instanceof Response) return user;
  const rows = readImportRows(await readJson(request));
  if (rows === null) return invalid("Baris impor tidak valid (1–5000 baris)");
  return { state, rows };
}

export const ownerProductHandlers = [
  http.get(
    BASE,
    withScenario(() => {
      const state = mockDb.get();
      const user = requireOwnerSession(state);
      if (user instanceof Response) return user;
      const rows = state.products
        .map((p) => toOwnerRow(state, p))
        .sort((a, b) => a.name.localeCompare(b.name, "id"));
      return HttpResponse.json(rows);
    }),
  ),
  http.post(
    BASE,
    withScenario(async ({ request }) => {
      const state = mockDb.get();
      const user = requireOwnerSession(state);
      if (user instanceof Response) return user;
      const input = draftFromInput(await readJson(request));
      const opts: ApplyOptions = {
        mode: "replace",
        source: "pemilik",
        now: Date.now(),
      };
      return saveOrFail(
        applyDraft(state, null, input.draft, opts),
        input.errors,
        opts,
        201,
      );
    }),
  ),
  http.get(
    `${BASE}/:productId`,
    withScenario(({ params }) => {
      const found = findProduct(String(params.productId));
      if (found instanceof Response) return found;
      return HttpResponse.json(toOwnerProduct(found.state, found.product));
    }),
  ),
  http.put(
    `${BASE}/:productId`,
    withScenario(async ({ params, request }) => {
      const found = findProduct(String(params.productId));
      if (found instanceof Response) return found;
      const input = draftFromInput(await readJson(request));
      const opts: ApplyOptions = {
        mode: "replace",
        source: "pemilik",
        now: Date.now(),
        bigUnitId: input.bigUnitId,
      };
      const result = applyDraft(found.state, found.product, input.draft, opts);
      return saveOrFail(result, input.errors, opts, 200);
    }),
  ),
  http.delete(
    `${BASE}/:productId`,
    withScenario(({ params }) => {
      const found = findProduct(String(params.productId));
      if (found instanceof Response) return found;
      const sold = soldUnitIds(found.state);
      if (found.product.units.some((u) => sold.has(u.id))) {
        return problem(409, "PRODUCT_HAS_SALES", PRODUCT_HAS_SALES_MESSAGE);
      }
      const id = found.product.id;
      // R32: nota aktif merujuk barang ini; menghapusnya membuat nota tidak bisa diubah/dibatalkan.
      if (hasReceipts(found.state, id)) {
        return problem(409, "PRODUCT_HAS_SALES", PRODUCT_HAS_RECEIPTS_MESSAGE);
      }
      mockDb.update((s) => {
        s.products = s.products.filter((p) => p.id !== id);
        s.priceHistory = s.priceHistory.filter((e) => e.productId !== id);
        s.settings.quickCurahProductIds =
          s.settings.quickCurahProductIds.filter((x) => x !== id);
        delete s.stock[id];
        delete s.minStock[id];
        delete s.costAlerts[id];
      });
      return new HttpResponse(null, { status: 204 });
    }),
  ),
  http.put(
    `${BASE}/:productId/status`,
    withScenario(async ({ params, request }) => {
      const found = findProduct(String(params.productId));
      if (found instanceof Response) return found;
      const change = statusChange(found.product, await readJson(request));
      if (typeof change === "string") return invalid(change);
      mockDb.update((s) => {
        const p = s.products.find((x) => x.id === found.product.id);
        if (!p) return;
        p.status = change.status;
        p.scarce = change.scarce;
      });
      return ownerProduct(found.product.id);
    }),
  ),
  http.put(
    `${BASE}/:productId/prices`,
    withScenario(async ({ params, request }) => {
      const found = findProduct(String(params.productId));
      if (found instanceof Response) return found;
      const blocked = pricesBlocked(found.product);
      if (blocked !== null) return invalid(blocked);
      const lines = readPriceLines(await readJson(request));
      if (lines === null) return validationFailed([]);
      const now = Date.now();
      const result = applyPriceLines(found.state, found.product, lines, now);
      const opts: ApplyOptions = { mode: "replace", source: "pemilik", now };
      return saveOrFail(result, [], opts, 200, (s, id) => {
        delete s.costAlerts[id];
      });
    }),
  ),
  http.delete(
    `${BASE}/:productId/cost-alert`,
    withScenario(({ params }) => {
      const found = findProduct(String(params.productId));
      if (found instanceof Response) return found;
      mockDb.update((s) => {
        delete s.costAlerts[found.product.id];
      });
      return new HttpResponse(null, { status: 204 });
    }),
  ),
  http.get(
    `${BASE}/:productId/movements`,
    withScenario(({ params }) => {
      const found = findProduct(String(params.productId));
      if (found instanceof Response) return found;
      return HttpResponse.json(movementsOf(found.state, found.product.id));
    }),
  ),
  http.post(
    "/api/owner/product-imports/check",
    withScenario(async ({ request }) => {
      const input = await importInput(request);
      if (input instanceof Response) return input;
      const { check } = checkImport(input.state, input.rows, Date.now());
      return HttpResponse.json(check);
    }),
  ),
  http.post(
    "/api/owner/product-imports",
    withScenario(async ({ request }) => {
      const input = await importInput(request);
      if (input instanceof Response) return input;
      const now = Date.now();
      let result: ImportResult = { created: 0, updated: 0, skipped: 0 };
      mockDb.update((s) => {
        result = commitImport(s, input.rows, now);
      });
      return HttpResponse.json(result);
    }),
  ),
  http.get(
    "/api/owner/categories",
    withScenario(() => {
      const state = mockDb.get();
      const user = requireOwnerSession(state);
      if (user instanceof Response) return user;
      return HttpResponse.json(state.categories);
    }),
  ),
];
