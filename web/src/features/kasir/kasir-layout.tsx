import { Outlet } from "@tanstack/react-router";
import { ServerDownBar } from "@/shared/components/server-down-bar";
import { ServerStatus } from "@/shared/components/server-status";
import { useServerHealth } from "@/shared/hooks/use-server-health";
import { useGateState } from "./shift/gate-state";
import { ShiftActions, ShiftInfo } from "./shift/shift-actions";

export function KasirLayout() {
  const { online, checking } = useServerHealth();
  const offline = !online && !checking;
  const gate = useGateState();

  return (
    <div className="flex h-dvh flex-col bg-bg text-[15px]">
      <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-4 py-2">
        <span className="text-lg font-bold text-primary">ShaziaMart</span>
        <div className="flex items-center gap-3">
          {gate.status === "open" && (
            <ShiftInfo session={gate.session} shift={gate.shift} />
          )}
          <ServerStatus />
          {gate.status === "open" && <ShiftActions />}
        </div>
      </header>
      {offline && <ServerDownBar />}
      <Outlet />
    </div>
  );
}
