import { HttpResponse } from "msw";
import type {
  ErrorCode,
  Problem,
  User,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import type { MockState, MockUser } from "../db";

/** Kunci login (PIN kasir dan password pemilik): 5x salah → terkunci 5 menit. */
export const MAX_FAILURES = 5;
export const LOCK_MS = 300_000;
export const LOCK_DETAIL = "Coba lagi dalam 5 menit";

/** Pengguna publik: tanpa PIN/password. */
export const toUser = ({ id, name, role }: User): User => ({ id, name, role });

/** (K12) Pilihan login PIN di PC kasir dan HP toko: hanya akun kasir aktif. */
export const activeKasirUsers = (state: Readonly<MockState>): User[] =>
  state.users.filter((u) => u.role === "kasir" && u.active).map(toUser);

const TITLES: Record<number, string> = {
  401: "Tidak diizinkan",
  403: "Akses ditolak",
  404: "Tidak ditemukan",
  409: "Konflik",
  422: "Data tidak valid",
  423: "Terkunci",
};

/** Respons problem+json sesuai kontrak; judul berbahasa Indonesia. */
export function problem(
  status: number,
  code: ErrorCode,
  detail?: string,
  extra?: Record<string, unknown>,
): Response {
  const body: Problem = {
    type: "about:blank",
    title: TITLES[status] ?? "Kesalahan",
    status,
    code,
    ...(detail === undefined ? {} : { detail }),
    ...extra,
  };
  return HttpResponse.json(body, {
    status,
    headers: { "Content-Type": "application/problem+json" },
  });
}

/**
 * Pengguna sesi kasir (akun kasir aktif), atau respons 401 UNAUTHORIZED. (K22) Pengguna nonaktif
 * ditolak walau sesinya masih tersimpan; sesi kasir ber-id pemilik juga tidak berlaku.
 */
export function requireSession(
  state: Readonly<MockState>,
): MockUser | Response {
  const userId = state.session?.userId;
  const user = state.users.find(
    (u) => u.id === userId && u.role === "kasir" && u.active,
  );
  return user ?? problem(401, "UNAUTHORIZED", "Sesi tidak ditemukan");
}

/** Pemilik sesi pemilik aktif (terpisah dari sesi kasir), atau 401 UNAUTHORIZED. */
export function requireOwnerSession(
  state: Readonly<MockState>,
): MockUser | Response {
  const userId = state.ownerSession?.userId;
  const user = state.users.find((u) => u.id === userId && u.role === "pemilik");
  return user ?? problem(401, "UNAUTHORIZED", "Sesi pemilik tidak ditemukan");
}

export async function readJson(
  request: Request,
): Promise<Record<string, unknown> | null> {
  try {
    const body: unknown = await request.json();
    return typeof body === "object" && body !== null && !Array.isArray(body)
      ? (body as Record<string, unknown>)
      : null;
  } catch {
    return null;
  }
}

export const invalid = (detail: string): Response =>
  problem(422, "VALIDATION", detail);
