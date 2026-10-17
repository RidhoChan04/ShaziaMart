/** Subset `import.meta.env` yang menentukan apakah SW PWA boleh didaftarkan. */
export interface PwaEnv {
  DEV: boolean;
  VITE_MOCK?: string | undefined;
}

/**
 * SW PWA (scope `/owner/`) hanya didaftarkan di build produksi tanpa mock.
 * Bila mock aktif, SW ini akan menjadi pengendali `/owner/*` (scope paling
 * spesifik menang) sehingga MSW berhenti mencegat request di halaman owner.
 */
export function shouldRegisterPwa(env: PwaEnv): boolean {
  return !(env.DEV || env.VITE_MOCK === "1");
}

/**
 * Halaman milik aplikasi pemilik. Registrasi (dan reload otomatis saat SW
 * diperbarui) dibatasi ke sini agar layar kasir tidak pernah di-reload.
 */
export function isOwnerPath(pathname: string): boolean {
  return pathname === "/owner" || pathname.startsWith("/owner/");
}
