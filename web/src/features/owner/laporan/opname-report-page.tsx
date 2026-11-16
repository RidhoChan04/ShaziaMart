import { SubPageHeader } from "../common/sub-page-header";

/** Isi menyusul (T13); judul dan tombol kembali sudah di jalur akhirnya. */
export function OpnameReportPage() {
  return (
    <div>
      <SubPageHeader
        title="Selisih opname"
        back={{ label: "Laporan", fallback: "/owner/laporan" }}
      />
      <p className="text-muted">Segera hadir</p>
    </div>
  );
}
