import { Outlet } from "@tanstack/react-router";
import { ServerDownBar } from "@/shared/components/server-down-bar";
import { ServerStatus } from "@/shared/components/server-status";
import { useServerHealth } from "@/shared/hooks/use-server-health";
import { Button } from "@/shared/ui/button";

export function KasirLayout() {
  const { online, checking } = useServerHealth();
  const offline = !online && !checking;

  return (
    <div className="flex min-h-dvh flex-col bg-bg text-[15px]">
      <header className="flex items-center justify-between gap-4 border-b border-border bg-surface px-4 py-2">
        <span className="text-lg font-bold text-primary">ShaziaMart</span>
        <div className="flex items-center gap-3">
          <ServerStatus />
          {/* Diisi di F2. */}
          <Button variant="outline" disabled>
            Riwayat
          </Button>
          <Button variant="outline" disabled>
            Kunci
          </Button>
        </div>
      </header>
      {offline && <ServerDownBar />}
      <Outlet />
    </div>
  );
}
