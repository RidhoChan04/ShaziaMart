import type { ReactNode } from "react";
import { LoadingScreen } from "@/shared/components/loading-screen";
import { useRecheckServer } from "@/shared/hooks/use-server-health";
import { StaffLoginScreen, StaffUnavailableScreen } from "./staff-login-screen";
import { useStaffLogoutOnUnauthorized, useStaffSession } from "./staff-session";

/**
 * App orang toko hanya tampil setelah login di realm `/api/staff` (sesi PC kasir
 * dan pemilik tidak berlaku). Sesi yang belum pernah bisa diperiksa (server mati,
 * ditolak di luar Wi-Fi toko) menampilkan alasannya, bukan kerangka tanpa nama.
 */
export function StaffGate({ children }: { children: ReactNode }) {
  useStaffLogoutOnUnauthorized();
  const session = useStaffSession();
  const { recheck } = useRecheckServer();
  if (session.data === null) return <StaffLoginScreen />;
  if (session.data === undefined) {
    // Bukan `isPending`: refetch setelah galat kembali "pending" dan layar galat akan berkedip tiap dicoba.
    if (session.errorUpdatedAt === 0) return <LoadingScreen />;
    return (
      <StaffUnavailableScreen
        error={session.error}
        retrying={session.isFetching}
        onRetry={() => {
          recheck();
          void session.refetch();
        }}
      />
    );
  }
  return children;
}
