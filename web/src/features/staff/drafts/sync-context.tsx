import { createContext, type ReactNode, useContext } from "react";
import type { SyncReport } from "./sync";
import { useDraftSync } from "./use-drafts";

type StaffSync = {
  syncNow: () => Promise<SyncReport>;
  syncing: boolean;
  storageError: boolean;
};

const IDLE: StaffSync = {
  syncNow: () => Promise.resolve({ sent: [], rejected: [], stopped: null }),
  syncing: false,
  storageError: false,
};

const StaffSyncContext = createContext<StaffSync>(IDLE);

/**
 * Satu-satunya pemilik kirim otomatis draf (R29): dipasang sekali di kerangka staf agar jalan
 * di semua tab. Halaman hanya membaca `syncNow`/status lewat `useStaffSync`, tanpa pemicu kedua.
 */
export function StaffSyncProvider({
  userId,
  children,
}: {
  userId: string | null;
  children: ReactNode;
}) {
  const sync = useDraftSync(userId);
  return <StaffSyncContext value={sync}>{children}</StaffSyncContext>;
}

export const useStaffSync = (): StaffSync => useContext(StaffSyncContext);
