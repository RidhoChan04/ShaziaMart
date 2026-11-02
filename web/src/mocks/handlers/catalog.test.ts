import { describe, expect, test } from "vitest";
import type {
  CatalogMatch,
  KasirSettings,
  ProductStatus,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import { mockDb } from "../db";
import {
  BIMOLI,
  cashSale,
  loginWithShift,
  post,
  saleItem,
} from "./test-helpers";

const json = async <T>(res: Response): Promise<T> => (await res.json()) as T;

const setStatus = (name: string, status: ProductStatus) =>
  mockDb.update((s) => {
    for (const p of s.products) if (p.name === name) p.status = status;
  });

const deactivateIndomieDus = () =>
  mockDb.update((s) => {
    const indomie = s.products.find((p) => p.name === "Indomie Goreng");
    for (const u of indomie?.units ?? [])
      if (u.name === "dus") u.active = false;
  });

const PRODUCT_KEYS = [
  "baseUnit",
  "id",
  "isCurah",
  "name",
  "storeCode",
  "units",
];
const UNIT_KEYS = [
  "barcodes",
  "id",
  "name",
  "price",
  "productId",
  "unitSize",
  "wholesaleTiers",
];

const expectKasirShape = (matches: readonly CatalogMatch[]) => {
  expect(matches.length).toBeGreaterThan(0);
  for (const { product } of matches) {
    expect(Object.keys(product).sort()).toEqual(PRODUCT_KEYS);
    for (const u of product.units) {
      expect(Object.keys(u).sort()).toEqual(UNIT_KEYS);
    }
  }
};

const expectInactive = async (code: string) => {
  const res = await fetch(`/api/catalog/lookup?code=${code}`);
  expect(res.status).toBe(410);
  expect(await json<{ code: string; detail: string }>(res)).toMatchObject({
    code: "PRODUCT_INACTIVE",
    detail: "Barang ini tidak dijual lagi",
  });
};

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

  test("respons katalog kasir hanya field kasir; satuan nonaktif dibuang", async () => {
    expectKasirShape([
      await json<CatalogMatch>(
        await fetch("/api/catalog/lookup?code=189686010944"),
      ),
      await json<CatalogMatch>(await fetch("/api/catalog/lookup?code=2001")),
      ...(await json<CatalogMatch[]>(
        await fetch("/api/catalog/search?q=indomie"),
      )),
      ...(await json<CatalogMatch[]>(await fetch("/api/catalog/quick-curah"))),
    ]);

    deactivateIndomieDus();
    await expectInactive("189686010944");
    const pcs = await json<CatalogMatch>(
      await fetch("/api/catalog/lookup?code=089686010947"),
    );
    expect(pcs.product.units.map((u) => u.name)).toEqual(["pcs"]);
    expectKasirShape([pcs]);
    const hits = await json<CatalogMatch[]>(
      await fetch("/api/catalog/search?q=indomie"),
    );
    const indomie = hits.find((h) => h.product.name === "Indomie Goreng");
    expect(indomie?.product.units.map((u) => u.name)).toEqual(["pcs"]);
    expect(indomie?.unitId).toBe(pcs.unitId);
  });

  test("barang nonaktif: lookup barcode & kode toko → 410 PRODUCT_INACTIVE; search & quick-curah tidak memuatnya", async () => {
    const gulaNames = async () =>
      (
        await json<CatalogMatch[]>(await fetch("/api/catalog/search?q=gula"))
      ).map((h) => h.product.name);
    expect(await gulaNames()).toContain("Gula Pasir");
    setStatus(BIMOLI, "nonaktif");
    setStatus("Gula Pasir", "nonaktif");
    await expectInactive("8992696404441");
    await expectInactive("1003");
    await expectInactive("2001");
    const bimoli = await json<CatalogMatch[]>(
      await fetch("/api/catalog/search?q=bimoli"),
    );
    expect(bimoli).toEqual([]);
    expect(await gulaNames()).not.toContain("Gula Pasir");
    const curah = await json<CatalogMatch[]>(
      await fetch("/api/catalog/quick-curah"),
    );
    expect(curah.map((h) => h.product.name)).toEqual([
      "Beras",
      "Telur Ayam",
      "Minyak Goreng",
      "Tepung Terigu",
    ]);

    // "Tidak diambil lagi" tetap dijual sampai habis.
    setStatus(BIMOLI, "tidak_diambil");
    const res = await fetch("/api/catalog/lookup?code=8992696404441");
    expect(res.status).toBe(200);
    expect((await json<CatalogMatch>(res)).product.name).toBe(BIMOLI);
    expect(
      (
        await json<CatalogMatch[]>(await fetch("/api/catalog/search?q=bimoli"))
      ).map((h) => h.product.name),
    ).toEqual([BIMOLI]);
  });

  test("barang dinonaktifkan setelah masuk keranjang → createSale tetap 201", async () => {
    await loginWithShift();
    const before = await fetch("/api/catalog/lookup?code=8992696404441");
    expect(before.status).toBe(200);
    const indomieDus = saleItem(
      "Indomie Goreng",
      { qtyBase: 40 },
      112000,
      "dus",
    );
    setStatus(BIMOLI, "nonaktif");
    deactivateIndomieDus();
    await expectInactive("8992696404441");
    const res = await post(
      "/api/sales",
      cashSale(1, {
        items: [saleItem(BIMOLI, { qtyBase: 1 }, 36000), indomieDus],
        payments: [{ method: "cash", amount: 148000 }],
        cashReceived: 150000,
      }),
    );
    expect(res.status).toBe(201);
    const stored = mockDb.get().sales.at(-1);
    expect(stored?.items.map((i) => [i.productName, i.unitName])).toEqual([
      [BIMOLI, "pcs"],
      ["Indomie Goreng", "dus"],
    ]);
  });
});
