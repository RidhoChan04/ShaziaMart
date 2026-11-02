import type { Product } from "@/shared/api/gen/shaziaMartAPI.schemas";
import type { MockProduct, MockState, MockUnit } from "../db";

/** Satuan eceran = satuan pertama; setiap barang selalu punya. */
export function eceranOf(p: MockProduct): MockUnit {
  const first = p.units[0];
  if (!first) throw new Error(`Barang ${p.id} tanpa satuan`);
  return first;
}

/** Proyeksi untuk endpoint kasir: tanpa HPP, kategori, status; satuan nonaktif dibuang. */
export function toKasirProduct(p: MockProduct): Product {
  return {
    id: p.id,
    name: p.name,
    storeCode: p.storeCode,
    isCurah: p.isCurah,
    baseUnit: p.baseUnit,
    units: p.units
      .filter((u) => u.active)
      .map(({ active: _, ...unit }) => unit),
  };
}

/** Barang pemilik satuan ini, termasuk satuan nonaktif. */
export function productOfUnit(
  state: Readonly<MockState>,
  unitId: string,
): MockProduct | undefined {
  return state.products.find((p) => p.units.some((u) => u.id === unitId));
}
