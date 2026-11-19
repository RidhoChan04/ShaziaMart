import { HttpResponse, http } from "msw";
import type { KasirSettings } from "@/shared/api/gen/shaziaMartAPI.schemas";
import { mockDb } from "../db";
import { mockPhotos } from "../photos";
import { withScenario } from "../scenarios";
import { problem, requireSession } from "./respond";

/** (R3) URL gambar QRIS unggahan pemilik; gambar contoh bawaan berupa berkas statis. */
const QRIS_IMAGE_PATH = "/api/settings/qris-image/";

export const qrisImageUrl = (imageId: string): string =>
  `${QRIS_IMAGE_PATH}${imageId}`;

/** Id gambar unggahan dari `qrisImageUrl`; null untuk gambar statis. */
export const qrisImageIdOf = (url: string): string | null =>
  url.startsWith(QRIS_IMAGE_PATH) ? url.slice(QRIS_IMAGE_PATH.length) : null;

const PNG_SIGNATURE = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];

/** Jenis gambar dari isi berkas (bukan dari header): PNG, JPEG, atau null. */
export function imageTypeOf(
  bytes: Uint8Array,
): "image/png" | "image/jpeg" | null {
  if (PNG_SIGNATURE.every((b, i) => bytes[i] === b)) return "image/png";
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "image/jpeg";
  }
  return null;
}

export const settingsHandlers = [
  http.get(
    "/api/settings/kasir",
    withScenario(() => {
      const state = mockDb.get();
      // (K19) Publik: nomor pemilik hanya untuk sesi kasir; shiftMaxHours satu sumber dari ambang
      // Perlu perhatian.
      const kasir = requireSession(state);
      const settings: KasirSettings = {
        ...state.settings,
        ownerPhone:
          kasir instanceof Response ? null : state.settings.ownerPhone,
        shiftMaxHours: state.attentionRules.shiftMaxHours,
      };
      return HttpResponse.json(settings);
    }),
  ),
  http.get(
    `${QRIS_IMAGE_PATH}:imageId`,
    withScenario(({ params }) => {
      const id = String(params.imageId);
      // Hanya gambar QRIS yang sedang dipakai: berkas lain di penyimpanan foto (foto nota) tidak
      // pernah tersaji lewat endpoint publik ini.
      const current = qrisImageIdOf(mockDb.get().settings.qrisImageUrl);
      const stored = current === id ? mockPhotos.load(id) : undefined;
      const type = stored ? imageTypeOf(stored.bytes) : null;
      if (!stored || type === null) {
        return problem(404, "NOT_FOUND", "Gambar QRIS tidak ditemukan");
      }
      return new HttpResponse(stored.bytes.slice().buffer, {
        headers: { "Content-Type": type },
      });
    }),
  ),
];
