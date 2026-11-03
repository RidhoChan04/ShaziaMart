/** Foto nota dikompres di HP sebelum disimpan/dikirim; server menolak > 1 MB. */
export const PHOTO_MAX_BYTES = 300 * 1024;

export type Attempt = { longSide: number; quality: number };

export const FIRST_ATTEMPT: Attempt = { longSide: 1600, quality: 0.8 };

/** Percobaan berikutnya bila hasil masih > 300 KB: turunkan mutu dulu, lalu kecilkan sisi. */
export function nextAttempt(a: Attempt, bytes: number): Attempt | null {
  if (bytes <= PHOTO_MAX_BYTES) return null;
  if (a.quality > 0.45) {
    return {
      longSide: a.longSide,
      quality: Math.round((a.quality - 0.1) * 10) / 10,
    };
  }
  if (a.longSide > 900) {
    return { longSide: Math.round(a.longSide * 0.8), quality: 0.8 };
  }
  return null; // terima apa adanya (server menolak > 1 MB)
}

function render(
  bitmap: ImageBitmap,
  { longSide, quality }: Attempt,
): Promise<Blob> {
  // Tidak pernah memperbesar foto.
  const scale = Math.min(1, longSide / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(bitmap.width * scale));
  canvas.height = Math.max(1, Math.round(bitmap.height * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return Promise.reject(new Error("Foto tidak bisa diproses"));
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) =>
        blob ? resolve(blob) : reject(new Error("Foto tidak bisa diproses")),
      "image/jpeg",
      quality,
    );
  });
}

export async function compressPhoto(
  file: Blob,
): Promise<{ blob: Blob; bytes: number }> {
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
  } catch {
    throw new Error("Foto tidak bisa dibaca");
  }
  try {
    let attempt: Attempt | null = FIRST_ATTEMPT;
    let blob = await render(bitmap, attempt);
    for (;;) {
      attempt = nextAttempt(attempt, blob.size);
      if (attempt === null) return { blob, bytes: blob.size };
      blob = await render(bitmap, attempt);
    }
  } finally {
    bitmap.close();
  }
}
