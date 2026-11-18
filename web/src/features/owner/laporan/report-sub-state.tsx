import { CircleAlert } from "lucide-react";
import { pesanError } from "@/shared/lib/error-messages";
import { Button } from "@/shared/ui/button";

/**
 * Muat ulang gagal padahal data lama masih tampil (`isError && data !== undefined`): peringatan
 * tidak menghalangi di atas isi, agar angka lama tidak tampil diam-diam sebagai yang terbaru.
 */
export function StaleReportAlert({
  error,
  onRetry,
}: {
  error: unknown;
  onRetry: () => void;
}) {
  return (
    <div
      role="alert"
      className="flex items-center gap-3 rounded-lg bg-surface px-4 py-2"
    >
      <CircleAlert
        aria-hidden="true"
        className="size-4 shrink-0 text-danger-ink"
      />
      <p className="min-w-0 flex-1 text-[15px] font-medium text-danger-ink">
        {pesanError(error)}
      </p>
      <Button variant="outline" className="h-11 shrink-0" onClick={onRetry}>
        Coba lagi
      </Button>
    </div>
  );
}

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
