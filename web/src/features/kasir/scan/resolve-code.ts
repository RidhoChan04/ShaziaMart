import { toast } from "sonner";
import { ApiError } from "@/shared/api/fetcher";
import { lookupCatalog } from "@/shared/api/gen/catalog/catalog";
import type { CatalogMatch } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { beep } from "@/shared/lib/beep";
import { pesanError } from "@/shared/lib/error-messages";
import { useCart } from "../cart/cart-store";

type OnCurah = (match: CatalogMatch) => void;

/** Barang curah membuka jendela curah; lainnya langsung masuk keranjang. */
export function acceptMatch(match: CatalogMatch, onCurah: OnCurah): void {
  if (match.product.isCurah) {
    onCurah(match);
    return;
  }
  useCart.getState().addUnit(match);
  beep("ok");
}

// Dipakai bersama kolom scan dan detektor scan: Enter ganda untuk kode yang sama tidak dobel.
const pending = new Set<string>();

/** Cari kode (barcode / kode toko) lalu terima; gagal → toast + bunyi error. */
export async function resolveCode(code: string, onCurah: OnCurah) {
  if (pending.has(code)) return;
  pending.add(code);
  try {
    acceptMatch(await lookupCatalog({ code }), onCurah);
  } catch (err) {
    const notFound = err instanceof ApiError && err.code === "NOT_FOUND";
    toast.error(notFound ? "Barang tidak ditemukan" : pesanError(err));
    beep("error");
  } finally {
    pending.delete(code);
  }
}
