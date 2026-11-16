import { SubPageHeader } from "../common/sub-page-header";

/** Isi menyusul (T13); judul dan tombol kembali sudah di jalur akhirnya. */
export function UnsoldPage() {
  return (
    <div>
      <SubPageHeader
        title="Tidak terjual ≥ 30 hari"
        back={{ label: "Laporan", fallback: "/owner/laporan" }}
      />
      <p className="text-muted">Segera hadir</p>
    </div>
  );
}
