import { useQueryClient } from "@tanstack/react-query";
import { Link, Outlet, useLocation } from "@tanstack/react-router";
import {
  ChartColumn,
  Ellipsis,
  House,
  type LucideIcon,
  NotebookPen,
  Package,
  TriangleAlert,
  WifiOff,
} from "lucide-react";
import { useEffect } from "react";
import { getGetOwnerSessionQueryKey } from "@/shared/api/gen/owner/owner";
import {
  useRecheckServer,
  useServerHealth,
} from "@/shared/hooks/use-server-health";
import { Button } from "@/shared/ui/button";
import { OwnerGate } from "./auth/owner-gate";
import { useOwnerSession } from "./auth/owner-session";
import { PageHeader } from "./page-header";

type NavItem = {
  to:
    | "/owner"
    | "/owner/barang"
    | "/owner/laporan"
    | "/owner/kasbon"
    | "/owner/lainnya";
  label: string;
  icon: LucideIcon;
  exact: boolean;
};

const navItems: readonly NavItem[] = [
  { to: "/owner", label: "Beranda", icon: House, exact: true },
  { to: "/owner/barang", label: "Barang", icon: Package, exact: false },
  { to: "/owner/laporan", label: "Laporan", icon: ChartColumn, exact: false },
  { to: "/owner/kasbon", label: "Kasbon", icon: NotebookPen, exact: false },
  { to: "/owner/lainnya", label: "Lainnya", icon: Ellipsis, exact: false },
];

function OwnerNav() {
  // Satu <nav> responsif: tab bawah < 1024px, sidebar >= 1024px.
  return (
    <nav
      aria-label="Navigasi utama"
      className="glass fixed inset-x-3 bottom-[calc(12px+env(safe-area-inset-bottom))] z-30 rounded-full p-1 lg:sticky lg:inset-x-auto lg:top-3 lg:bottom-auto lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:m-3 lg:h-[calc(100dvh-24px)] lg:rounded-lg lg:p-2"
    >
      <ul className="flex gap-1 lg:flex-col">
        {navItems.map(({ to, label, icon: Icon, exact }) => (
          <li key={to} className="flex-1 lg:flex-none">
            <Link
              to={to}
              activeOptions={{ exact }}
              className="flex min-h-12 flex-col items-center justify-center gap-0.5 rounded-full text-xs text-muted hover:text-text focus-visible:outline-2 focus-visible:outline-offset-1 focus-visible:outline-primary data-[status=active]:bg-primary-soft data-[status=active]:font-semibold data-[status=active]:text-primary lg:min-h-11 lg:flex-row lg:justify-start lg:gap-3 lg:rounded-md lg:px-3 lg:text-[15px] lg:hover:bg-primary-soft"
            >
              <Icon aria-hidden="true" className="size-5" />
              {label}
            </Link>
          </li>
        ))}
      </ul>
    </nav>
  );
}

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

/** Label tab yang aktif, dicocokkan seperti `activeOptions` pada `Link` navigasi. */
function useActiveTitle(): string | undefined {
  // Seperti Link: garis miring di akhir diabaikan (start_url PWA `/owner/`).
  const path = useLocation({
    select: (l) => l.pathname.replace(/(.)\/$/, "$1"),
  });
  return navItems.find(({ to, exact }) =>
    exact ? path === to : path === to || path.startsWith(`${to}/`),
  )?.label;
}

function OwnerShell() {
  const health = useServerHealth();
  const title = useActiveTitle();
  // Sesi yang sudah termuat = data pernah dimuat; halaman tetap dipasang saat offline.
  const session = useOwnerSession();
  const loaded = session.data != null;
  const offline = !health.online && !health.checking;

  return (
    <div className="min-h-dvh bg-bg lg:grid lg:grid-cols-[240px_1fr] lg:grid-rows-[auto_1fr]">
      {title && <PageHeader title={title} />}
      <OwnerNav />
      <main className="px-4 pt-1 pb-28 lg:col-start-2 lg:row-start-2 lg:px-6 lg:pt-2 lg:pb-6">
        {loaded ? (
          <>
            {offline && <OfflineBanner />}
            <Outlet />
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
  useEffect(() => {
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
