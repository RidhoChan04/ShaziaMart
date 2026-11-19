/** Kelompok Pengaturan; urutan = urutan di daftar, dan segmen `$bagian` pada alamat. */
export const SETTINGS_SECTIONS = [
  "toko",
  "kasir",
  "kasbon",
  "stok",
  "laporan",
  "perhatian",
  "telepon",
] as const;

export type SettingsSection = (typeof SETTINGS_SECTIONS)[number];

export const SECTION_TITLES: Record<SettingsSection, string> = {
  toko: "Toko & struk",
  kasir: "Kasir",
  kasbon: "Kasbon",
  stok: "Stok",
  laporan: "Laporan",
  perhatian: "Perlu perhatian",
  telepon: "Nomor telepon pemilik",
};
