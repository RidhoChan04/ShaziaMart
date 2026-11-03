import { useQueryClient } from "@tanstack/react-query";
import { Outlet, useLocation } from "@tanstack/react-router";
import {
  ChartColumn,
  Ellipsis,
  House,
  NotebookPen,
  Package,
  TriangleAlert,
  WifiOff,
} from "lucide-react";
import { useLayoutEffect } from "react";
import { getGetOwnerSessionQueryKey } from "@/shared/api/gen/owner/owner";
import { TabNav, type TabNavItem } from "@/shared/components/tab-nav";
import {
  useRecheckServer,
  useServerHealth,
} from "@/shared/hooks/use-server-health";
import { Button } from "@/shared/ui/button";
import { OwnerGate } from "./auth/owner-gate";
import { useOwnerSession } from "./auth/owner-session";
import { PageHeader } from "./page-header";

type NavItem = TabNavItem & {
  to:
    | "/owner"
    | "/owner/barang"
    | "/owner/laporan"
    | "/owner/kasbon"
    | "/owner/lainnya";
};

const navItems: readonly NavItem[] = [
  { to: "/owner", label: "Beranda", icon: House, exact: true },
  { to: "/owner/barang", label: "Barang", icon: Package, exact: false },
  { to: "/owner/laporan", label: "Laporan", icon: ChartColumn, exact: false },
  { to: "/owner/kasbon", label: "Kasbon", icon: NotebookPen, exact: false },
  { to: "/owner/lainnya", label: "Lainnya", icon: Ellipsis, exact: false },
];

function OfflineBanner() {
  return (
    <div
      role="status"
      className="mb-4 flex items-center gap-2 rounded-lg bg-surface px-4 py-3 text-sm font-medium shadow-sm"
    >
      <TriangleAlert
        aria-hidden="true"
        className="size-4 shrink-0 text-warning"
      />
      Tidak terhubung ke toko — data terakhir ditampilkan
    </div>
  );
}

/** Belum ada data sama sekali: tidak ada yang bisa ditampilkan selain ajakan coba lagi. */
function OwnerOffline() {
  const client = useQueryClient();
  const { recheck, rechecking } = useRecheckServer();
  const retry = () => {
    recheck();
    void client.refetchQueries({ queryKey: getGetOwnerSessionQueryKey() });
  };
  return (
    <div className="mx-auto mt-8 flex max-w-sm flex-col items-center gap-4 rounded-lg bg-surface p-6 py-10 text-center shadow-sm">
      <WifiOff aria-hidden="true" className="size-10 text-muted" />
      {/* h2: judul besar di kerangka adalah satu-satunya h1. */}
      <h2 className="text-base font-semibold">
        Tidak bisa terhubung ke toko — pastikan PC kasir menyala dan online
      </h2>
      <Button onClick={retry} disabled={rechecking}>
        Coba lagi
      </Button>
    </div>
  );
}

/** Judul besar kerangka: hanya di akar tab; sub-halaman (mis. /owner/barang/baru) punya header sendiri. */
function useActiveTitle(): string | undefined {
  // Seperti Link: garis miring di akhir diabaikan (start_url PWA `/owner/`).
  const path = useLocation({
    select: (l) => l.pathname.replace(/(.)\/$/, "$1"),
  });
  return navItems.find(({ to }) => path === to)?.label;
}

function OwnerShell() {
  const health = useServerHealth();
  const title = useActiveTitle();
  // Sesi yang sudah termuat = data pernah dimuat; halaman tetap dipasang saat offline.
  const session = useOwnerSession();
  const loaded = session.data != null;
  const offline = !health.online && !health.checking;

  return (
    <div className="min-h-dvh bg-bg pr-[env(safe-area-inset-right)] pl-[env(safe-area-inset-left)] lg:grid lg:grid-cols-[240px_1fr] lg:grid-rows-[auto_1fr]">
      {title && <PageHeader title={title} />}
      <TabNav label="Navigasi utama" items={navItems} />
      <main className="px-4 pt-1 pb-[calc(7rem+env(safe-area-inset-bottom))] lg:col-start-2 lg:row-start-2 lg:px-6 lg:pt-2 lg:pb-6">
        {loaded ? (
          <>
            {offline && <OfflineBanner />}
            <div className="mx-auto max-w-6xl">
              <Outlet />
            </div>
          </>
        ) : (
          <OwnerOffline />
        )}
      </main>
    </div>
  );
}

export function OwnerLayout() {
  // Di <html> (bukan wrapper) agar portal Radix (dialog) ikut token pemilik.
  useLayoutEffect(() => {
    document.documentElement.dataset.app = "owner";
    return () => {
      delete document.documentElement.dataset.app;
    };
  }, []);
  return (
    <OwnerGate>
      <OwnerShell />
    </OwnerGate>
  );
}
