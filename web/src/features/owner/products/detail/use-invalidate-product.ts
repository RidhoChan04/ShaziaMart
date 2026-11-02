import { useQueryClient } from "@tanstack/react-query";
import {
  getGetOwnerProductQueryKey,
  getGetOwnerTodaySummaryQueryKey,
  getListOwnerProductMovementsQueryKey,
  getListOwnerProductsQueryKey,
} from "@/shared/api/gen/owner/owner";

/** Setelah mutasi apa pun: detail, riwayat stok, daftar barang, dan ringkasan Beranda dimuat ulang. */
export function useInvalidateProduct(productId: string) {
  const client = useQueryClient();
  return () =>
    Promise.all([
      client.invalidateQueries({
        queryKey: getGetOwnerProductQueryKey(productId),
      }),
      client.invalidateQueries({
        queryKey: getListOwnerProductMovementsQueryKey(productId),
      }),
      client.invalidateQueries({ queryKey: getListOwnerProductsQueryKey() }),
      client.invalidateQueries({
        queryKey: getGetOwnerTodaySummaryQueryKey(),
      }),
    ]);
}
