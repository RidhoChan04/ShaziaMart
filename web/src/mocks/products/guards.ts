import { ProductStatus } from "@/shared/api/gen/shaziaMartAPI.schemas";
import type { MockProduct, MockState } from "../db";

/** K2: barang baru dari nota belum punya harga jual — kasir menolaknya (410 PRODUCT_NO_PRICE). */
export const NO_PRICE_DETAIL = "Barang belum punya harga jual";

/** K2/R20: barang menunggu harga jual hanya diaktifkan lewat form barang dengan harga jual. */
const PRICE_FORM_ONLY = "Isi harga jual dulu";

const isStatus = (x: unknown): x is ProductStatus =>
  (Object.values(ProductStatus) as unknown[]).includes(x);

const awaitingPrice = (p: MockProduct): boolean =>
  p.status === "menunggu_harga";

/**
 * Body `PUT …/status` → status & langka baru, atau pesan 422: body salah, atau
 * barang menunggu harga jual (masuk/keluar status itu tidak lewat sini).
 */
export function statusChange(
  product: MockProduct,
  body: Record<string, unknown> | null,
): { status: ProductStatus; scarce: boolean } | string {
  const status = body?.status;
  const scarce = body?.scarce;
  if (!isStatus(status) || typeof scarce !== "boolean") {
    return "Status barang tidak valid";
  }
  if (status === "menunggu_harga" || awaitingPrice(product)) {
    return PRICE_FORM_ONLY;
  }
  return { status, scarce };
}

/** R20: lembar harga tidak berlaku untuk barang menunggu harga jual; null = boleh. */
export const pricesBlocked = (product: MockProduct): string | null =>
  awaitingPrice(product) ? PRICE_FORM_ONLY : null;

/** R19: ada barang menunggu harga jual di antara `productIds` (penjualan ditolak utuh). */
export const sellsAwaitingPrice = (
  state: Readonly<MockState>,
  productIds: readonly string[],
): boolean =>
  state.products.some((p) => awaitingPrice(p) && productIds.includes(p.id));
