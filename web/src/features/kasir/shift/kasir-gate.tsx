import type { ReactNode } from "react";
import { GateCard } from "./gate-card";
import { useGateState, useLockOnUnauthorized } from "./gate-state";
import { LockScreen } from "./lock-screen";
import { OpenShiftScreen } from "./open-shift-screen";

/** Layar kasir hanya tampil bila shift terbuka dan kasir shift sudah memasukkan PIN. */
export function KasirGate({ children }: { children: ReactNode }) {
  useLockOnUnauthorized();
  const gate = useGateState();
  switch (gate.status) {
    case "loading":
      return null;
    case "offline":
      // Bar merah server mati sudah tampil di layout.
      return (
        <GateCard title="Menunggu server">
          <p className="text-center text-muted">
            Layar kasir terbuka lagi setelah server tersambung.
          </p>
        </GateCard>
      );
    case "no-shift":
      return <OpenShiftScreen />;
    case "locked":
      return <LockScreen shift={gate.shift} />;
    case "open":
      return children;
  }
}
