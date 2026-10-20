import { HttpResponse, http } from "msw";
import type { CatalogMatch } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { mockDb } from "../db";
import { withScenario } from "../scenarios";
import { invalid, problem } from "./respond";

const MAX_RESULTS = 8;
const MIN_QUERY = 2;

export const catalogHandlers = [
  http.get(
    "/api/catalog/lookup",
    withScenario(({ request }) => {
      const code = new URL(request.url).searchParams.get("code")?.trim();
      if (!code) return invalid("Kode wajib diisi");
      const { products } = mockDb.get();
      for (const product of products) {
        const unit = product.units.find((u) => u.barcodes.includes(code));
        if (unit) {
          const match: CatalogMatch = { product, unitId: unit.id };
          return HttpResponse.json(match);
        }
      }
      const byCode = products.find((p) => p.storeCode === code);
      const first = byCode?.units[0];
      if (!byCode || !first) {
        return problem(404, "NOT_FOUND", "Barang tidak ditemukan");
      }
      const match: CatalogMatch = { product: byCode, unitId: first.id };
      return HttpResponse.json(match);
    }),
  ),
  http.get(
    "/api/catalog/search",
    withScenario(({ request }) => {
      const q = (new URL(request.url).searchParams.get("q") ?? "")
        .trim()
        .toLowerCase();
      if (q.length < MIN_QUERY || /^\d+$/.test(q)) return HttpResponse.json([]);
      const matches: CatalogMatch[] = [];
      const hits = mockDb
        .get()
        .products.filter((p) => p.name.toLowerCase().includes(q))
        .sort((a, b) => a.name.localeCompare(b.name, "id"))
        .slice(0, MAX_RESULTS);
      for (const product of hits) {
        const first = product.units[0];
        if (first) matches.push({ product, unitId: first.id });
      }
      return HttpResponse.json(matches);
    }),
  ),
  http.get(
    "/api/catalog/quick-curah",
    withScenario(() => {
      const { products, settings } = mockDb.get();
      const matches: CatalogMatch[] = [];
      for (const id of settings.quickCurahProductIds) {
        const product = products.find((p) => p.id === id);
        const first = product?.units[0];
        if (product && first) matches.push({ product, unitId: first.id });
      }
      return HttpResponse.json(matches);
    }),
  ),
];
