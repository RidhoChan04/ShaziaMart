import { SubPageHeader } from "../common/sub-page-header";

/** Isi menyusul (T12); judul dan tombol kembali sudah di jalur akhirnya. */
export function CategoriesPage() {
  return (
    <div>
      <SubPageHeader
        title="Per kategori"
        back={{ label: "Laporan", fallback: "/owner/laporan" }}
      />
      <p className="text-muted">Segera hadir</p>
    </div>
  );
}
