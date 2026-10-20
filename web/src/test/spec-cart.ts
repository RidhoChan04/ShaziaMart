import { act } from "@testing-library/react";
import { useCart } from "@/features/kasir/cart/cart-store";
import { mockDb } from "@/mocks/db";
import type { CatalogMatch } from "@/shared/api/gen/shaziaMartAPI.schemas";

/** Barang seed dengan satuan pertamanya. */
export function seedMatch(name: string): CatalogMatch {
  const product = mockDb.get().products.find((p) => p.name === name);
  const unit = product?.units[0];
  if (!product || !unit) throw new Error(`Barang ${name} tidak ada di seed`);
  return { product, unitId: unit.id };
}

function repeat(n: number, fn: () => void) {
  for (let i = 0; i < n; i += 1) fn();
}

/** Enam baris contoh spec bagian 4, total Rp361.500 (Indomie 40 pcs → harga grosir). */
export function fillSpecCart() {
  act(() => {
    const cart = useCart.getState();
    cart.addUnit(seedMatch("Beras Pandan Wangi 5 kg"));
    repeat(2, () => cart.addUnit(seedMatch("Minyak Goreng Bimoli 2 L")));
    cart.addCurah(seedMatch("Gula Pasir"), { qtyBase: 1500 });
    cart.addCurah(seedMatch("Telur Ayam"), { qtyBase: 1000 });
    repeat(40, () => cart.addUnit(seedMatch("Indomie Goreng")));
    repeat(3, () => cart.addUnit(seedMatch("Kopi Kapal Api 165 g")));
  });
}
