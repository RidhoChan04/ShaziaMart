import { SubPageHeader } from "../common/sub-page-header";

/** Isi menyusul (T12); judul dan tombol kembali sudah di jalur akhirnya. */
export function TopProductsPage() {
  return (
    <div>
      <SubPageHeader
        title="Paling laku"
        back={{ label: "Laporan", fallback: "/owner/laporan" }}
      />
      <p className="text-muted">Segera hadir</p>
    </div>
  );
}
