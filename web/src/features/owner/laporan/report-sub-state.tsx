import { pesanError } from "@/shared/lib/error-messages";
import { Button } from "@/shared/ui/button";

/** Galat sub-halaman Laporan: pesan dari `pesanError` + `Coba lagi`. */
export function ReportError({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-4 py-16 text-center">
      <p className="text-base font-semibold">{pesanError(error)}</p>
      <Button onClick={onRetry}>Coba lagi</Button>
    </div>
  );
}

/** Kerangka daftar sub-halaman Laporan saat memuat. */
export function ReportListSkeleton() {
  return (
    <div
      role="status"
      aria-busy="true"
      aria-label="Memuat laporan"
      className="grid gap-px overflow-hidden rounded-lg bg-surface"
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <div
          key={i}
          className="h-14 animate-pulse bg-border motion-reduce:animate-none"
        />
      ))}
    </div>
  );
}

export const EMPTY_SALES = "Belum ada penjualan";
