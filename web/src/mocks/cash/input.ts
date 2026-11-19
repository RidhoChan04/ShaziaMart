import { problem } from "../handlers/respond";

/** Panjang maksimal id dari klien (idempotensi per pembuat). */
const ID_MAX = 64;

export const idTaken = (): Response =>
  problem(409, "ID_TAKEN", "ID ini sudah dipakai pengguna lain");

export const isObj = (x: unknown): x is Record<string, unknown> =>
  typeof x === "object" && x !== null && !Array.isArray(x);

/** `id` dari klien bila string 1..64 karakter; selain itu null. */
export function clientId(input: unknown): string | null {
  const id = isObj(input) ? input.id : undefined;
  return typeof id === "string" && id.length >= 1 && id.length <= ID_MAX
    ? id
    : null;
}

/** Bilangan bulat aman ≥ 1; selain itu null. */
export const positiveInt = (v: unknown): number | null =>
  typeof v === "number" && Number.isSafeInteger(v) && v >= 1 ? v : null;

/**
 * Catatan opsional (≤ `max` karakter setelah trim): kosong/null/tanpa → null; bukan string atau
 * kepanjangan → undefined (tidak sah).
 */
export function optionalNote(
  v: unknown,
  max: number,
): string | null | undefined {
  if (v === undefined || v === null) return null;
  if (typeof v !== "string") return undefined;
  const trimmed = v.trim();
  if (trimmed.length > max) return undefined;
  return trimmed.length === 0 ? null : trimmed;
}
