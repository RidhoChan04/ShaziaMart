import type { QueryClient } from "@tanstack/react-query";

/** Muat ulang daftar shift dan semua rincian shift (angka laci berubah setelah ambil uang atau batal). */
export function refreshShifts(client: QueryClient): void {
  void client.invalidateQueries({
    predicate: (q) =>
      typeof q.queryKey[0] === "string" &&
      q.queryKey[0].startsWith("/api/owner/shifts"),
  });
}

/** Muat ulang sekarang dan lapor galat (refetch yang gagal tidak boleh diam): true = data terbaru sudah dimuat. */
export async function reloadShifts(client: QueryClient): Promise<boolean> {
  try {
    await client.refetchQueries(
      {
        predicate: (q) =>
          typeof q.queryKey[0] === "string" &&
          q.queryKey[0].startsWith("/api/owner/shifts"),
      },
      { throwOnError: true },
    );
    return true;
  } catch {
    return false;
  }
}

export const RELOAD_FAILED =
  "Data terbaru gagal dimuat — tutup lembar ini, lalu coba lagi";
