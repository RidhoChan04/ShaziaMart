import type { QueryClient } from "@tanstack/react-query";

/** Muat ulang daftar shift dan semua rincian shift (angka laci berubah setelah ambil uang atau batal). */
export function refreshShifts(client: QueryClient): void {
  void client.invalidateQueries({
    predicate: (q) =>
      typeof q.queryKey[0] === "string" &&
      q.queryKey[0].startsWith("/api/owner/shifts"),
  });
}
