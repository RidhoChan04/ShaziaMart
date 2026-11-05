/** Pesan saat rentetan scanner masuk ke kolom (lihat `useScanGuard`); bawaan untuk kolom angka. */
export function ScannedAlert({
  show,
  text = "Itu barcode, bukan angka",
}: {
  show: boolean;
  text?: string;
}) {
  if (!show) return null;
  return (
    <p role="alert" className="text-sm font-medium text-danger">
      {text}
    </p>
  );
}
