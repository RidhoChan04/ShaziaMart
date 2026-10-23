import type { ReactNode } from "react";
import { OwnerLoginScreen } from "./owner-login-screen";
import { useLogoutOnUnauthorized, useOwnerSession } from "./owner-session";

/**
 * Aplikasi pemilik hanya tampil setelah login. Bila sesi belum bisa diperiksa
 * (server mati), isi tetap dirender agar layout menampilkan layar offline.
 */
export function OwnerGate({ children }: { children: ReactNode }) {
  useLogoutOnUnauthorized();
  const session = useOwnerSession();
  if (session.data === null) return <OwnerLoginScreen />;
  // Bukan `isPending`: refetch setelah galat kembali "pending" dan akan melepas isi tiap kali dicoba.
  if (session.data === undefined && session.errorUpdatedAt === 0) return null;
  return children;
}
