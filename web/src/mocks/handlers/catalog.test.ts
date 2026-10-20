import { describe, expect, test } from "vitest";
import type {
  CatalogMatch,
  KasirSettings,
} from "@/shared/api/gen/shaziaMartAPI.schemas";

const json = async <T>(res: Response): Promise<T> => (await res.json()) as T;

describe("katalog", () => {
  test("lookup barcode dus Indomie -> unit dus", async () => {
    const res = await fetch("/api/catalog/lookup?code=189686010944");
    expect(res.status).toBe(200);
    const match = await json<CatalogMatch>(res);
    expect(match.product.name).toContain("Indomie Goreng");
    const unit = match.product.units.find((u) => u.id === match.unitId);
    expect(unit?.unitSize).toBe(40);
    expect(unit?.barcodes).toContain("189686010944");
  });

  test("lookup barcode pcs -> unit pcs", async () => {
    const match = await json<CatalogMatch>(
      await fetch("/api/catalog/lookup?code=089686010947"),
    );
    expect(
      match.product.units.find((u) => u.id === match.unitId)?.unitSize,
    ).toBe(1);
  });

  test("lookup kode toko 2001 -> Gula Pasir unit kg", async () => {
    const match = await json<CatalogMatch>(
      await fetch("/api/catalog/lookup?code=2001"),
    );
    expect(match.product.name).toContain("Gula Pasir");
    expect(match.unitId).toBe(match.product.units[0]?.id);
    expect(match.product.units[0]?.unitSize).toBe(1000);
  });

  test("lookup tidak dikenal -> 404 NOT_FOUND; tanpa kode -> 422", async () => {
    const res = await fetch("/api/catalog/lookup?code=9999999");
    expect(res.status).toBe(404);
    expect((await json<{ code: string }>(res)).code).toBe("NOT_FOUND");
    expect((await fetch("/api/catalog/lookup")).status).toBe(422);
  });

  test("search 'indo' <= 8 hasil terurut; 'i' dan angka -> []", async () => {
    const hits = await json<CatalogMatch[]>(
      await fetch("/api/catalog/search?q=INDO"),
    );
    expect(hits.length).toBeGreaterThan(0);
    expect(hits.length).toBeLessThanOrEqual(8);
    const names = hits.map((h) => h.product.name);
    expect(names.every((n) => n.toLowerCase().includes("indo"))).toBe(true);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, "id")));
    expect(
      await json<unknown[]>(await fetch("/api/catalog/search?q=i")),
    ).toEqual([]);
    expect(
      await json<unknown[]>(await fetch("/api/catalog/search?q=1001")),
    ).toEqual([]);
  });

  test("quick-curah sesuai pengaturan", async () => {
    const settings = await json<KasirSettings>(
      await fetch("/api/settings/kasir"),
    );
    const hits = await json<CatalogMatch[]>(
      await fetch("/api/catalog/quick-curah"),
    );
    expect(hits.map((h) => h.product.id)).toEqual(
      settings.quickCurahProductIds,
    );
    expect(hits.every((h) => h.product.isCurah)).toBe(true);
  });
});
