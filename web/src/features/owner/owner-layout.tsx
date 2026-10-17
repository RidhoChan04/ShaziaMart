import { Link, Outlet } from "@tanstack/react-router";
import {
  ChartColumn,
  Ellipsis,
  House,
  type LucideIcon,
  NotebookPen,
  Package,
  WifiOff,
} from "lucide-react";
import {
  useRecheckServer,
  useServerHealth,
} from "@/shared/components/server-status";
import { Button } from "@/shared/ui/button";

const dateFormat = new Intl.DateTimeFormat("id-ID", {
  weekday: "long",
  day: "numeric",
  month: "short",
});

/** "Sabtu, 17 Okt" */
export function formatOwnerDate(date: Date): string {
  return dateFormat.format(date);
}

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
      className="fixed inset-x-0 bottom-0 z-30 border-t border-border bg-surface pb-[env(safe-area-inset-bottom)] lg:sticky lg:top-0 lg:col-start-1 lg:row-span-2 lg:row-start-1 lg:h-dvh lg:border-t-0 lg:border-r lg:p-3"
    >
      <ul className="flex lg:flex-col lg:gap-1">
        {navItems.map(({ to, label, icon: Icon, exact }) => (
          <li key={to} className="flex-1 lg:flex-none">
            <Link
              to={to}
              activeOptions={{ exact }}
              className="flex min-h-14 flex-col items-center justify-center gap-0.5 text-xs text-muted hover:text-text data-[status=active]:font-semibold data-[status=active]:text-primary lg:min-h-11 lg:flex-row lg:justify-start lg:gap-3 lg:rounded-md lg:px-3 lg:text-[15px] lg:hover:bg-primary-soft lg:data-[status=active]:bg-primary-soft"
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

function OwnerOffline() {
  const { recheck, rechecking } = useRecheckServer();
  return (
    <div className="mx-auto flex max-w-sm flex-col items-center gap-4 py-16 text-center">
      <WifiOff aria-hidden="true" className="size-10 text-muted" />
      <h1 className="text-base font-semibold">
        Tidak bisa terhubung ke toko — pastikan PC kasir menyala dan online
      </h1>
      <Button onClick={recheck} disabled={rechecking}>
        Coba lagi
      </Button>
    </div>
  );
}

export function OwnerLayout() {
  const { online, checking } = useServerHealth();
  const offline = !online && !checking;

  return (
    <div className="min-h-dvh bg-bg lg:grid lg:grid-cols-[240px_1fr] lg:grid-rows-[auto_1fr]">
      <header className="border-b border-border bg-surface px-4 py-3 lg:col-start-2 lg:row-start-1">
        <p className="text-xs text-muted">{formatOwnerDate(new Date())}</p>
        <p className="text-base font-bold text-primary">ShaziaMart</p>
      </header>
      <OwnerNav />
      <main className="p-4 pb-24 lg:col-start-2 lg:row-start-2 lg:p-6">
        {offline ? <OwnerOffline /> : <Outlet />}
      </main>
    </div>
  );
}
