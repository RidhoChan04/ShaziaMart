import { toast } from "sonner";
import { ApiError } from "@/shared/api/fetcher";
import { lookupCatalog, searchCatalog } from "@/shared/api/gen/catalog/catalog";
import type { CatalogMatch } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { beep } from "@/shared/lib/beep";
import { pesanError } from "@/shared/lib/error-messages";
import { useCart } from "../cart/cart-store";

type OnCurah = (match: CatalogMatch) => void;

const NOT_FOUND = "Barang tidak ditemukan";

/** Barang curah membuka jendela curah; lainnya langsung masuk keranjang. */
export function acceptMatch(match: CatalogMatch, onCurah: OnCurah): void {
  if (match.product.isCurah) {
    onCurah(match);
    return;
  }
  useCart.getState().addUnit(match);
  beep("ok");
}

async function resolve(
  find: () => Promise<CatalogMatch | undefined>,
  onCurah: OnCurah,
): Promise<void> {
  try {
    const match = await find();
    if (match) {
      acceptMatch(match, onCurah);
      return;
    }
    toast.error(NOT_FOUND);
  } catch (err) {
    const notFound = err instanceof ApiError && err.code === "NOT_FOUND";
    toast.error(notFound ? NOT_FOUND : pesanError(err));
  }
  beep("error");
}

/**
 * Cari kode (barcode / kode toko) lalu terima; gagal → toast + bunyi error.
 * Scan ulang kode yang sama selalu dicari lagi: pelanggan bisa membeli dua.
 */
export function resolveCode(code: string, onCurah: OnCurah): Promise<void> {
  return resolve(() => lookupCatalog({ code }), onCurah);
}

/** Cari nama lalu terima hasil teratas; tanpa hasil → toast + bunyi error. */
export function resolveName(q: string, onCurah: OnCurah): Promise<void> {
  return resolve(async () => (await searchCatalog({ q }))[0], onCurah);
}
