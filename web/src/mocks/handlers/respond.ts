import { HttpResponse } from "msw";
import type {
  ErrorCode,
  Problem,
} from "@/shared/api/gen/shaziaMartAPI.schemas";
import type { MockState, MockUser } from "../db";

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

/** Pengguna sesi aktif, atau respons 401 UNAUTHORIZED. */
export function requireSession(
  state: Readonly<MockState>,
): MockUser | Response {
  const userId = state.session?.userId;
  const user = state.users.find((u) => u.id === userId);
  return user ?? problem(401, "UNAUTHORIZED", "Sesi tidak ditemukan");
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
