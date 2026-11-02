import { HttpResponse, http } from "msw";
import type { CatalogMatch } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { type MockProduct, type MockUnit, mockDb } from "../db";
import { eceranOf, toKasirProduct } from "../products/views";
import { withScenario } from "../scenarios";
import { invalid, problem } from "./respond";

const MAX_RESULTS = 8;
const MIN_QUERY = 2;

const isSold = (p: MockProduct): boolean => p.status !== "nonaktif";

const matchOf = (product: MockProduct, unit: MockUnit): CatalogMatch => ({
  product: toKasirProduct(product),
  unitId: unit.id,
});

/** K6: kode milik barang/satuan nonaktif ditolak; yang sudah di keranjang tetap terjual. */
function sellable(product: MockProduct, unit: MockUnit): Response {
  if (!isSold(product) || !unit.active) {
    return problem(410, "PRODUCT_INACTIVE", "Barang ini tidak dijual lagi");
  }
  return HttpResponse.json(matchOf(product, unit));
}

export const catalogHandlers = [
  http.get(
    "/api/catalog/lookup",
    withScenario(({ request }) => {
      const code = new URL(request.url).searchParams.get("code")?.trim();
      if (!code) return invalid("Kode wajib diisi");
      const { products } = mockDb.get();
      for (const product of products) {
        const unit = product.units.find((u) => u.barcodes.includes(code));
        if (unit) return sellable(product, unit);
      }
      const byCode = products.find((p) => p.storeCode === code);
      if (!byCode) return problem(404, "NOT_FOUND", "Barang tidak ditemukan");
      return sellable(byCode, eceranOf(byCode));
    }),
  ),
  http.get(
    "/api/catalog/search",
    withScenario(({ request }) => {
      const q = (new URL(request.url).searchParams.get("q") ?? "")
        .trim()
        .toLowerCase();
      if (q.length < MIN_QUERY || /^\d+$/.test(q)) return HttpResponse.json([]);
      const matches: CatalogMatch[] = mockDb
        .get()
        .products.filter((p) => isSold(p) && p.name.toLowerCase().includes(q))
        .sort((a, b) => a.name.localeCompare(b.name, "id"))
        .slice(0, MAX_RESULTS)
        .map((p) => matchOf(p, eceranOf(p)));
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
        if (product && isSold(product)) {
          matches.push(matchOf(product, eceranOf(product)));
        }
      }
      return HttpResponse.json(matches);
    }),
  ),
];
