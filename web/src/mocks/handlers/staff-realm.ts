import { type HttpResponseResolver, http } from "msw";
import type { MockState, MockUser } from "../db";
import { withScenario } from "../scenarios";
import { problem } from "./respond";

/** K19: header Cloudflare Tunnel = request dari luar Wi-Fi toko. */
export const TUNNEL_HEADERS = ["cf-connecting-ip", "cf-ray"] as const;

const viaTunnel = (request: Request): boolean =>
  TUNNEL_HEADERS.some((h) => request.headers.has(h));

const lanOnly = (): Response =>
  problem(403, "STAFF_LAN_ONLY", "Hanya bisa dipakai di Wi-Fi toko");

/** Resolver `/api/staff`: tolak request lewat terowongan sebelum apa pun, termasuk skenario. */
export function staffRealm<R extends HttpResponseResolver>(resolver: R): R {
  const inner = withScenario(resolver);
  return ((info) => (viaTunnel(info.request) ? lanOnly() : inner(info))) as R;
}

/**
 * Penjaga di depan semua handler: jalur `/api/staff` tanpa handler (atau yang
 * lupa dibungkus `staffRealm`) tetap tertolak; tanpa header, request diteruskan.
 */
export const staffTunnelGuard = http.all("/api/staff/*", ({ request }) =>
  viaTunnel(request) ? lanOnly() : undefined,
);

/** Pengguna sesi orang toko (akun kasir), atau 401; sesi kasir/pemilik tidak berlaku. */
export function requireStaffSession(
  state: Readonly<MockState>,
): MockUser | Response {
  const userId = state.staffSession?.userId;
  const user = state.users.find((u) => u.id === userId && u.role === "kasir");
  return (
    user ?? problem(401, "UNAUTHORIZED", "Sesi orang toko tidak ditemukan")
  );
}
