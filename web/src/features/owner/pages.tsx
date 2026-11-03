/** Isi halaman pemilik sementara; judulnya dari header kerangka, isi nyata menyusul. */
function PlaceholderPage() {
  return <p className="text-muted">Segera hadir</p>;
}

export function LaporanPage() {
  return <PlaceholderPage />;
}

export function KasbonPage() {
  return <PlaceholderPage />;
}
