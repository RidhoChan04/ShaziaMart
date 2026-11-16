import { SubPageHeader } from "../common/sub-page-header";

/** Isi menyusul (T13); judul dan tombol kembali sudah di jalur akhirnya. */
export function OpnameProductPage() {
  return (
    <div>
      <SubPageHeader
        title="Selisih per barang"
        back={{
          label: "Selisih opname",
          fallback: "/owner/laporan/selisih-opname",
        }}
      />
      <p className="text-muted">Segera hadir</p>
    </div>
  );
}
