/** Halaman pemilik sementara; isi nyata dibangun di rencana berikutnya. */
function PlaceholderPage({ title }: { title: string }) {
  return <h1 className="text-xl font-bold">{title}</h1>;
}

export function BerandaPage() {
  return <PlaceholderPage title="Beranda" />;
}

export function BarangPage() {
  return <PlaceholderPage title="Barang" />;
}

export function LaporanPage() {
  return <PlaceholderPage title="Laporan" />;
}

export function KasbonPage() {
  return <PlaceholderPage title="Kasbon" />;
}

export function LainnyaPage() {
  return <PlaceholderPage title="Lainnya" />;
}
