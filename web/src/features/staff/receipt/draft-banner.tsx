/** Draf di HP tidak bisa dibaca/ditulis (penyimpanan penuh atau diblokir); tampil di Beranda dan tab Masuk. */
export function DraftStorageBanner() {
  return (
    <p
      role="alert"
      className="mt-3 rounded-lg bg-danger-soft px-4 py-3 text-[14px] font-medium text-danger-ink"
    >
      Draf tidak bisa dibaca dari HP. Muat ulang halaman; bila tetap begini,
      catat nota di kertas dulu.
    </p>
  );
}
