/** Pesan saat rentetan scanner masuk ke kolom angka (lihat `useScanGuard`). */
export function ScannedAlert({ show }: { show: boolean }) {
  if (!show) return null;
  return (
    <p role="alert" className="text-sm font-medium text-danger">
      Itu barcode, bukan angka
    </p>
  );
}
