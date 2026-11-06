/** Status penyimpanan localStorage backend palsu: kuota penuh tidak boleh diam-diam. */
const WARNING =
  'Penyimpanan data contoh penuh — data terbaru tidak tersimpan. Pakai "Reset data" di panel pengembang.';

let failed = false;
const listeners = new Set<() => void>();

function set(next: boolean): void {
  if (failed === next) return;
  failed = next;
  for (const l of listeners) l();
}

/** Tulis gagal: peringatkan sekali (sampai ada tulis yang berhasil) lalu tandai. */
export function reportPersistFailure(): void {
  if (!failed) console.warn(WARNING);
  set(true);
}

export function reportPersistSuccess(): void {
  set(false);
}

export function persistFailed(): boolean {
  return failed;
}

export function subscribePersistStatus(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}
